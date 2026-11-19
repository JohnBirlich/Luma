import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SafeStorage } from 'electron';
import { lastFmConfig, DesktopLastFm, signedLastFm } from '../electron/lastfm';
import { ListeningClock, scrobbleAfter } from '../src/shared/lastfm';

const track = { id: 'one', audioUrl: 'test.mp3', artist: 'Артист', title: 'Песня', album: 'Альбом', duration: 48 };
const key = 'a'.repeat(32), secret = 'f'.repeat(32);

test('signatures use lexicographic fields, UTF-8 and never include the response format or callback', () => {
  const form = signedLastFm({ method: 'track.scrobble', api_key: key, track: 'Песня', sk: 'x', callback: 'ignored', format: 'xml' }, secret);
  assert.equal(form.get('format'), 'json');
  assert.equal(form.get('api_sig'), createHash('md5').update(`api_key${key}methodtrack.scrobbleskxtrackПесня${secret}`).digest('hex'));
  assert.equal(form.has('callback'), false);
});

test('count actual playback, exclude seeks and pauses, and keep the threshold and demos separate', () => {
  assert.equal(ListeningClock.start({ ...track, demo: true }, 100), undefined);
  assert.equal(scrobbleAfter(30), Infinity);
  assert.equal(scrobbleAfter(1000), 240);
  const clock = ListeningClock.start(track, 100)!;
  assert.equal(clock.now(track.duration).kind, 'now');
  for (let i = 0; i <= 10; i++) assert.equal(clock.sample(i, i, 48, 1), undefined);
  clock.interrupt();
  assert.equal(clock.sample(38, 28, 48, 1), undefined);
  for (let i = 1; i <= 8; i++) assert.equal(clock.sample(38 + i, 28 + i, 48, 1), undefined);
  clock.interrupt();
  for (let i = 0; i < 6; i++) assert.equal(clock.sample(i, 80 + i, 48, 1), undefined);
  assert.equal(clock.sample(6, 86, 48, 1)?.listened, 24);
  assert.equal(clock.sample(7, 87, 48, 1), undefined);
});

test('desktop authorization and opt-in are separate; only signed main-process requests receive the session key', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'luma-lastfm-'));
  const file = join(temp, 'session');
  const posts: URLSearchParams[] = [];
  const calls: string[] = [];
  const token = 't'.repeat(32), sessionKey = 'b'.repeat(32);
  const store = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (value: string) => Buffer.from(value).map((byte) => byte ^ 0xaa),
    decryptString: (value: Buffer) => value.map((byte) => byte ^ 0xaa).toString('utf8') } as unknown as SafeStorage;
  try {
    const fetcher = async (url: string, init?: RequestInit) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://ws.audioscrobbler.com');
      assert.equal(init?.credentials, 'omit');
      if (parsed.searchParams.get('method') === 'auth.getToken') { calls.push('token'); return Response.json({ token }); }
      if (parsed.searchParams.get('method') === 'auth.getSession') { calls.push('session'); return Response.json({ session: { name: 'Listener', key: sessionKey } }); }
      posts.push(init?.body as URLSearchParams);
      return Response.json({ scrobbles: { '@attr': { accepted: 1 } } });
    };
    const client = await DesktopLastFm.open(lastFmConfig(key, secret), fetcher, file, store);
    assert.equal(client.status().enabled, false);
    assert.equal((await client.begin(async (url) => { assert.equal(new URL(url).hostname, 'www.last.fm'); assert.equal(new URL(url).searchParams.get('token'), token); })).waiting, true);
    const connected = await client.finish();
    assert.deepEqual(JSON.parse(JSON.stringify(connected)), { configured: true, persistent: true, user: 'Listener', enabled: false });
    assert.deepEqual(calls, ['token', 'session']);
    const event = { kind: 'now', title: track.title, artist: track.artist, started: Math.floor(Date.now() / 1000), duration: 48, listened: 0 };
    await client.record(event);
    assert.equal(posts.length, 0);
    await client.enable(true);
    await client.record({ ...event, kind: 'scrobble' }); // No play time.
    await client.record({ ...event, started: Math.floor(Date.now() / 1000) });
    await client.record({ ...event, started: Math.floor(Date.now() / 1000) });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].get('method'), 'track.updateNowPlaying');
    assert.equal(posts[0].get('sk'), sessionKey);
    assert.ok(!(await readFile(file)).includes(sessionKey));
    const restored = await DesktopLastFm.open(lastFmConfig(key, secret), fetcher, file, store);
    assert.equal(restored.status().enabled, true);
    assert.equal((await restored.disconnect()).user, undefined);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});
