import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hubMusic, similarRecordings } from '../src/shared/music-hub.js';
import type { Track } from '../src/shared/media.js';
import { decodePreferences, encodePreferences, catalogQueueRefs } from '../src/player/preferences.js';
import { startQueue } from '../src/shared/queue.js';
import { classifiedTracks, GENRES, mergeDiscoveryTracks } from '../src/shared/discovery.js';
import { MAX_PLAYLIST_TRACKS, readLumaPlaylists } from '../src/shared/luma-playlists.js';
import { MUSIC_SITES, musicSites, musicSiteUrl, isMusicSiteUrl } from '../src/shared/music-sites.js';
import { stationTracks, STATIONS, isStationPage } from '../src/shared/radio.js';
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


test('browse matches compound genre tags, not titles, and preserves saved copies ahead of catalog matches', () => {
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
    assert.equal(new URL(logo).protocol, 'https:');
  }
  const id = STATIONS[0].id;
  const stored = decodePreferences(JSON.stringify({ stationIds: [id, id, 'bogus', {}], recent: [id, 'local'], onlineRefs: stationTracks }));
  assert.deepEqual(stored.stationIds, [id]);
  assert.deepEqual(stored.recent, ['local']);
  assert.deepEqual(stored.onlineRefs, []);
});

test('music sites expose only canonical browser URLs, never embed pages or that site’s media endpoints', () => {
  const query = 'Синее кафе & Jazz / 夜';
  for (const site of musicSites) {
    const target = musicSiteUrl(site, query);
    assert.ok(isMusicSiteUrl(target));
    assert.ok(isMusicSiteUrl(MUSIC_SITES[site].home));
    assert.equal(isMusicSiteUrl(`${target}#extra`), false);
  }
  assert.equal(new URL(musicSiteUrl('vk', query)).searchParams.get('q'), query);
  assert.equal(decodeURIComponent(new URL(musicSiteUrl('mail', query)).pathname.split('/').at(-1)!), query);
  assert.equal(new URL(musicSiteUrl('yandex', query)).searchParams.get('text'), query);
  assert.equal(musicSiteUrl('drive', query), MUSIC_SITES.drive.home);
  assert.equal(musicSiteUrl('mail', '..'), MUSIC_SITES.mail.home);
  [null, 'file:///C:/music.mp3', 'https://vk.ru@elsewhere.invalid/audio?q=jazz', 'https://vk.ru/audio?q=jazz&next=https://example.invalid',
    'https://my.mail.ru/music/download/123.mp3', 'https://music.yandex.ru/search?text=jazz&type=all'].forEach((url) => assert.equal(isMusicSiteUrl(url), false));
});
