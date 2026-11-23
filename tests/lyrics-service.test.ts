import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLyricsService } from '../src/shared/lyrics-service.js';
import { readSearchedLyrics } from '../src/shared/lyrics.js';
import { wordLyrics } from './fixtures/word-lyrics.mjs';

const query = { title: '18 мне уже', artist: 'Руки Вверх', album: 'Маленькие девочки', duration: 245.1 };
const exact = { ...wordLyrics(query.title, 'Руки вверх!', 245), albumName: query.album };
const wrongAlbum = { ...exact, albumName: 'Концерт' };
const wrongTitle = { ...exact, trackName: `${query.title} (Ремикс)` };
const wrongArtist = { ...exact, artistName: `${query.artist} Tribute` };
const wrongDuration = { ...exact, duration: 243.05 };
const signal = new AbortController().signal;
const notFound = () => new Response(null, { status: 404 });

test('LRCLIB only attaches a single compatible search result, even when others have better timing', () => {
  assert.ok(readSearchedLyrics([wrongTitle, wrongArtist, wrongDuration, wrongAlbum, exact], query)?.wordLines);
  assert.equal(readSearchedLyrics([wrongAlbum], query), null);
  assert.equal(readSearchedLyrics([wrongDuration], query), null);
  assert.equal(readSearchedLyrics([exact], { ...query, duration: undefined }), null);
  assert.equal(readSearchedLyrics([exact, wrongAlbum], { ...query, album: undefined }), null);
  assert.equal(readSearchedLyrics([exact, { ...exact, plainLyrics: null, syncedLyrics: null, hasWordSync: false }], query), null);
  assert.equal(readSearchedLyrics([...Array(19).fill(wrongTitle), exact], query), null, 'a full search page may be truncated');
  assert.throws(() => readSearchedLyrics({ results: [exact] }, query), /прочитать/);
});

test('LRCLIB spaces a v1 search after a signature miss and caches the final result', async () => {
  let firstAt = 0;
  const paths: string[] = [];
  const find = createLyricsService(async (href, options) => {
    const url = new URL(href);
    paths.push(url.pathname);
    assert.equal(url.origin, 'https://lrclib.net');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
    assert.equal(new Headers(options.headers).get('User-Agent'), 'LumaPlayer/1.0.0 (https://github.com/JohnBirlich/Luma)');
    if (url.pathname === '/api/get') {
      assert.equal(url.searchParams.get('duration'), '245.1', 'do not round away a duration mismatch');
      firstAt = performance.now();
      return notFound();
    }
    assert.equal(url.pathname, '/api/search');
    assert.ok(performance.now() - firstAt >= 340, 'fallback respects the 350 ms spacing');
    assert.deepEqual(Object.fromEntries(url.searchParams), { track_name: query.title, artist_name: query.artist, album_name: query.album });
    return Response.json([wrongTitle, exact]);
  }, true, '1.0.0');
  const request = find({ ...query, path: 'private', audio: 'private' }, signal);
  await assert.rejects(find({ ...query, title: 'Другой трек' }, signal), /Подождите/);
  const result = await request;
  assert.ok(result?.wordLines);
  assert.deepEqual(await find(query, signal), result);
  await assert.rejects(find(query, signal, true), /Подождите/);
  assert.deepEqual(paths, ['/api/get', '/api/search']);
});

test('LRCLIB looks past a mismatched get response, caches a miss, and skips search without duration', async () => {
  let requests = 0;
  const find = createLyricsService(async (href) => {
    requests++;
    return Response.json(new URL(href).pathname === '/api/get' ? wrongTitle : [wrongDuration]);
  });
  assert.equal(await find(query, signal), null);
  assert.equal(await find(query, signal), null);
  assert.equal(requests, 2);
  const unknownDuration = createLyricsService(async (href) => {
    assert.equal(new URL(href).pathname, '/api/get');
    requests++;
    return notFound();
  });
  assert.equal(await unknownDuration({ ...query, duration: undefined }, signal), null);
  assert.equal(requests, 3);
});

test('LRCLIB search honors Retry-After for the whole service and is never retried', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let requests = 0;
  const find = createLyricsService(async (href) => {
    requests++;
    return new URL(href).pathname === '/api/get' ? notFound()
      : new Response(null, { status: 503, headers: { 'Retry-After': new Date(now + 30_000).toUTCString() } });
  });
  await assert.rejects(find(query, signal), /недоступен/);
  now += 10_000;
  await assert.rejects(find({ ...query, title: 'Другая запись' }, signal, true), /Подождите/);
  assert.equal(requests, 2);
});

test('LRCLIB aborts before search and rejects oversized search bodies', async () => {
  const controller = new AbortController();
  const aborted = createLyricsService(async (href) => {
    assert.equal(new URL(href).pathname, '/api/get');
    queueMicrotask(() => controller.abort());
    return notFound();
  });
  await assert.rejects(aborted(query, controller.signal), { name: 'AbortError' });
  const large = createLyricsService(async (href) => new URL(href).pathname === '/api/get' ? notFound()
    : new Response('x'.repeat(1024 * 1024 + 1)));
  await assert.rejects(large(query, signal), /большой/);
});
