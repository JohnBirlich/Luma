import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCustomLyrics, readLocalLyrics, selectLyrics, timedLines } from '../src/shared/lyrics.js';

const local = readLocalLyrics('From the tags', '[00:00.58] First line');
const lrclib = readLocalLyrics(undefined, '[00:02.58] First line');
const attached = readLocalLyrics('Not timed')!;
const edition = { plain: 'Words as first published' };

test('karaoke and inline lyrics use the same source priorities, without inventing edition timings', () => {
  const inputs = { local, lrclib, attached, edition };
  assert.deepEqual(selectLyrics('auto', inputs), { source: 'attached', lyrics: attached });
  assert.deepEqual(selectLyrics('local', inputs), { source: 'local', lyrics: local });
  assert.deepEqual(selectLyrics('lrclib', inputs), { source: 'lrclib', lyrics: lrclib });
  assert.deepEqual(selectLyrics('edition', inputs), { source: 'edition', lyrics: { plain: edition.plain, instrumental: false } });
  assert.deepEqual(selectLyrics('auto', { edition }), {});
  assert.deepEqual(selectLyrics('auto', { lrclib }), { source: 'lrclib', lyrics: lrclib });
  assert.deepEqual(selectLyrics('local', { lrclib }), { source: 'local', lyrics: undefined });
});

test('karaoke custom lyrics distinguish plain text from synced LRC and bound pasted text', () => {
  assert.deepEqual(readCustomLyrics('Свой текст\r\nВторая строка'), { plain: 'Свой текст\nВторая строка', instrumental: false });
  const timed = readCustomLyrics('[00:01.00] Текст\n[00:02.30] Вторая строка');
  assert.deepEqual(timedLines(timed?.synced ?? ''), [{ time: 1, text: 'Текст' }, { time: 2.3, text: 'Вторая строка' }]);
  assert.equal(readCustomLyrics('   '), null);
  assert.equal(readCustomLyrics('🎵'.repeat(33_000)), null);
});
