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
const store = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: (value: string) => Buffer.from(value).map((byte) => byte ^ 0xaa),
  decryptString: (value: Buffer) => value.map((byte) => byte ^ 0xaa).toString('utf8') } as unknown as SafeStorage;

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
    assert.deepEqual(JSON.parse(JSON.stringify(connected)), { configured: true, persistent: true, configuration: 'environment', user: 'Listener', enabled: false });
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

test('saved Last.fm keys survive restart, stay encrypted, and can be forgotten independently of login', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'luma-lastfm-keys-'));
  const file = join(temp, 'session');
  const token = 'u'.repeat(32), sessionKey = 'v'.repeat(32);
  const fetcher = async (url: string) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('api_key'), key);
    assert.ok(!url.includes(secret));
    return query.get('method') === 'auth.getToken' ? Response.json({ token }) : Response.json({ session: { name: 'Listener', key: sessionKey } });
  };
  try {
    const client = await DesktopLastFm.open(undefined, fetcher, file, store);
    assert.equal((await client.configure(43, secret)).issue, 'credentials');
    assert.equal(client.status().configured, false);
    assert.equal((await client.configure('  ' + key, secret + '\n')).configuration, 'local');
    const fileData = await readFile(file);
    assert.ok(!fileData.includes(key) && !fileData.includes(secret));
    const restored = await DesktopLastFm.open(undefined, fetcher, file, store);
    assert.equal(restored.status().configuration, 'local');
    await restored.begin(async () => {});
    const connected = await restored.finish();
    assert.equal(connected.user, 'Listener');
    assert.equal(connected.enabled, false);
    assert.ok(![key, secret, token, sessionKey].some((value) => JSON.stringify(connected).includes(value)));
    assert.equal((await restored.disconnect()).configured, true);
    const after = await DesktopLastFm.open(undefined, fetcher, file, store);
    assert.equal(after.status().user, undefined);
    assert.equal(after.status().configuration, 'local');
    assert.equal((await after.forgetCredentials()).configured, false);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
    const temporary = await DesktopLastFm.open(undefined, fetcher, file, { ...store, isEncryptionAvailable: () => false } as SafeStorage);
    assert.equal((await temporary.configure(key, secret)).persistent, false);
    assert.equal(temporary.status().configured, true);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('Last.fm handles provider codes without losing credentials or opening an unauthorized page', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'luma-lastfm-retry-'));
  const file = join(temp, 'session');
  const token = 'x'.repeat(32), sessionKey = 'y'.repeat(32);
  let reply = Response.json({ error: 11, message: `Unsafe provider error ${secret}` });
  let opened = 0;
  try {
    const client = await DesktopLastFm.open(lastFmConfig(key, secret), async () => reply, file, store);
    const begin = () => client.begin(async (url) => { assert.equal(new URL(url).origin, 'https://www.last.fm'); opened++; });
    const offline = await begin();
    assert.equal(offline.issue, 'service');
    assert.equal(offline.apiCode, 11);
    assert.equal(offline.configured, true);
    assert.equal(offline.waiting, undefined);
    assert.ok(!JSON.stringify(offline).includes(secret));
    for (const [apiCode, issue] of [[10, 'key'], [13, 'signature'], [26, 'suspended'], [29, 'rate'], [16, 'service']] as const) {
      reply = Response.json({ error: apiCode }, { status: 400 });
      const failed = await begin();
      assert.equal(failed.issue, issue);
      assert.equal(failed.apiCode, apiCode);
    }
    assert.equal(opened, 0);
    reply = Response.json({ token });
    assert.equal((await begin()).waiting, true);
    assert.equal(opened, 1);
    reply = Response.json({ error: 14 }, { status: 403 });
    const notYet = await client.finish();
    assert.equal(notYet.issue, 'authorize');
    assert.equal(notYet.waiting, true);
    reply = Response.json({ error: 15 }, { status: 403 });
    const expired = await client.finish();
    assert.equal(expired.issue, 'tokenExpired');
    assert.equal(expired.waiting, undefined);
    reply = Response.json({ token });
    await begin();
    reply = Response.json({ session: { name: 'Listener', key: sessionKey } });
    assert.equal((await client.finish()).user, 'Listener');
    assert.equal(opened, 2);
    await client.enable(true);
    reply = Response.json({ error: 9 }, { status: 403 });
    await client.record({ kind: 'now', title: track.title, artist: track.artist, duration: 48, listened: 0, started: Math.floor(Date.now() / 1000) });
    assert.equal(client.status().issue, 'expired');
    assert.equal(client.status().user, undefined);
    assert.equal(client.status().configured, true);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});
