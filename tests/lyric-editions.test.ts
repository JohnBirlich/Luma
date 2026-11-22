import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findLyricEdition, isLyricEditionPage } from '../src/shared/lyric-editions';
import { lyricsFromTags, timedLines } from '../src/shared/lyrics';

test('offline editions keep their attribution, and do not fuzzy-match unrelated titles', () => {
  const dark = findLyricEdition('Очи черные');
  assert.match(dark?.plain ?? '', /Очи черные, очи страстные/);
  assert.ok(isLyricEditionPage(dark?.page));
  assert.equal(findLyricEdition('Dark Eyes – Remix'), undefined);
  assert.equal(isLyricEditionPage('https://ru.wikisource.org/wiki/Anything'), false);
});

test('embedded timed text accepts millisecond lyric frames only, with plain text fallback', () => {
  const plain = { text: 'Words' };
  const frame = { timeStampFormat: 2, contentType: 1, syncText: [{ timestamp: 1250, text: 'Line one' }, { timestamp: 60_125, text: 'Line two' }] };
  const both = lyricsFromTags([plain, frame]);
  assert.deepEqual(timedLines(both!.synced!), [{ time: 1.25, text: 'Line one' }, { time: 60.125, text: 'Line two' }]);
  assert.equal(both?.plain, 'Words');
  assert.equal(lyricsFromTags([plain, { ...frame, timeStampFormat: 1 }])?.synced, undefined);
  assert.equal(lyricsFromTags([{ ...frame, contentType: 2 }]), null);
});
