import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMusicBrainzLookup, readMusicBrainzCandidates, readMusicBrainzQuery } from '../src/shared/musicbrainz.js';
import { isMetadataPage } from '../src/shared/recognition.js';
import { alternateRecording, recording } from './fixtures/musicbrainz.mjs';

const query = { title: 'Крошка моя', artist: 'Руки Вверх', duration: 250, isrc: 'RU-A1B-98-00001' };
const signal = new AbortController().signal;

test('MusicBrainz preserves recording versions, artist credits and source links without guessing the album', () => {
  const item = { ...recording, 'artist-credit': [
    { name: 'Primary Artist', artist: { name: 'Alternate credit' }, joinphrase: ' feat. ' }, { artist: { name: 'Guest' } },
  ], url: 'https://elsewhere.test/audio', previewUrl: 'https://elsewhere.test/preview' };
  const data = { recordings: [alternateRecording, item, { ...item, id: 'malicious/path' }, { ...item, video: true }, item] };
  const candidates = readMusicBrainzCandidates(data, readMusicBrainzQuery(query)!);
  assert.deepEqual(candidates.map(({ isrc }) => isrc), ['RUA1B9800001', 'RUA1B1300001']);
  assert.equal(candidates[0].artist, 'Primary Artist feat. Guest');
  assert.equal(candidates[0].duration, 250);
  assert.equal(candidates[0].source, 'musicbrainz');
  assert.equal(candidates[0].album, undefined);
  assert.deepEqual(candidates[0].releaseTitles, ['Сделай погромче!', 'Сборник']);
  assert.equal(candidates[0].year, '1998');
  assert.ok(candidates.every(({ page }) => isMetadataPage(page)));
  assert.ok(candidates.every((row) => !('previewUrl' in row) && !('url' in row)));
  assert.equal(candidates[1].album, 'Ремиксы');
  assert.equal(candidates[1].disambiguation, 'remix');
  assert.equal(readMusicBrainzCandidates(data, { ...readMusicBrainzQuery(query)!, album: 'Сборник' })[0].album, 'Сборник');
});

test('MusicBrainz searches a fixed host without keys, guards queries, and only sends name, credit and valid ISRC', async () => {
  let calls = 0;
  const title = 'A "quoted" \\song';
  const find = createMusicBrainzLookup(async (url, init) => {
    calls++;
    const target = new URL(url);
    assert.equal(`${target.origin}${target.pathname}`, 'https://musicbrainz.org/ws/2/recording');
    assert.deepEqual([...target.searchParams.keys()], ['fmt', 'limit', 'query']);
    assert.equal(target.searchParams.get('fmt'), 'json');
    assert.equal(target.searchParams.get('query'), String.raw`(isrc:RUA1B9800001 OR (recording:"A \"quoted\" \\song" AND artist:"Руки Вверх")) AND NOT video:true`);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('User-Agent'), 'LumaPlayer/1.0.0 (https://github.com/JohnBirlich/VKX-Modded)');
    assert.equal(headers.has('Authorization'), false);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined);
    return Response.json({ recordings: [recording] });
  }, '1.0.0');
  assert.deepEqual(await find({ title: '*' }, signal), []);
  const input = { ...query, title, album: 'Сборник', path: '/private/file.mp3', audio: 'never sent', url: 'https://elsewhere.test' };
  const result = await find(input, signal);
  assert.equal(result[0].album, 'Сборник');
  assert.deepEqual(await find(input, signal), result);
  await assert.rejects(find({ title: 'Иная запись' }, signal), /Подождите/);
  assert.equal(calls, 1);
  assert.equal(readMusicBrainzQuery({ title: 'x'.repeat(257) }), undefined);
  assert.equal(readMusicBrainzQuery({ title: 'Ж', artist: 'Неизвестный исполнитель', isrc: '*:*' })?.artist, undefined);
  assert.equal(readMusicBrainzQuery({ title: 'Ж', artist: 'Неизвестный исполнитель', isrc: '*:*' })?.isrc, undefined);
});

test('MusicBrainz honors cooldown without retrying and discards oversized responses', async () => {
  let calls = 0;
  const find = createMusicBrainzLookup(async () => {
    calls++;
    return new Response(null, { status: 503, headers: { 'Retry-After': '120' } });
  }, '1.0.0');
  await assert.rejects(find(query, signal), /недоступен/);
  await assert.rejects(find(query, signal), /Подождите/);
  await assert.rejects(find(query, AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(calls, 1);
  const large = createMusicBrainzLookup(async () => new Response('x'.repeat(512 * 1024 + 1)), '1.0.0');
  await assert.rejects(large(query, signal), /большой/);
});
