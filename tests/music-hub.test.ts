import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hubMusic, moodTracks } from '../src/shared/music-hub.js';
import type { Track } from '../src/shared/media.js';
import { decodePreferences, encodePreferences, radioQueueRefs } from '../src/player/preferences.js';
import { startQueue } from '../src/shared/queue.js';
import { decodeOpenverse } from '../src/shared/online.js';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';

const track = (id: string, fields: Partial<Track> = {}): Track => ({ id, title: id, artist: 'Ария', album: 'Live', audioUrl: `blob:${id}`, duration: 45, ...fields });
const jamendo = decodeOpenverse(jamendoRecording)!;
const commons = decodeOpenverse(commonsRecording)!;

test('Music discovery uses real available recordings, with no demo, offline or disliked history as seeds', () => {
  const seed = track('seed', { genres: ['рок'] });
  const artist = track('artist', { artist: 'АРИЯ' });
  const genre = track('genre', { artist: 'Different', genres: ['Рок'] });
  const unrelated = track('unrelated', { artist: 'Another' });
  const demo = track('demo', { demo: true });
  const disliked = track('disliked');
  const data = hubMusic([seed, genre, artist, unrelated, demo, disliked, jamendo], [demo, disliked, jamendo, seed], new Set([disliked.id]), true);
  assert.deepEqual(data.history.map(({ id }) => id), ['seed']);
  assert.deepEqual(data.related.map(({ id }) => id), ['artist', 'genre']);
  assert.deepEqual(data.discoveries.map(({ id }) => id), ['genre', 'artist', 'unrelated']);
  assert.deepEqual(data.demos.map(({ id }) => id), ['demo']);
  assert.deepEqual(moodTracks(data.personal, ['Рок']).map(({ id }) => id), ['seed', 'genre']);
});

test('station refs survive reload but do not make a library save or keep an abandoned queue', () => {
  const prefs = { ...decodePreferences(null), onlineRefs: [commons] };
  const queue = startQueue([jamendo.id]);
  const onlineRefs = radioQueueRefs(prefs, queue, [jamendo, jamendo]);
  assert.deepEqual(onlineRefs, [jamendo]);
  const merged = decodePreferences(encodePreferences({ ...prefs, onlineRefs }, queue));
  assert.deepEqual(merged.onlineRefs.map(({ id }) => id), [jamendo.id]);
  assert.deepEqual(merged.queue?.order, [jamendo.id]);
  assert.deepEqual(merged.onlineTracks, []);
  assert.deepEqual(radioQueueRefs({ ...prefs, favorites: [commons.id] }, queue, [jamendo]), [commons, jamendo]);
  assert.deepEqual(radioQueueRefs({ ...prefs, onlineTracks: [jamendo] }, queue, [jamendo]), []);
});

test('0.12 profiles keep the default destination without going to VK', () => {
  const prefs = decodePreferences(JSON.stringify({ playback: { startPage: 'vk' } }));
  assert.equal(prefs.playback.startPage, 'music');
});
