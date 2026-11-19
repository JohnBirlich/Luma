import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeMix, musicGroups, shuffledMix, tracksInGroup } from '../src/shared/mix.js';
import { trackInfo } from '../src/shared/media.js';
import type { Track } from '../src/shared/media.js';
import { decodeOpenverse } from '../src/shared/online.js';
import { jamendoRecording } from './fixtures/openverse.mjs';

const local: Track[] = [
  { id: 'a', title: 'Первый', artist: 'Алёна', album: 'Сборник', genres: ['Джаз', 'Поп'], duration: 5, audioUrl: 'demo.mp3' },
  { id: 'b', title: 'Второй', artist: 'Алена', album: 'Сборник', genres: ['джаз'], duration: 6, audioUrl: 'demo.mp3' },
  { id: 'c', title: 'Третий', artist: 'Ария', album: 'Сборник', duration: 7, audioUrl: 'demo.mp3' },
];
const online = decodeOpenverse(jamendoRecording)!;
const all = [...local, online];

test('music groups normalize Cyrillic artist and genre names but separate albums of different artists', () => {
  assert.deepEqual(musicGroups(local, 'artist')[0], { id: 'алена', label: 'Алёна', count: 2 });
  assert.equal(musicGroups(local, 'album').length, 2);
  assert.deepEqual(tracksInGroup(all, { kind: 'genre', id: 'джаз' }), local.slice(0, 2));
  assert.deepEqual(trackInfo('sample.mp3', { genre: ['Джаз', 'джаз', '  Поп  ', ''] }).genres, ['Джаз', 'Поп']);
  assert.deepEqual(musicGroups([{ ...local[0], artist: 'Неизвестный исполнитель' }], 'artist'), []);
});

test('mixes respect source, explicit group and offline settings, and have a bounded repeatable order', () => {
  const settings = { type: 'library' as const, favorites: new Set(['b', online.id]), recent: [local[2], online], offline: false, seed: 12 };
  const full = makeMix(all, settings);
  assert.deepEqual(makeMix(all, settings), full);
  assert.equal(new Set(full.map(({ id }) => id)).size, all.length);
  assert.deepEqual(makeMix(all, { ...settings, type: 'favorites', offline: true }), [local[1]]);
  assert.deepEqual(makeMix(all, { ...settings, type: 'recent', offline: true }), [local[2]]);
  assert.deepEqual(makeMix(all, { ...settings, group: { kind: 'artist', id: 'алена' } }).map(({ id }) => id).sort(), ['a', 'b']);
  assert.equal(makeMix(Array.from({ length: 30 }, (_, i) => ({ ...local[0], id: String(i) })), settings).length, 24);
  assert.deepEqual(shuffledMix(local, () => 0), [local[1], local[2], local[0]]);
  assert.equal(local[0].id, 'a');
});
