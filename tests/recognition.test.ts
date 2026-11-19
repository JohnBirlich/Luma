import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMetadataService, readLimitedBody } from '../src/shared/metadata-service.js';
import { ACOUSTID_LOOKUP_URL, isFingerprint, isMetadataPage, metadataQueries, musicStorefront, rankAppleCandidates, readAcoustidCandidates, readAppleCandidates } from '../src/shared/recognition.js';
import { acoustic, madam, remix } from './fixtures/recognition.mjs';

const signal = () => new AbortController().signal;

test('catalog lookup tries Cyrillic if the entered title is not found; never invents a new credit', async () => {
  const queries: string[] = [];
  const service = createMetadataService(async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, 'https://itunes.apple.com');
    assert.equal(target.searchParams.get('country'), 'RU');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.redirect, 'error');
    const query = target.searchParams.get('term')!;
    queries.push(query);
    return Response.json({ results: query === 'мадам брошкина' ? [madam, remix] : [] });
  }, 0);
  const result = await service.search('Madam Broshkina', 'ru', signal());
  assert.deepEqual(queries, ['Madam Broshkina', 'мадам брошкина']);
  assert.equal(result[0].title, 'Мадам Брошкина');
  assert.equal(result[0].artist, 'Алла Пугачёва');
  assert.equal(result[0].source, 'apple');
  assert.equal(result[1].duration, 277.787);
  assert.equal(isMetadataPage(result[0].page), true);
  assert.deepEqual(metadataQueries('Ты здесь'), ['Ты здесь']);
  assert.deepEqual(metadataQueries('  Ty Zdes’  '), ['Ty Zdes’', 'ты здесь']);
  assert.deepEqual(metadataQueries('..'), []);
  assert.equal(musicStorefront('de-DE'), 'DE');
});

test('catalog rows keep separate releases and discard untrusted URLs and non-song entries', () => {
  const candidates = readAppleCandidates({ results: [{ ...madam, kind: 'audiobook' }, { ...madam, collectionId: 'file:' },
    { ...madam, artistName: '' }, { ...remix, previewUrl: 'https://example.org/audio' }, { ...madam, trackViewUrl: 'https://example.org/' }, madam] }, 'DE');
  const list = rankAppleCandidates(candidates, 'Мадам Брошкина', 'Бумбокс', 251.6);
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'Мадам Брошкина');
  assert.equal(list[0].page, 'https://music.apple.com/de/album/1141844173?i=1141844200');
  assert.equal(list[0].artist, 'Алла Пугачёва');
  assert.equal('previewUrl' in list[0], false);
  for (const value of [list[0].page + '&redirect=https://example.com', list[0].page + '#fragment',
    list[0].page.replace('music.apple.com', 'music.apple.com@evil.test'), 'https://musicbrainz.org/recording/foo', 'file:///tmp/a']) {
    assert.equal(isMetadataPage(value), false, value);
  }
});

test('acoustic lookup sends only the compact fingerprint and real duration, and keeps strong recording matches', async () => {
  const fingerprint = { compressed: 'AQAAZCvrQhgwYYAAAAA', duration: 24 };
  const service = createMetadataService(async (url, options) => {
    assert.equal(url, ACOUSTID_LOOKUP_URL);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.credentials, 'omit');
    assert.deepEqual(Object.fromEntries(options?.body as URLSearchParams), {
      client: 'fixture-only', fingerprint: fingerprint.compressed, duration: '24', meta: 'recordings', format: 'json',
    });
    return Response.json(acoustic);
  });
  const items = await service.identify({ ...fingerprint, audio: 'do not send', title: 'do not send' }, 'fixture-only', signal());
  assert.equal(items[0].source, 'acoustid');
  assert.equal(items[0].score, 0.94);
  assert.equal(items[0].album, undefined);
  assert.equal(isMetadataPage(items[0].page), true);
  assert.deepEqual(readAcoustidCandidates({ ...acoustic, results: [{ ...acoustic.results[0], score: .5 }] }), []);
  assert.equal(isFingerprint({ ...fingerprint, duration: Infinity }), false);
  assert.equal(isFingerprint({ ...fingerprint, compressed: 'audio/base64' }), false);
  await assert.rejects(service.identify(fingerprint, 'fixture-only', signal()), /Подождите/);
});

test('catalog requests are bounded, cancellable and do not retry a rate limit', async () => {
  let calls = 0;
  const service = createMetadataService(async () => { calls++; return new Response(null, { status: 429 }); }, 0);
  await assert.rejects(service.search('Madam Broshkina', 'de-DE', signal()), /ограничил/);
  assert.equal(calls, 1);
  await assert.rejects(service.search('Madam Broshkina', 'de-DE', AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(calls, 1);
  await assert.rejects(readLimitedBody(new Response('size not in header'), 6, signal()), /большой/);
  await assert.rejects(readLimitedBody(new Response('bytes', { headers: { 'Content-Length': '999' } }), 6, signal()), /большой/);
});
