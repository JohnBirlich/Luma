import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findOnlineTracks, importOnlineTrack } from '../src/data/online.js';
import { activeOnlineRefs, decodePreferences } from '../src/player/preferences.js';
import { decodeOpenverse, isOnlineExternalUrl, MAX_ONLINE_TRACKS, onlineSearchUrl, openverseLinkId, readOnlineShelf } from '../src/shared/online.js';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';

const jamendo = decodeOpenverse(jamendoRecording)!;
const commons = decodeOpenverse(commonsRecording)!;

test('catalog rows keep playable HTTPS audio candidates and accurate credits from both sources', () => {
  assert.equal(jamendo.title, 'All About Jazz');
  assert.equal(jamendo.artist, 'Brotha D');
  assert.equal(jamendo.duration, 235);
  assert.equal(jamendo.artworkUrl, jamendoRecording.thumbnail.replace('?format=json', ''));
  assert.deepEqual(jamendo.genres, ['jazz']);
  assert.equal(jamendo.online.license, 'CC BY-NC-ND 3.0');
  assert.equal(commons.audioUrl, commonsRecording.url);
  assert.equal(commons.online.licenseUrl, commonsRecording.license_url);
  for (const track of [jamendo, commons]) {
    assert.equal(isOnlineExternalUrl(track.online.page), true);
    assert.equal(isOnlineExternalUrl(track.online.licenseUrl), true);
    assert.equal(isOnlineExternalUrl(track.audioUrl), false);
  }
});

test('catalog URLs, licenses, and media locations must describe supported sources', () => {
  for (const override of [
    { source: 'untrusted' }, { mature: true }, { category: 'sound_effect' }, { id: 'bad-id' },
    { url: 'http://prod-1.storage.jamendo.com/?format=mp32&trackid=1348466' },
    { url: jamendoRecording.url.replace('1348466', '98765') },
    { url: jamendoRecording.url.replace('prod-1.storage.jamendo.com', 'prod-1.storage.jamendo.com.other.test') },
    { foreign_landing_url: 'https://www.jamendo.com:8443/track/1348466' },
    { license_url: 'https://example.test/licenses/by/3.0/' },
  ]) assert.equal(decodeOpenverse({ ...jamendoRecording, ...override }), undefined);
  assert.equal(decodeOpenverse({ ...commonsRecording, url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/unexpected.png' }), undefined);
  assert.equal(decodeOpenverse({ ...commonsRecording, thumbnail: 'https://upload.wikimedia.org/wikipedia/other.png' })?.artworkUrl, undefined);
  assert.equal(isOnlineExternalUrl(`${jamendo.online.page}?untrusted=value`), false);
  assert.equal(isOnlineExternalUrl(`${commons.online.licenseUrl}#untrusted`), false);
  assert.equal(isOnlineExternalUrl('https://user@www.jamendo.com/track/1348466'), false);
  assert.equal(isOnlineExternalUrl('https://www.jamendo.com:8080/track/1348466'), false);
});

test('search parameters and imports are confined to the official Openverse API', () => {
  const q = '  джаз & source=other  ';
  const url = onlineSearchUrl(q, 'all');
  assert.equal(url.origin, 'https://api.openverse.org');
  assert.equal(url.searchParams.get('q'), q.trim());
  assert.equal(url.searchParams.get('source'), 'jamendo,wikimedia_audio');
  assert.equal(openverseLinkId(`https://openverse.org/audio/${jamendoRecording.id.toUpperCase()}/?ref=copy`), jamendoRecording.id);
  assert.equal(openverseLinkId(`https://api.openverse.org/v1/audio/${commonsRecording.id}/`), commonsRecording.id);
  assert.equal(openverseLinkId(`https://openverse.org.example.test/audio/${jamendoRecording.id}`), undefined);
  assert.equal(openverseLinkId(`https://openverse.org/audio/${jamendoRecording.id}/thumb/`), undefined);
});

test('search strips invalid rows and the API is credential free; imports verify the returned ID', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    assert.equal(url.origin, 'https://api.openverse.org');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    return Response.json(url.pathname === '/v1/audio/' ? { results: [jamendoRecording, commonsRecording, {}, jamendoRecording] } : commonsRecording);
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await findOnlineTracks('jazz', 'jamendo', signal), [jamendo]);
  assert.deepEqual(await findOnlineTracks('jazz', 'all', signal), [jamendo, commons]);
  assert.deepEqual(await importOnlineTrack(`https://openverse.org/audio/${commonsRecording.id}`, signal), commons);
  await assert.rejects(importOnlineTrack(`https://openverse.org/audio/${jamendoRecording.id}`, signal), /не поддерживается/);
  await assert.rejects(importOnlineTrack('https://example.test/audio/unsafe', signal), /Нужна ссылка/);
  assert.equal(fetch.mock.callCount(), 4);
});

test('rate limits and oversized bodies surface clear errors instead of unbounded reads', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  const signal = new AbortController().signal;
  await assert.rejects(findOnlineTracks('jazz', 'all', signal), /ограничил поиск/);
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => new Response('x'.repeat(512 * 1024 + 1)));
  await assert.rejects(findOnlineTracks('jazz', 'all', signal), /слишком большой/);
});

test('one retry handles a temporary upstream failure without repeating rate-limited requests', async (t) => {
  let calls = 0;
  const fetch = t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? new Response(null, { status: 502 }) : Response.json({ results: [commonsRecording] }));
  const signal = new AbortController().signal;
  assert.deepEqual(await findOnlineTracks('Bach', 'wikimedia_audio', signal), [commons]);
  assert.equal(fetch.mock.callCount(), 2);
});

test('saved links and queue references restore without trusting the browser storage payload', () => {
  const wrong = { ...jamendo, audioUrl: 'file:///test.mp3' };
  const stored = decodePreferences(JSON.stringify({ onlineTracks: [jamendo, wrong, jamendo], onlineRefs: [commons], queue: { order: [commons.id] } }));
  assert.deepEqual(stored.onlineTracks, [jamendo]);
  assert.deepEqual(activeOnlineRefs(stored), [commons]);
  assert.deepEqual(activeOnlineRefs({ ...stored, queue: undefined }), []);
  assert.deepEqual(activeOnlineRefs({ ...stored, onlineTracks: [commons], favorites: [commons.id] }), []);
  assert.equal(readOnlineShelf(Array(MAX_ONLINE_TRACKS).fill(wrong).concat(commons)).length, 0);
  assert.deepEqual(decodePreferences('{"volume":0,"favorites":["old"]}').onlineTracks, []);
});
