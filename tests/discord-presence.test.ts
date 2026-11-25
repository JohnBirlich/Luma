import assert from 'node:assert/strict';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { DesktopDiscord, DiscordFrames, discordFrame, discordPipe } from '../electron/discord-presence.js';
import { DISCORD_APP_ID, readDiscordPreferences } from '../src/shared/discord-presence.js';

const client = '123456789012345678';

test('Discord uses Luma’s own application unless a profile opted out; packets are bounded', () => {
  assert.deepEqual(readDiscordPreferences({ clientId: '', enabled: true }), { clientId: DISCORD_APP_ID, enabled: true });
  assert.deepEqual(readDiscordPreferences({ clientId: '', enabled: false }), { clientId: DISCORD_APP_ID, enabled: true });
  assert.deepEqual(readDiscordPreferences({ clientId: client, enabled: 'true' }), { clientId: client, enabled: false });
  assert.deepEqual(readDiscordPreferences({ clientId: client, enabled: true }), { clientId: client, enabled: true });
  assert.equal(discordPipe(0), '\\\\.\\pipe\\discord-ipc-0');
  const frames = new DiscordFrames();
  const data = discordFrame(1, { cmd: 'TEST' });
  assert.deepEqual(frames.push(data.subarray(0, 3)), []);
  assert.deepEqual(frames.push(data.subarray(3)), [{ opcode: 1, body: data.subarray(8) }]);
  const invalid = Buffer.alloc(8); invalid.writeUInt32LE(70_000, 4);
  assert.throws(() => frames.push(invalid), /Invalid/);
});

test('local Discord IPC sends only allowed metadata after READY and clears on disable', { timeout: 7_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'luma-discord-'));
  const path = process.platform === 'win32' ? `\\\\.\\pipe\\luma-test-presence-${process.pid}` : join(root, 'rpc.sock');
  const messages: { opcode: number; json: Record<string, any> }[] = [];
  const server = createServer((socket) => {
    const reader = new DiscordFrames();
    socket.on('error', () => {});
    socket.on('data', (bytes) => {
      for (const { opcode, body } of reader.push(bytes)) {
        messages.push({ opcode, json: JSON.parse(body.toString()) });
        if (opcode === 0) socket.write(discordFrame(1, { cmd: 'DISPATCH', evt: 'READY' }));
      }
    });
  });
  const rpc = new DesktopDiscord(true, () => createConnection(path));
  async function until(count: number) {
    for (let tries = 0; tries < 45 && messages.length < count; tries++) await delay(20);
    assert.equal(messages.length, count);
  }
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
    const metadata = { title: 'Test title', artist: 'Test artist', audioUrl: 'file:///C:/do-not-send.mp3', id: 'not-sent' };
    rpc.update('', metadata);
    assert.equal(rpc.status(), 'off');
    rpc.update(client, metadata);
    await until(2);
    assert.equal(rpc.status(), 'connected');
    assert.deepEqual(messages[0], { opcode: 0, json: { v: 1, client_id: client } });
    assert.equal(messages[1].json.cmd, 'SET_ACTIVITY');
    assert.deepEqual(messages[1].json.args, { pid: process.pid, activity: { type: 2, details: 'Test title', state: 'Test artist', instance: false } });
    rpc.update(client, metadata);
    rpc.update('', null);
    await until(3);
    assert.equal(messages[2].json.args.activity, null);
    assert.equal(rpc.status(), 'off');
  } finally {
    rpc.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { force: true, recursive: true });
  }
});
