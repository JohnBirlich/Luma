import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { DesktopLibrary } from '../electron/library.js';
import { createProtocolHandler, parseByteRange, staticPath } from '../electron/protocol.js';
import { audioMime, formatTime, trackCount, trackInfo, usableArtwork } from '../src/shared/media.js';

const sample = resolve('public/demo/afterimage.mp3');

test('local metadata defaults and supported media types are explicit', () => {
  assert.deepEqual(trackInfo('Моя песня.FLAC', { title: ' ', albumartist: ' Анна ' }, Number.NaN), {
    title: 'Моя песня', artist: 'Анна', album: 'Без альбома', duration: 0,
  });
  assert.equal(audioMime('Моя песня.FLAC'), 'audio/flac');
  assert.equal(audioMime('song.constructor'), undefined);
  assert.equal(audioMime('mp3'), undefined);
  assert.equal(formatTime(3603.7), '1:00:03');
  assert.equal(trackCount(22), '22 трека');
  assert.equal(trackCount(12), '12 треков');
});

test('embedded artwork prefers the front and recognizes raster data despite mislabeled tags', () => {
  const unsupported = Buffer.from('<svg></svg>');
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0);
  assert.equal(usableArtwork([{ format: 'image/png', data: unsupported }]), undefined);
  assert.equal(usableArtwork([
    { format: 'image/png', data: png }, { format: 'application/octet-stream', type: 'Cover (front)', data: jpeg },
  ])?.mime, 'image/jpeg');
  assert.equal(usableArtwork([
    { format: 'image/png', type: 'Cover (front)', data: unsupported }, { format: '', data: png },
  ])?.extension, 'png');
  assert.equal(usableArtwork([{ format: '', data: Buffer.from('GIF89a') }])?.extension, 'gif');
  assert.equal(usableArtwork([{ format: '', data: Buffer.from('....ftypavif') }])?.extension, 'avif');
});

test('byte ranges support resume, seeking and suffix requests', () => {
  assert.deepEqual(parseByteRange('bytes=8-19', 20), { start: 8, end: 19 });
  assert.deepEqual(parseByteRange('bytes=8-', 20), { start: 8, end: 19 });
  assert.deepEqual(parseByteRange('bytes=-4', 20), { start: 16, end: 19 });
  assert.deepEqual(parseByteRange('bytes=0-55', 20), { start: 0, end: 19 });
  assert.equal(parseByteRange('bytes=20-', 20), null);
  assert.equal(parseByteRange('bytes=0-2,4-9', 20), null);
  assert.equal(parseByteRange('bytes=8-7', 20), null);
  assert.equal(parseByteRange('bytes=-0', 20), null);
});

test('static requests are confined to bundled web files', () => {
  const dir = resolve('dist');
  assert.equal(staticPath(dir, '/'), join(dir, 'index.html'));
  assert.equal(staticPath(dir, '/demo/song.mp3'), join(dir, 'demo', 'song.mp3'));
  assert.equal(staticPath(dir, '/%2e%2e%2fpackage.json'), undefined);
  assert.equal(staticPath(dir, '/%5c..%5cpackage.json'), undefined);
  assert.equal(staticPath(dir, '/%gg'), undefined);
});

test('desktop imports tagged audio, deduplicates and survives restart without deleting music', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-library-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const trackPath = join(dir, 'Тестовый трек.mp3');
  await copyFile(sample, trackPath);
  const profile = join(dir, 'data');
  let library = await DesktopLibrary.open(profile);
  const imported = await library.importPaths([trackPath, trackPath, join(dir, 'text.txt'), join(dir, 'missing.wav')]);
  assert.equal(imported.added.length, 1);
  assert.equal(imported.duplicates, 1);
  assert.equal(imported.failures.length, 2);
  assert.equal(imported.tracks[0].title, 'Отблеск');
  assert.equal(imported.tracks[0].artist, 'Арден Вейл');
  assert.equal(imported.tracks[0].album, 'Полуночные сигналы');
  assert.ok(imported.tracks[0].duration >= 31);
  assert.ok(!JSON.stringify(imported.tracks).includes('Тестовый трек.mp3'));
  const trackId = imported.added[0];
  library = await DesktopLibrary.open(profile);
  assert.equal(library.list()[0].id, trackId);
  assert.deepEqual(await library.remove(trackId), []);
  assert.ok((await readFile(trackPath)).length > 0);
  assert.equal((await DesktopLibrary.open(profile)).list().length, 0);
});

test('desktop protocol streams only indexed media and returns range metadata to dev playback', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-protocol-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bundled = join(dir, 'app');
  await mkdir(bundled);
  await writeFile(join(bundled, 'index.html'), '<h1>Luma Player</h1>');
  const library = await DesktopLibrary.open(join(dir, 'data'));
  const { tracks: [track] } = await library.importPaths([sample]);
  const dev = 'http://127.0.0.1:5174';
  const handle = createProtocolHandler(bundled, library, dev);
  const sampleBytes = await readFile(sample);
  const response = await handle(new Request(track.audioUrl, { headers: { Origin: dev, Range: 'bytes=18-58' } }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), dev);
  assert.equal(response.headers.get('Content-Range'), `bytes 18-58/${sampleBytes.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), sampleBytes.subarray(18, 59));
  const head = await handle(new Request(track.audioUrl, { method: 'HEAD' }));
  assert.equal(head.headers.get('Content-Length'), String(sampleBytes.length));
  assert.equal(head.body, null);
  assert.equal((await handle(new Request(track.audioUrl, { headers: { Origin: 'https://example.com' } }))).status, 403);
  assert.equal((await handle(new Request('luma://app/media/audio/not-indexed'))).status, 404);
  const page = await handle(new Request('luma://app/'));
  assert.match(page.headers.get('Content-Security-Policy') ?? '', /script-src 'self'/);
  assert.match(page.headers.get('Content-Security-Policy') ?? '', /frame-src https:\/\/vk\.ru\/widget_playlist\.php;/);
  assert.equal(await page.text(), '<h1>Luma Player</h1>');
});

test('embedded front cover is cached, served, and cleaned up with its entry', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-cover-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = await readFile(sample);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64');
  const picture = Buffer.concat([Buffer.from('\0image/png\0\x03\0', 'binary'), png]);
  const frame = Buffer.alloc(10);
  frame.write('APIC');
  frame.writeUInt32BE(picture.length, 4);
  const length = frame.length + picture.length;
  const tag = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (length >> 21) & 127, (length >> 14) & 127, (length >> 7) & 127, length & 127]);
  const sourceTagSize = source.subarray(6, 10).reduce((size, byte) => (size << 7) + byte, 0);
  const path = join(dir, 'track-with-cover.mp3');
  await writeFile(path, Buffer.concat([tag, frame, picture, source.subarray(10 + sourceTagSize)]));
  const library = await DesktopLibrary.open(join(dir, 'data'));
  const { tracks: [track] } = await library.importPaths([path]);
  assert.ok(track.artworkUrl);
  const handle = createProtocolHandler(dir, library);
  const cover = await handle(new Request(track.artworkUrl));
  assert.equal(cover.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(Buffer.from(await cover.arrayBuffer()), png);
  await library.remove(track.id);
  assert.equal((await handle(new Request(track.artworkUrl))).status, 404);
});

test('desktop reads Windows-1251 ID3v2.3 tags and repairs old library entries in place', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-russian-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { taggedMp3 } = await import('./fixtures/mp3.mjs');
  const legacy = { title: 'Òû çäåñü', artist: 'Àðèÿ', album: 'Æèâîé çâóê' };
  const audio = taggedMp3(await readFile(sample), legacy);
  const path = join(dir, 'Старые теги.mp3');
  await writeFile(path, audio);
  const library = await DesktopLibrary.open(dir);
  const { tracks: [track] } = await library.importPaths([path]);
  assert.deepEqual([track.title, track.artist, track.album], ['Ты здесь', 'Ария', 'Живой звук']);

  const index = join(dir, 'library.json');
  // Simulate an index written by 0.4.0 and verify that no reimport or file rewrite is needed.
  const [entry] = JSON.parse(await readFile(index, 'utf8'));
  const saved = JSON.stringify([{ ...entry, ...legacy, textVersion: undefined }]);
  await writeFile(index, saved);
  assert.deepEqual((await DesktopLibrary.open(dir)).list(), [track]);
  assert.equal(await readFile(index, 'utf8'), saved);
  assert.deepEqual(await readFile(path), audio);
});

test('desktop decodes legacy ID3v1 titles with Ё and falls back to Cyrillic filenames', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-id3v1-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = await readFile(sample);
  const offset = 10 + source.subarray(6, 10).reduce((size, byte) => (size << 7) + byte, 0);
  const audio = source.subarray(offset);
  const tail = Buffer.alloc(128);
  tail.write('TAG¨ëêà', 0, 'latin1');
  tail.write('Êèíî', 33, 'latin1');
  const tagged = join(dir, 'ID3v1.mp3');
  const untagged = join(dir, 'Дорога домой.mp3');
  await writeFile(tagged, Buffer.concat([audio, tail]));
  await writeFile(untagged, audio);
  const library = await DesktopLibrary.open(dir);
  const { tracks: [legacy, raw] } = await library.importPaths([tagged, untagged]);
  assert.deepEqual([legacy.title, legacy.artist], ['Ёлка', 'Кино']);
  assert.equal(raw.title, 'Дорога домой');
});
