import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTrackText, formatRussianNumber, musicSearchKey, readTrackTag } from '../src/shared/russian.js';
import { trackInfo } from '../src/shared/media.js';

test('old Cyrillic tags encoded in Windows-1251 are displayed in Russian', () => {
  assert.equal(readTrackTag('Òû çäåñü'), 'Ты здесь');
  assert.equal(readTrackTag('Àðèÿ'), 'Ария');
  assert.equal(readTrackTag('¨ëêà feat. DJ'), 'Ёлка feat. DJ');
  assert.equal(readTrackTag('Êèíî'), 'Кино');
});

test('Russian UTF-8 garbled as Latin-1 or Windows-1251 can be recovered', () => {
  const title = 'Ты здесь — Живой звук';
  const bytes = new TextEncoder().encode(title);
  assert.equal(readTrackTag(Buffer.from(bytes).toString('latin1')), title);
  assert.equal(readTrackTag(new TextDecoder('windows-1252').decode(bytes)), title);
  assert.equal(readTrackTag(new TextDecoder('windows-1251').decode(bytes)), title);
});

test('Cyrillic, correctly tagged Latin names, transliteration, and filenames are preserved', () => {
  for (const title of ['Ты здесь', 'Рассказы о Ёлке', 'Björk', 'Beyoncé – Déjà Vu', 'Édith Piaf', "Ty Zdes'", 'Åge Aleksandersen', 'Имя']) {
    assert.equal(readTrackTag(title), cleanTrackText(title));
  }
  assert.equal(trackInfo('Свежее утро (концерт).flac').title, 'Свежее утро (концерт)');
  assert.equal(trackInfo('file.mp3', { title: 'Òû çäåñü', artist: 'Àðèÿ', album: 'Æèâîé çâóê' }).album, 'Живой звук');
  assert.equal(trackInfo('Е\u0308лка.wav').title, 'Ёлка');
});

test('Russian search treats ё and е equally and decimal output uses a comma', () => {
  assert.equal(musicSearchKey('  СИНИЙ    ЁЖ '), 'синий еж');
  assert.equal(musicSearchKey('Е\u0308лка'), musicSearchKey('елка'));
  assert.equal(formatRussianNumber(-2.5), '-2,5');
});
