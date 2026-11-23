import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamAudius } from '../electron/audius-stream.js';
import { decodePreferences, encodePreferences } from '../src/player/preferences.js';
import { createCommunitySearch } from '../src/shared/community-catalogs.js';
import { commonsMp3Export, isOnlineExternalUrl, readOnlineTrack } from '../src/shared/online.js';
import { audiusSearchUrl, audiusTracks } from '../src/shared/public-catalogs.js';
import { ListeningClock } from '../src/shared/lastfm.js';
import { decodeOpenverse } from '../src/shared/online.js';
import { startQueue } from '../src/shared/queue.js';
import { audiusRecording, creatorStream, storageStream } from './fixtures/public-catalogs.mjs';
import { jamendoRecording } from './fixtures/openverse.mjs';

const [audius] = audiusTracks({ data: [audiusRecording] });
const jamendo = decodeOpenverse(jamendoRecording)!;

test('Audius only offers available, ungated full streams and ignores search payload URLs', () => {
  assert.equal(audius.audioUrl, 'luma://app/media/audius/DX0Xb');
  assert.equal(audius.online.page, 'https://audius.co/EIME/siberian-jazz');
  assert.equal(audius.online.licenseUrl, '');
  assert.ok(isOnlineExternalUrl(audius.online.page));
  assert.deepEqual(readOnlineTrack(audius), audius);
  assert.equal(commonsMp3Export(audius), false);
  for (const override of [{ id: '../v1' }, { is_streamable: false }, { is_available: false }, { is_stream_gated: true },
    { is_unlisted: true }, { access: { stream: false } }, { allowed_api_keys: ['other-app'] }, { stream_conditions: { some_gate: true } },
    { permalink: '//example.org/artist/track' }, { parental_warning_type: 'explicit' }, { is_delete: true }]) {
    assert.deepEqual(audiusTracks({ data: [{ ...audiusRecording, ...override }] }), []);
  }
  assert.equal(readOnlineTrack({ ...audius, audioUrl: creatorStream }), undefined);
  assert.equal(readOnlineTrack({ ...audius, audioUrl: 'luma://app/media/audius/z1234' }), undefined);
  assert.ok(isOnlineExternalUrl('https://audius.co/legal/api-terms'));
  assert.ok(!isOnlineExternalUrl('https://audius.co/legal/api-terms?next=https://example.org'));
});

test('Audius can find a full-stream candidate beyond the old 12 results without widening entitlement', () => {
  const filtered = Array.from({ length: 12 }, () => ({ ...audiusRecording, is_stream_gated: true, access: { stream: false }, preview: { url: 'https://example.invalid/preview' } }));
  const later = { ...audiusRecording, id: 'QVlxV', title: 'Ambient New Start #2', user: { name: 'Ob_Sounds' },
    duration: 344, permalink: '/Ob_sounds/ambient-new-start-2' };
  const tracks = audiusTracks({ data: [...filtered, later] });
  assert.deepEqual(tracks.map(({ id, title, duration, audioUrl }) => ({ id, title, duration, audioUrl })), [
    { id: 'audius-QVlxV', title: 'Ambient New Start #2', duration: 344, audioUrl: 'luma://app/media/audius/QVlxV' },
  ]);
  assert.equal(commonsMp3Export(tracks[0]), false);
  assert.equal(audiusTracks({ data: [...Array(36).fill(filtered[0]), later] }).length, 0);
  const many = Array.from({ length: 36 }, (_, index) => ({ ...later, id: `F${100 + index}` }));
  assert.equal(audiusTracks({ data: many }).length, 20);
});

test('Audius is bounded and throttled separately from Internet Archive', async () => {
  const query = 'Газ & jazz';
  assert.equal(audiusSearchUrl(query).searchParams.get('limit'), '36');
  const urls: URL[] = [];
  const catalog = createCommunitySearch(async (value, options) => {
    const url = new URL(value);
    urls.push(url);
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    if (url.origin === 'https://archive.org') return new Response(null, { status: 429, headers: { 'Retry-After': '40' } });
    assert.equal(url.origin, 'https://api.audius.co');
    assert.equal(url.searchParams.get('query'), query);
    return Response.json({ data: [audiusRecording, audiusRecording] });
  });
  const results = await Promise.allSettled([catalog.search(1, query, 'netlabels'), catalog.search(2, query, 'audius')]);
  assert.deepEqual(results[1], { status: 'fulfilled', value: { tracks: [audius] } });
  assert.deepEqual(results[0], { status: 'fulfilled', value: { tracks: [], issue: 'quota' } });
  assert.deepEqual(await catalog.search(3, query, 'southern_city'), { tracks: [], issue: 'quota' });
  assert.equal(urls.length, 2);
  assert.deepEqual(await catalog.search(4, query, 'ccmixter'), { tracks: [] }, 'an unverified catalog is not queried');
  assert.deepEqual(await catalog.search(5, query, 'https://example.org'), { tracks: [] });
});

test('Audius playback uses bounded official resolution, forwards ranges and never stores stream URLs', async () => {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const request = new Request(audius.audioUrl, { headers: { Range: 'bytes=24-26' } });
  let calls = 0;
  const response = await streamAudius(async (url, options, redirect) => {
    calls++;
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.redirect, 'error');
    if (calls === 1) {
      assert.equal(redirect, undefined);
      const parsed = new URL(url);
      assert.equal(parsed.origin + parsed.pathname, 'https://api.audius.co/v1/tracks/DX0Xb/stream');
      assert.equal(parsed.searchParams.get('no_redirect'), 'true');
      return Response.json({ data: creatorStream });
    }
    assert.equal(url, creatorStream);
    assert.ok(redirect?.(307, 'GET', storageStream));
    assert.ok(!redirect?.(302, 'GET', storageStream));
    assert.ok(!redirect?.(307, 'POST', storageStream));
    for (const unsafe of [storageStream.replace('https:', 'http:'), storageStream.replace('/nfi/', '/other/'),
      storageStream.replace('validator.', 'another.'), storageStream.replace('/nfi/', '/nfi/X'),
      storageStream.replace('X-Amz-Signature', 'unrelated'), storageStream.replace('https://', 'https://user@'), storageStream + '#fragment']) {
      assert.ok(!redirect?.(307, 'GET', unsafe));
    }
    assert.equal(new Headers(options?.headers).get('Range'), 'bytes=24-26');
    return new Response('mp3', { status: 206, headers: { 'Content-Range': 'bytes 24-26/99', 'Content-Type': 'audio/mpeg' } });
  }, 'DX0Xb', request, headers);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 24-26/99');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(await response.text(), 'mp3');
  assert.equal(calls, 2);

  for (const url of [creatorStream.replace('creatornode.audius.co', 'different.example'), creatorStream.replace('/cidstream/', '/other/'), creatorStream + '#foo']) {
    calls = 0;
    assert.equal((await streamAudius(async () => { calls++; return Response.json({ data: url }); }, 'DX0Xb', request, new Headers())).status, 502);
    assert.equal(calls, 1);
  }
});

test('session-only Audius references are never serialized with playlists, history, or queues', () => {
  assert.equal(ListeningClock.start(audius, 100), undefined);
  assert.ok(ListeningClock.start(jamendo, 100));
  const playlist = { id: 'list-a15ebae8-9d94-4a93-b858-693a3ffd8387', title: 'Mixtape', trackIds: [audius.id, jamendo.id] };
  const preferences = { ...decodePreferences(null), onlineRefs: [jamendo, audius], onlineTracks: [audius], playlists: [playlist],
    favorites: [audius.id], recent: [audius.id, jamendo.id] };
  const queue = startQueue(['local', audius.id, jamendo.id], audius.id);
  const data = encodePreferences(preferences, queue);
  assert.doesNotMatch(data, /Audius|audius-|DX0Xb|Siberian Jazz/);
  const restored = decodePreferences(data);
  assert.deepEqual(restored.onlineRefs, [jamendo]);
  assert.deepEqual(restored.playlists[0].trackIds, [jamendo.id]);
  assert.deepEqual(restored.queue?.order, ['local', jamendo.id]);
  assert.equal(restored.queue?.currentId, null);
  assert.deepEqual(decodePreferences(JSON.stringify({ ...preferences, queue })).onlineTracks, []);
});
