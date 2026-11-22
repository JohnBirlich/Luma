import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { SafeStorage } from 'electron';
import { DesktopMusicServices } from '../electron/music-services.js';
import { ListeningClock } from '../src/shared/lastfm.js';
import { isCredentialService, serviceCredential } from '../src/shared/music-services.js';
import { geniusToken, jamendoClient, listenBrainzToken } from './fixtures/music-providers.mjs';

const version = '1.2.0';
const started = 1_810_000_000;
const event = { title: 'Ты здесь', artist: 'Ария', album: 'Живой звук', started, listened: 121, duration: 235, kind: 'scrobble',
  path: '/private/music/track.mp3', token: 'never submit me' };

function fixtureStorage(available = true) {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => available ? 'gnome_libsecret' : 'basic_text',
    encryptString(text: string) {
      const iv = randomBytes(16), cipher = createCipheriv('aes-256-ctr', key, iv);
      return Buffer.concat([iv, cipher.update(text), cipher.final()]);
    },
    decryptString(buffer: Buffer) {
      const decipher = createDecipheriv('aes-256-ctr', key, buffer.subarray(0, 16));
      return Buffer.concat([decipher.update(buffer.subarray(16)), decipher.final()]).toString();
    },
  } as SafeStorage;
}

test('credentials accept only known services/expected input and are not reflected to the bridge', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-services-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'music-services.bin');
  const storage = fixtureStorage();
  let requests = 0;
  const fetcher = async () => { requests++; throw new Error('not expected'); };
  assert.equal(isCredentialService('constructor'), false);
  assert.equal(serviceCredential('genius', 'token\r\nAuthorization: More'), undefined);
  const services = await DesktopMusicServices.open(file, storage, fetcher, version);
  assert.equal((await services.configure('jamendo', '://oops')).issue, 'credentials');
  assert.deepEqual(await readdir(dir), []);
  assert.equal((await services.configure('jamendo', jamendoClient)).configured, true);
  assert.equal((await services.configure('genius', geniusToken)).configured, true);
  assert.equal(requests, 0, 'configure locally; only explicit searches use read-only credentials');
  assert.deepEqual(await readdir(dir), ['music-services.bin']);
  assert.doesNotMatch((await readFile(file)).toString(), new RegExp(`${jamendoClient}|${geniusToken}`));
  const restarted = await DesktopMusicServices.open(file, storage, fetcher, version);
  assert.equal(restarted.status('jamendo').configured, true);
  assert.equal(restarted.status('genius').configured, true);
  assert.equal(restarted.status('listenbrainz').configured, false);
  assert.doesNotMatch(JSON.stringify(restarted.status('genius')), new RegExp(geniusToken));
  await restarted.remove('jamendo');
  assert.equal((await DesktopMusicServices.open(file, storage, fetcher, version)).status('jamendo').configured, false);
  await restarted.remove('genius');
  assert.deepEqual(await readdir(dir), []);
});

test('ListenBrainz validates the personal token, requires separate consent and posts one minimal local listen', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-listens-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'music-services.bin');
  const storage = fixtureStorage();
  let time = (started + 121) * 1000 + 500;
  const seen: string[] = [];
  const fetcher = async (raw: string, options: RequestInit) => {
    const url = new URL(raw), headers = new Headers(options.headers);
    assert.equal(url.origin, 'https://api.listenbrainz.org');
    assert.equal(url.search, '');
    assert.equal(headers.get('authorization'), `Token ${listenBrainzToken}`);
    assert.match(headers.get('user-agent')!, /^Luma-Player\/1\.2\.0/);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    seen.push(url.pathname);
    if (url.pathname === '/1/validate-token') {
      assert.equal(options.body, undefined);
      return Response.json({ code: 200, valid: true, user_name: 'Fixture listener', ignored: 'private' });
    }
    assert.equal(url.pathname, '/1/submit-listens');
    assert.equal(options.method, 'POST');
    assert.equal(headers.get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(options.body)), { listen_type: 'single', payload: [{ listened_at: started + 122, track_metadata: {
      artist_name: event.artist, track_name: event.title, release_name: event.album,
      additional_info: { duration_ms: 235_000, media_player: 'Luma Player', submission_client: 'Luma Player', submission_client_version: version },
    } }] });
    return Response.json({ status: 'ok' });
  };
  const open = () => DesktopMusicServices.open(file, storage, fetcher, version, () => time);
  const services = await open();
  await services.recordLocal('track-one', event);
  assert.deepEqual(seen, []);
  const credentials = await services.configure('listenbrainz', listenBrainzToken);
  assert.deepEqual(credentials, { configured: true, persistent: true, user: 'Fixture listener', enabled: false, issue: undefined });
  await services.recordLocal('track-one', event);
  assert.deepEqual(seen, ['/1/validate-token']);
  assert.equal((await open()).status('listenbrainz').enabled, false);
  assert.equal((await services.enableListens(true)).enabled, true);
  await services.recordLocal('pre-consent', event);
  assert.deepEqual(seen, ['/1/validate-token']);
  time = (started + 243) * 1000;
  const listen = { ...event, started: started + 122 };
  await services.recordLocal('track-one', { ...listen, kind: 'now' });
  await services.recordLocal('track-one', { ...listen, listened: 10 });
  await services.recordLocal('track-one', { ...listen, title: 'Без названия' });
  assert.deepEqual(seen, ['/1/validate-token']);
  await services.recordLocal('track-one', listen);
  await services.recordLocal('track-one', listen);
  assert.deepEqual(seen, ['/1/validate-token', '/1/submit-listens']);
  assert.equal((await open()).status('listenbrainz').enabled, true);
  assert.equal((await services.enableListens(false)).enabled, false);
  await services.recordLocal('track-two', listen);
  assert.equal((await open()).status('listenbrainz').enabled, false);
  assert.deepEqual(seen, ['/1/validate-token', '/1/submit-listens']);
  assert.equal((await services.remove('listenbrainz')).configured, false);
  assert.deepEqual(await readdir(dir), []);
});

test('ListenBrainz settings are session-only without OS encryption, and revoking consent aborts pending work', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-listens-session-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'music-services.bin');
  const storage = fixtureStorage(false);
  let time = started * 1000 - 1000;
  let arrive!: (signal: AbortSignal) => void;
  const posted = new Promise<AbortSignal>((resolve) => { arrive = resolve; });
  const fetcher = async (url: string, options: RequestInit) => {
    if (url.endsWith('/validate-token')) return Response.json({ valid: true, user_name: 'Temporary fixture' });
    const signal = options.signal!;
    arrive(signal);
    return new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  const services = await DesktopMusicServices.open(file, storage, fetcher, version, () => time);
  assert.equal((await services.configure('listenbrainz', listenBrainzToken)).persistent, false);
  assert.equal((await services.enableListens(true)).enabled, true);
  time = (started + 122) * 1000;
  const pending = services.recordLocal('track-one', event);
  const pendingSignal = await posted;
  await services.enableListens(false);
  assert.equal(pendingSignal.aborted, true);
  await pending;
  assert.equal(services.status('listenbrainz').issue, undefined);
  assert.deepEqual(await readdir(dir), []);
  assert.equal((await DesktopMusicServices.open(file, storage, fetcher, version)).status('listenbrainz').configured, false);
});

test('the real deck clock counts elapsed listening, not seek jumps, and keeps session-only catalogs out', () => {
  const track = { id: 'local', title: event.title, artist: event.artist, album: event.album, duration: 36, audioUrl: 'luma://app/media/audio/local' };
  assert.equal(ListeningClock.start({ ...track, id: 'jamendo-1848357' }, started), undefined);
  assert.equal(ListeningClock.start({ ...track, demo: true }, started), undefined);
  const clock = ListeningClock.start(track, started)!;
  assert.equal(clock.sample(0, 0, 36, 1), undefined);
  assert.equal(clock.sample(22, 1, 36, 1), undefined);
  clock.interrupt();
  assert.equal(clock.sample(0, 2, 36, 1), undefined);
  for (let seconds = 1; seconds <= 17; seconds++) assert.equal(clock.sample(seconds, seconds + 2, 36, 1), undefined);
  assert.equal(clock.sample(18, 20, 36, 1)?.kind, 'scrobble');
  assert.equal(clock.sample(19, 21, 36, 1), undefined);
});
