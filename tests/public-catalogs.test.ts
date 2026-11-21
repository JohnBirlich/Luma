import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamAudius } from '../electron/audius-stream.js';
import { decodePreferences, encodePreferences } from '../src/player/preferences.js';
import { createCommunitySearch } from '../src/shared/community-catalogs.js';
import { commonsMp3Export, isOnlineExternalUrl, readOnlineTrack } from '../src/shared/online.js';
import { publicCatalogTracks, publicCatalogUrl } from '../src/shared/public-catalogs.js';
import { startQueue } from '../src/shared/queue.js';
import { audiusRecording, ccMixterUrl, creatorStream, remixRecording } from './fixtures/public-catalogs.mjs';

const [audius] = publicCatalogTracks({ data: [audiusRecording] }, 'audius');
const [remix] = publicCatalogTracks([remixRecording], 'ccmixter');

test('ccMixter normalizes official primary MP3s and credits, not stems or unrelated hosts', () => {
  assert.deepEqual(publicCatalogTracks([remixRecording, remixRecording], 'ccmixter'), [remix]);
  assert.equal(remix.id, 'ccmixter-71367');
  assert.equal(remix.audioUrl, ccMixterUrl);
  assert.equal(remix.duration, 156);
  assert.equal(remix.online.license, 'CC BY-NC 3.0');
  assert.ok(isOnlineExternalUrl(remix.online.page));
  assert.deepEqual(readOnlineTrack(remix), remix);
  assert.equal(commonsMp3Export(remix), false);
  const [file] = remixRecording.files;
  for (const override of [{ file_upload: 12 }, { file_order: 1 }, { file_is_remote: 1 },
    { download_url: ccMixterUrl.replace('/airtone/', '/elsewhere/') }, { download_url: ccMixterUrl.replace('.mp3', '%2Fbad.mp3') },
    { download_url: ccMixterUrl.replace('ccmixter.org', 'ccmixter.org.example') }]) {
    assert.deepEqual(publicCatalogTracks([{ ...remixRecording, files: [{ ...file, ...override }] }], 'ccmixter'), []);
  }
  assert.deepEqual(publicCatalogTracks([{ ...remixRecording, license_url: '' }], 'ccmixter'), []);
  assert.deepEqual(publicCatalogTracks([{ ...remixRecording, upload_extra: { nsfw: true } }], 'ccmixter'), []);
  assert.equal(readOnlineTrack({ ...remix, id: 'ccmixter-1' }), undefined);
});

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
    assert.deepEqual(publicCatalogTracks({ data: [{ ...audiusRecording, ...override }] }, 'audius'), []);
  }
  assert.equal(readOnlineTrack({ ...audius, audioUrl: creatorStream }), undefined);
  assert.equal(readOnlineTrack({ ...audius, audioUrl: 'luma://app/media/audius/z1234' }), undefined);
  assert.ok(isOnlineExternalUrl('https://audius.co/legal/api-terms'));
  assert.ok(!isOnlineExternalUrl('https://audius.co/legal/api-terms?next=https://example.org'));
});

test('new catalog requests are separately bounded and quotas do not cross origins', async () => {
  const query = 'Газ & jazz';
  assert.equal(publicCatalogUrl(query, 'ccmixter').searchParams.get('reqtags'), 'remix');
  const urls: URL[] = [];
  const catalog = createCommunitySearch(async (value, options) => {
    const url = new URL(value);
    urls.push(url);
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    if (url.origin === 'https://ccmixter.org') return new Response(null, { status: 429, headers: { 'Retry-After': '40' } });
    assert.equal(url.origin, 'https://api.audius.co');
    assert.equal(url.searchParams.get('query'), query);
    return Response.json({ data: [audiusRecording] });
  });
  const results = await Promise.allSettled([catalog.search(1, query, 'ccmixter'), catalog.search(2, query, 'audius')]);
  assert.deepEqual(results[1], { status: 'fulfilled', value: [audius] });
  assert.equal(results[0].status, 'rejected');
  assert.equal(urls[0].searchParams.get('s'), query);
  await assert.rejects(catalog.search(3, query, 'ccmixter'), /недоступен/);
  assert.equal(urls.length, 2);
  assert.deepEqual(await catalog.search(3, query, 'https://example.org'), []);
});

test('Audius playback uses bounded official resolution, forwards ranges and never stores stream URLs', async () => {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const request = new Request(audius.audioUrl, { headers: { Range: 'bytes=24-26' } });
  let calls = 0;
  const response = await streamAudius(async (url, options) => {
    calls++;
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.redirect, 'error');
    if (calls === 1) {
      const parsed = new URL(url);
      assert.equal(parsed.origin + parsed.pathname, 'https://api.audius.co/v1/tracks/DX0Xb/stream');
      assert.equal(parsed.searchParams.get('no_redirect'), 'true');
      return Response.json({ data: creatorStream });
    }
    assert.equal(url, creatorStream);
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
  const playlist = { id: 'list-a15ebae8-9d94-4a93-b858-693a3ffd8387', title: 'Mixtape', trackIds: [audius.id, remix.id] };
  const preferences = { ...decodePreferences(null), onlineRefs: [remix, audius], onlineTracks: [audius], playlists: [playlist],
    favorites: [audius.id], recent: [audius.id, remix.id] };
  const queue = startQueue(['local', audius.id, remix.id], audius.id);
  const data = encodePreferences(preferences, queue);
  assert.doesNotMatch(data, /Audius|audius-|DX0Xb|Siberian Jazz/);
  const restored = decodePreferences(data);
  assert.deepEqual(restored.onlineRefs, [remix]);
  assert.deepEqual(restored.playlists[0].trackIds, [remix.id]);
  assert.deepEqual(restored.queue?.order, ['local', remix.id]);
  assert.equal(restored.queue?.currentId, null);
  assert.deepEqual(decodePreferences(JSON.stringify({ ...preferences, queue })).onlineTracks, []);
});
