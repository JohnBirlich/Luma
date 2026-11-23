import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hubMusic, similarRecordings } from '../src/shared/music-hub.js';
import type { Track } from '../src/shared/media.js';
import { decodePreferences, encodePreferences, catalogQueueRefs } from '../src/player/preferences.js';
import { startQueue } from '../src/shared/queue.js';
import { classifiedTracks, GENRES, mergeDiscoveryTracks } from '../src/shared/discovery.js';
import { MAX_PLAYLIST_TRACKS, readLumaPlaylists } from '../src/shared/luma-playlists.js';
import { adjacentStationId, tuneStation, stationTracks, EXTRA_STATIONS, RADIO_DIRECTORY, RADIO_LISTINGS, RADIO_ORIGINS, STATIONS, isStationPage } from '../src/shared/radio.js';
import { radioStationCover } from '../src/shared/radio-artwork.js';
import { streamUrl } from '../src/shared/audio-quality.js';
import { decodeOpenverse, readOnlineTrack } from '../src/shared/online.js';
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
  assert.deepEqual(classifiedTracks(data.personal, ['Рок']).map(({ id }) => id), ['seed', 'genre']);
});

test('catalog refs survive reload but do not make a library save or keep an abandoned queue', () => {
  const prefs = { ...decodePreferences(null), onlineRefs: [commons] };
  const queue = startQueue([jamendo.id]);
  const onlineRefs = catalogQueueRefs(prefs, queue, [jamendo, jamendo]);
  assert.deepEqual(onlineRefs, [jamendo]);
  const merged = decodePreferences(encodePreferences({ ...prefs, onlineRefs }, queue));
  assert.deepEqual(merged.onlineRefs.map(({ id }) => id), [jamendo.id]);
  assert.deepEqual(merged.queue?.order, [jamendo.id]);
  assert.deepEqual(merged.onlineTracks, []);
  assert.deepEqual(catalogQueueRefs({ ...prefs, favorites: [commons.id] }, queue, [jamendo]), [commons, jamendo]);
  assert.deepEqual(catalogQueueRefs({ ...prefs, onlineTracks: [jamendo] }, queue, [jamendo]), []);
});

test('legacy Music and VK launch settings open the merged Home without disturbing current destinations', () => {
  for (const startPage of ['vk', 'music', 'player']) {
    assert.equal(decodePreferences(JSON.stringify({ playback: { startPage } })).playback.startPage, 'player');
  }
  for (const startPage of ['library', 'local', 'search']) {
    assert.equal(decodePreferences(JSON.stringify({ playback: { startPage } })).playback.startPage, startPage);
  }
});


test('discovery matches compound genre tags, not titles, and preserves saved copies ahead of catalog matches', () => {
  const songs = [track('a', { genres: ['хип-хоп / рэп'] }), track('b', { genres: ['Chillout; Nu Jazz'] }), track('c', { title: 'jazz' })];
  assert.deepEqual(classifiedTracks(songs, GENRES.find(({ id }) => id === 'rap')!.tags), [songs[0]]);
  assert.deepEqual(classifiedTracks(songs, GENRES.find(({ id }) => id === 'jazz')!.tags), [songs[1]]);
  const saved = { ...jamendo, title: 'Saved label' };
  assert.deepEqual(mergeDiscoveryTracks([songs[1], saved], [jamendo, commons]), [songs[1], saved, commons]);
  assert.deepEqual(similarRecordings([songs[0], songs[1]], track('seed'), new Set(['b'])).map(({ id }) => id), ['b', 'a']);
});

test('playlist references survive without saving the catalog record or remembering the current queue', () => {
  const prefs = decodePreferences(null);
  const initial = { ...prefs, playback: { ...prefs.playback, rememberQueue: false }, onlineRefs: [jamendo, commons], playlists: [
    { id: 'list-56a911bd-03ab-414e-b36b-93c43be6fd79', title: '  Вечер  ', trackIds: [jamendo.id, jamendo.id, '', stationTracks[0].id, 'a'] },
  ] };
  const profile = decodePreferences(encodePreferences(initial, startQueue(['a'])));
  assert.deepEqual(profile.playlists, [{ ...initial.playlists[0], title: 'Вечер', trackIds: [jamendo.id, 'a'] }]);
  assert.equal(profile.queue, undefined);
  assert.deepEqual(profile.onlineTracks, []);
  assert.deepEqual(profile.onlineRefs.map(({ id }) => id), [jamendo.id]);
  assert.deepEqual(readLumaPlaylists([{ ...initial.playlists[0], title: ' ' }]), []);
  assert.equal(readLumaPlaylists([{ ...initial.playlists[0], trackIds: Array.from({ length: 400 }, (_, i) => `song-${i}`) }])[0].trackIds.length, MAX_PLAYLIST_TRACKS);
});

test('radio restores only curated ids and cannot be serialized as a song or a catalog reference', () => {
  assert.equal(new Set(STATIONS.map(({ id }) => id)).size, STATIONS.length);
  for (const { id, stream, page, logo } of STATIONS) {
    const station = stationTracks.find((row) => row.id === id)!;
    assert.equal(station.duration, 0);
    assert.equal(streamUrl(station, 'economy'), stream);
    assert.equal(readOnlineTrack(station), undefined);
    assert.equal(isStationPage(page), true);
    assert.equal(isStationPage(stream), false);
    if (logo) assert.equal(new URL(logo).protocol, 'https:');
    assert.ok(RADIO_ORIGINS.media.split(' ').includes(new URL(stream).origin + new URL(stream).pathname));
  }
  const id = STATIONS[0].id;
  const stored = decodePreferences(JSON.stringify({ stationIds: [id, id, 'bogus', {}], recent: [id, 'local'], onlineRefs: stationTracks }));
  assert.deepEqual(stored.stationIds, [id]);
  assert.deepEqual(stored.recent, ['local']);
  assert.deepEqual(stored.onlineRefs, []);
});

test('radio tuning follows directory order in both directions, skips browser-only stations and wraps', () => {
  const playable = RADIO_LISTINGS.filter(({ stream }) => !!stream);
  for (let index = 0; index < playable.length; index++) {
    const { id } = playable[index];
    assert.equal(adjacentStationId(id, 1), playable[(index + 1) % playable.length].id);
    assert.equal(adjacentStationId(id, -1), playable[(index + playable.length - 1) % playable.length].id);
  }
  for (const id of [null, 'local', 'radio-ru-mir-far-east']) {
    assert.equal(adjacentStationId(id, 1), null);
    assert.equal(adjacentStationId(id, -1), null);
  }
});

test('retuning replaces only the active radio slot and keeps music order, shuffle and repeat', () => {
  const first = 'radio-record-record', second = 'radio-ru-pi-fm';
  const initial = { ...startQueue(['a', 'c', 'b'], 'a', 'one'), beforeShuffle: ['a', 'b', 'c'] };
  const tuned = tuneStation(initial, first);
  assert.deepEqual(tuned.order, ['a', 'c', 'b', first]);
  assert.deepEqual(tuneStation(tuned, 'radio-ru-mir-far-east'), tuned);
  const stepped = tuneStation(tuned, second);
  assert.deepEqual(stepped, { order: ['a', 'c', 'b', second], currentId: second, repeat: 'one', beforeShuffle: ['a', 'b', 'c', second] });
  assert.deepEqual(tuneStation(stepped, first), tuned);
  // Pre-existing profiles may already have the destination in the queue.
  const legacy = startQueue(['a', first, 'b', second, 'c'], first);
  assert.deepEqual(tuneStation(legacy, second), { ...legacy, currentId: second });
});

test('radio keeps the requested directory, regional identities and browser-only bookmarks separate', () => {
  assert.equal(RADIO_DIRECTORY.length, 96);
  assert.deepEqual(RADIO_DIRECTORY.slice(0, 3).map(({ name }) => name), ['Европа Плюс - Россия', 'Хит FM - Россия', 'Радио Record - Россия']);
  assert.deepEqual(RADIO_DIRECTORY.slice(-2).map(({ name }) => name), ['Русская Волна', 'Вести FM - Россия']);
  // Case, dash style, punctuation, "ё" and the standard country suffix don't make another station.
  const stationName = (name: string) => name.normalize('NFKC').toLowerCase().replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/ россия$/u, '');
  assert.equal(new Set(RADIO_LISTINGS.map(({ name }) => stationName(name))).size, RADIO_LISTINGS.length);
  assert.equal(new Set(RADIO_LISTINGS.map(({ page }) => page)).size, RADIO_LISTINGS.length);
  assert.equal(new Set(STATIONS.map(({ stream }) => stream)).size, STATIONS.length);
  assert.equal(new Set(RADIO_LISTINGS.map(({ id }) => id)).size, 96 + EXTRA_STATIONS.length);
  assert.deepEqual(RADIO_DIRECTORY.filter(({ name }) => name.startsWith('Радио МИР')).map(({ name }) => name), [
    'Радио МИР - Урал', 'Радио МИР - Дальний Восток', 'Радио МИР - Россия',
  ]);
  const mir = RADIO_DIRECTORY.filter(({ name }) => name.startsWith('Радио МИР'));
  assert.equal(new Set(mir.map(({ page }) => page)).size, 3);
  assert.equal(new Set(mir.map(({ stream }) => stream).filter(Boolean)).size, mir.filter(({ stream }) => stream).length);
  const maria = RADIO_DIRECTORY.filter(({ name }) => /Мари[яа]/u.test(name));
  assert.equal(maria.length, 2);
  assert.notEqual(maria[0].page, maria[1].page);
  assert.equal(RADIO_DIRECTORY.find(({ name }) => name === 'Радио Record - Россия')?.id, 'radio-record-record');
  const browser = RADIO_DIRECTORY.filter(({ stream }) => !stream);
  assert.ok(browser.length);
  assert.ok(browser.every(({ id, page }) => new URL(page).protocol === 'https:' && isStationPage(page) && !stationTracks.some((track) => track.id === id)));
  const list = decodePreferences(JSON.stringify({ stationIds: [browser[0].id], favorites: [browser[0].id] }));
  assert.deepEqual(list.stationIds, [browser[0].id]);
  assert.deepEqual(list.favorites, []);
  assert.equal(isStationPage('https://radioplayer.ru/station/radio-mariya?unexpected'), false);
});

test('each radio listing has its own offline cover, and playback keeps the same cover on errors', () => {
  const prefix = 'data:image/svg+xml,';
  assert.equal(new Set(RADIO_LISTINGS.map(({ cover }) => cover)).size, RADIO_LISTINGS.length);
  for (const { id, name, cover, logo, stream } of RADIO_LISTINGS) {
    assert.equal(cover, radioStationCover(id, name));
    assert.ok(cover.startsWith(prefix));
    const art = decodeURIComponent(cover.slice(prefix.length));
    assert.match(art, /^<svg[^>]*width="360" height="360"/);
    assert.doesNotMatch(art, /<(?:image|script|foreignObject)|https:\/\//i);
    if (stream) {
      const track = stationTracks.find((track) => track.id === id)!;
      assert.equal(track.artworkUrl, logo ?? cover);
      assert.equal(track.fallbackArtworkUrl, logo ? cover : undefined);
    }
  }
  const station = RADIO_DIRECTORY.find(({ id }) => id === 'radio-ru-russkoe')!;
  assert.match(decodeURIComponent(station.cover), /Русское радио.*Россия/s);
  const untrusted = decodeURIComponent(radioStationCover('external', '<script>alert(1)</script> & \u202e\uD800'));
  assert.match(untrusted, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(untrusted, /&amp;/);
  assert.doesNotMatch(untrusted, /<script|\u202e/u);
});

test('station logo URLs come from the matching curated Radioplayer listing, not live tracks', () => {
  const station = RADIO_DIRECTORY.find(({ id }) => id === 'radio-ru-remix')!;
  assert.equal(station.page, 'https://radioplayer.ru/station/remix-fm');
  assert.equal(station.logo, 'https://api.radioplayer.ru/images/mfcd8r3e_colored.webp');
  assert.equal(stationTracks.find(({ id }) => id === station.id)?.artworkFit, 'contain');
  const logoSources = RADIO_DIRECTORY.flatMap(({ logo }) => logo && logo.includes('radioplayer.ru') ? [logo] : []);
  assert.ok(logoSources.length >= 80);
  assert.ok(logoSources.every(url => /^https:\/\/api\.radioplayer\.ru\/images\/[a-z0-9_]+_colored\.webp$/.test(url)));
  assert.ok(RADIO_ORIGINS.images.split(' ').includes('https://api.radioplayer.ru/images/'));
  assert.doesNotMatch(RADIO_ORIGINS.images, /meta\.fmgid|i\.amgradio/);
});
