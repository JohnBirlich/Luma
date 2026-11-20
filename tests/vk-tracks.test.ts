import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Track } from '../src/shared/media.js';
import { filterVkTracks, MAX_VK_TRACK_FILE, MAX_VK_TRACKS, parseVkTracks, readVkTracks, vkLocalFiles } from '../src/shared/vk-tracks.js';

const utf8 = (text: string) => new TextEncoder().encode(text);
const imported = { artist: 'Ария', title: 'Ты здесь', album: 'Живой звук' };
const local: Track = { ...imported, id: 'local-file', duration: 185 };

test('CSV handles provider headers, BOM, quoted delimiters, multiline fields and case-folded duplicates', () => {
  const rows = parseVkTracks(utf8('\uFEFFTrack Name;Artist Name;Album;Track URI\r\n'
    + '"Трек; с \"\"кавычками\"\"";"Бьёрк";"строка\r\nальбома";https://example.test/private?id=secret\r\n'
    + '"Трек; с \"\"кавычками\"\"";Бьерк;"строка альбома";ignored\r\n'), 'csv');
  assert.deepEqual(rows, [{ title: 'Трек; с "кавычками"', artist: 'Бьёрк', album: 'строка альбома' }]);
  assert.deepEqual(parseVkTracks(utf8('Название\tИсполнитель\tАльбом\nТы здесь\tАрия\tЖивой звук'), 'csv'), [imported]);
  assert.deepEqual(parseVkTracks(utf8('artist,title,album\nАрия,Ты здесь,Живой звук'), 'csv'), [imported]);
  assert.deepEqual(parseVkTracks(utf8('title\n"Jazz, Vol. 2"'), 'csv'), [{ title: 'Jazz, Vol. 2', artist: '', album: '' }]);
});

test('TXT references come only from text rows and search the imported names and artists locally', () => {
  const rows = parseVkTracks(utf8('Ария — Ты здесь\nБьёрк\tAll is Full of Love\rБьерк - all is full of love\n'), 'txt');
  assert.deepEqual(rows, [{ ...imported, album: '' }, { title: 'All is Full of Love', artist: 'Бьёрк', album: '' }]);
  assert.deepEqual(filterVkTracks(rows, 'здесь ария'), [rows[0]]);
  assert.deepEqual(filterVkTracks(rows, 'FULL бьерК'), [rows[1]]);
  assert.deepEqual(filterVkTracks(rows, 'other title'), []);
});

test('empty, malformed, oversize, non-UTF8 or unsupported exports do not replace the saved list', () => {
  assert.throws(() => parseVkTracks(utf8('artist,album\nA,B'), 'csv'), /заголовков/);
  assert.throws(() => parseVkTracks(utf8('title,artist\n"broken,a'), 'csv'), /кавычки/);
  assert.throws(() => parseVkTracks(utf8('title,artist\nextra,count,here'), 'csv'), /разделители/);
  assert.throws(() => parseVkTracks(utf8('<html>private archive</html>'), 'txt'), /по одному треку/);
  assert.throws(() => parseVkTracks(new Uint8Array([0xff, 0x61]), 'csv'), /UTF-8/);
  assert.throws(() => parseVkTracks(utf8('title,artist\n\0,who'), 'csv'), /UTF-8/);
  assert.throws(() => parseVkTracks(new Uint8Array(MAX_VK_TRACK_FILE + 1), 'txt'), /до 2 МБ/);
  assert.throws(() => parseVkTracks(utf8('title,artist\n"",Ария'), 'csv'), /нет треков/);
  assert.throws(() => parseVkTracks(utf8(Array.from({ length: MAX_VK_TRACKS + 1 }, (_, n) => `A — ${n}`).join('\n')), 'txt'), /10 000/);
});

test('storage sanitizes metadata, and only an unambiguous existing local file is playable', () => {
  assert.deepEqual(readVkTracks([null, false, imported, { ...imported, audioUrl: 'https://private.invalid', token: 'secret' }, { artist: 'no title' }]), [imported]);
  const demo = { ...local, id: 'demo', demo: true };
  const streamed = { ...local, id: 'online', online: { source: 'jamendo', page: '', license: '', licenseUrl: '' } } as const;
  const otherVersion = { ...local, album: 'Концерт', id: 'concert' };
  assert.equal(vkLocalFiles([demo, streamed])(imported), undefined);
  assert.equal(vkLocalFiles([demo, streamed, otherVersion, local])(imported), local);
  assert.equal(vkLocalFiles([otherVersion, local])({ ...imported, album: '' }), undefined);
  assert.equal(vkLocalFiles([otherVersion])(imported), undefined);
  assert.equal(vkLocalFiles([local])({ ...imported, artist: '' }), undefined);
});
