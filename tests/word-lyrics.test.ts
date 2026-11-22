import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeLyricLine, activeLyricWord, readLyrics } from '../src/shared/lyrics.js';
import { wordLyrics } from './fixtures/word-lyrics.mjs';

const query = { title: '18 мне уже', artist: 'Руки Вверх', duration: 245 };
const reply = wordLyrics(query.title, 'Руки вверх!', query.duration);

test('catalog artist punctuation can differ only for a matching title and known duration', () => {
  assert.ok(readLyrics(reply, { ...query, duration: 247 })?.synced);
  assert.ok(readLyrics({ ...reply, artistName: 'Руки вверх！' }, query)?.wordLines);
  assert.equal(readLyrics(reply, { ...query, duration: 247.01 }), null);
  assert.equal(readLyrics(reply, { ...query, duration: undefined }), null);
  assert.equal(readLyrics(reply, { ...query, title: `${query.title} (ремикс)` }), null);
  assert.equal(readLyrics(reply, { ...query, artist: 'Руки! Вверх' }), null);
  assert.equal(readLyrics(reply, { ...query, artist: 'Другой артист' }), null);
  assert.deepEqual(readLyrics(reply, { ...query, duration: undefined, artist: reply.artistName }),
    { plain: reply.plainLyrics, instrumental: false });
});

test('word timings respect the recording clock, explicit ends, gaps and seeks', () => {
  const lyrics = readLyrics(reply, query)!;
  assert.equal(lyrics.synced, reply.syncedLyrics, 'legacy line sync remains available for LRC export');
  const lines = lyrics.wordLines!;
  assert.equal(lines.length, 2);
  assert.equal(lines[0].words?.map(({ text }) => text).join(''), lines[0].text);
  assert.equal(lines[1].words, undefined);
  for (const [time, line, word] of [[.1, -1, -1], [.25, 0, 0], [.55, 0, -1], [.6, 0, 1], [1.2, 0, -1], [1.25, 1, -1], [.3, 0, 0]]) {
    const index = activeLyricLine(lines, time);
    assert.equal(index, line);
    assert.equal(activeLyricWord(lines[index], time), word);
  }
  assert.ok(readLyrics({ ...reply, plainLyrics: null, syncedLyrics: null }, query)?.wordLines);
});

test('overlapping segments prefer the latest active word; a start-only word stops at the next segment', () => {
  const lyric = { time: 1, end: 5, text: 'One two three', words: [
    { time: 1, end: 3, text: 'One ' }, { time: 2, end: 2.5, text: 'two ' }, { time: 4, text: 'three' },
  ] };
  for (const [time, word] of [[2, 1], [2.5, 0], [3, -1], [4.5, 2], [5, -1]]) assert.equal(activeLyricWord(lyric, time), word);
  const startsOnly = { ...lyric, words: [{ time: 1, text: 'One ' }, ...lyric.words.slice(1)] };
  assert.equal(activeLyricWord(startsOnly, 1.9), 0);
  assert.equal(activeLyricWord(startsOnly, 2.5), -1);
});

test('invalid, unrelated or unsupported word timing falls back to an independently matched LRC', () => {
  const yaml = reply.lyricsfile;
  for (const lyricsfile of [
    yaml.replace("'1.0'", "'2.0'"),
    yaml.replace('start_ms: 250', 'start_ms: -250'),
    yaml.replace('duration_ms: 245000', 'duration_ms: 250000'),
    yaml.replace('duration_ms: 245000', 'duration_ms: 245000\n  offset_ms: 500'),
    yaml.replace(reply.artistName, 'Другой исполнитель'),
    yaml.replace("text: 'куплет'", "text: 'Не относится к строке'"),
    yaml.replace('start_ms: 600', 'start_ms: 1500'),
    `${yaml}\nplain: !unknown 'text'\n`,
    `${yaml}\nplain: &repeat 'text'\nalias: *repeat\n`,
    `${yaml}\nversion: '1.0'\n`,
    `${yaml}\nannotation: ${'['.repeat(16)}extra${']'.repeat(16)}\n`,
    ' '.repeat(256 * 1024 + 1),
  ]) {
    assert.deepEqual(readLyrics({ ...reply, lyricsfile }, query), {
      plain: reply.plainLyrics, synced: reply.syncedLyrics, instrumental: false,
    });
  }
  assert.equal(readLyrics({ ...reply, hasWordSync: false }, query)?.wordLines, undefined);
});
