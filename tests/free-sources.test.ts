import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogTargets } from '../src/data/catalog-search.js';
import { decodePreferences, encodePreferences } from '../src/player/preferences.js';
import { selectLyrics } from '../src/shared/lyrics.js';
import { createLyricsOvhLookup } from '../src/shared/lyrics-ovh.js';
import { commonsMp3Export, isOnlineExternalUrl, PHISH_LEGAL, readOnlineTrack, sessionCatalogId } from '../src/shared/online.js';
import { buildSharedPlaylist } from '../src/shared/playlist-share.js';
import { createPhishSearch, phishSongQuery, readPhishTracks } from '../src/shared/phishin.js';
import { createPublicJsonRequest } from '../src/shared/public-json.js';
import { startQueue } from '../src/shared/queue.js';
import { isMetadataPage } from '../src/shared/recognition.js';
import { recordingEvidence } from '../src/shared/recording-match.js';
import { createAudioDbLookup, readAudioDbCandidates } from '../src/shared/theaudiodb.js';
import { audioDbTrack, phishSong, phishTrack, untimedLyrics } from './fixtures/free-sources.mjs';

const signal = () => new AbortController().signal;

test('Lyrics.ovh receives only artist and title as path segments and cannot inject karaoke timing', async () => {
  const title = 'A/B & #1', artist = 'Руки вверх!';
  const lyrics = createLyricsOvhLookup(async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.lyrics.ovh');
    assert.deepEqual(new URL(url).pathname.split('/').map(decodeURIComponent), ['', 'v1', artist, title]);
    assert.equal(new URL(url).search, '');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return Response.json({ lyrics: untimedLyrics, synced: '[00:00.25] Incorrect timing', wordLines: [{ time: 1, text: 'Wrong' }] });
  });
  const result = await lyrics({ title, artist, duration: 245, album: 'Private album' }, signal());
  assert.deepEqual(result, { plain: untimedLyrics, instrumental: false });
  const timed = { instrumental: false, synced: '[00:00.25] Real timing' };
  assert.deepEqual(selectLyrics('auto', { lrclib: timed, lyricsovh: result }), { source: 'lrclib', lyrics: timed });
  assert.deepEqual(selectLyrics('lyricsovh', { lrclib: timed, lyricsovh: { ...result!, synced: timed.synced } }), { source: 'lyricsovh', lyrics: result });
  assert.deepEqual(selectLyrics('auto', { lrclib: null, lyricsovh: result }), {}, 'never substitute plain text automatically');
});

test('Lyrics.ovh distinguishes a missing song from a failure and ignores unknown tags', async () => {
  let calls = 0;
  const lookup = createLyricsOvhLookup(async () => { calls++; return new Response(null, { status: 404 }); });
  const song = { title: 'Yellow', artist: 'Coldplay' };
  assert.equal(await lookup({ title: '..', artist: 'Coldplay' }, signal()), null);
  assert.equal(await lookup({ title: 'Yellow', artist: 'Unknown artist' }, signal()), null);
  assert.equal(calls, 0);
  assert.equal(await lookup(song, signal()), null);
  assert.equal(calls, 1);
  await assert.rejects(createLyricsOvhLookup(async () => Response.json({ lyrics: {} }))(song, signal()), /Lyrics\.ovh/);
  await assert.rejects(createLyricsOvhLookup(async () => new Response('outage', { status: 502 }))(song, signal()), /HTTP 502/);
});

test('public API requests share a cooldown and limit, reject parallel requests, and honor aborts', async () => {
  const url = new URL('https://api.lyrics.ovh/v1/Artist/Song');
  let calls = 0;
  let complete!: (response: Response) => void;
  const request = createPublicJsonRequest(async () => { calls++; return new Promise((done) => { complete = done; }); }, { spacing: 100, limit: 8 });
  const first = request(url, signal());
  await assert.rejects(request(url, signal()), /временно ограничил/);
  complete(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
  await assert.rejects(first, /HTTP 429/);
  await assert.rejects(request(url, signal()), /временно ограничил/);
  assert.equal(calls, 1);
  const oversized = createPublicJsonRequest(async () => new Response('too many bytes'), { spacing: 50, limit: 8 });
  await assert.rejects(oversized(url, signal()), /Слишком большой ответ/);
  await assert.rejects(oversized(url, AbortSignal.abort()), { name: 'AbortError' });
  const controller = new AbortController();
  const waiting = oversized(url, controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
});

test('TheAudioDB uses the public free key and returns credited metadata and a thumbnail, not a stream', async () => {
  const lookup = createAudioDbLookup(async (url, options) => {
    const endpoint = new URL(url);
    assert.equal(endpoint.origin + endpoint.pathname, 'https://www.theaudiodb.com/api/v1/json/123/searchtrack.php');
    assert.deepEqual(Object.fromEntries(endpoint.searchParams), { s: 'Coldplay', t: 'Yellow' });
    assert.equal(options.credentials, 'omit');
    assert.equal(options.body, undefined);
    return Response.json({ track: [audioDbTrack, { ...audioDbTrack, idTrack: '44' }] });
  });
  const [candidate, ...extra] = await lookup({ title: 'Yellow', artist: 'Coldplay', album: 'Private', fileName: 'Private.mp3' }, signal());
  assert.deepEqual(extra, []);
  assert.deepEqual(candidate, { source: 'theaudiodb', page: 'https://www.theaudiodb.com/track/32724184', title: 'Yellow', artist: 'Coldplay',
    album: 'Parachutes', genre: 'Pop-Rock', isrc: 'GBAYE0000267', duration: 269.24, artworkUrl: `${audioDbTrack.strTrackThumb}/small` });
  assert.equal(isMetadataPage(candidate.page), true);
  assert.equal(isMetadataPage(`${candidate.page}?next=https://example.invalid/`), false);
});

test('TheAudioDB rejects mismatches, unknown fields and cross-origin or non-thumbnail artwork', async () => {
  const query = { title: 'Yellow', artist: 'Coldplay' };
  const parse = (track: unknown) => readAudioDbCandidates({ track }, query);
  assert.deepEqual(parse(null), []);
  assert.deepEqual(parse([{ ...audioDbTrack, strArtist: 'Another artist' }]), []);
  assert.deepEqual(parse([{ ...audioDbTrack, strTrack: 'Yellow (Live)' }]), []);
  assert.deepEqual(parse([{ ...audioDbTrack, idTrack: '32724184/route' }]), []);
  for (const url of ['https://r2.theaudiodb.com.example.test/images/media/track/thumb/x.jpg', 'https://r2.theaudiodb.com/images/media/track/thumb/../x.jpg',
    'https://r2.theaudiodb.com/images/media/track/thumb/x.svg', `${audioDbTrack.strTrackThumb}?key=secret`]) {
    assert.equal(parse([{ ...audioDbTrack, strTrackThumb: url }])[0].artworkUrl, undefined);
  }
  assert.throws(() => parse(undefined), /TheAudioDB/);
  const noNetwork = createAudioDbLookup(async () => { throw new Error('unexpected network request'); });
  assert.deepEqual(await noNetwork({ title: 'Yellow', artist: 'Неизвестный исполнитель' }, signal()), []);
});

test('Phish.in search is opt-in by title, keyless, and requests only one matching song and one page', async () => {
  const calls: URL[] = [];
  const search = createPhishSearch(async (url, options) => {
    const target = new URL(url);
    calls.push(target);
    assert.equal(target.origin, 'https://phish.in');
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(Object.fromEntries(new Headers(options.headers)), { accept: 'application/json' });
    return Response.json(target.pathname === '/api/v2/tracks' ? { tracks: [phishTrack] } : { songs: [phishSong] });
  });
  for (const invalid of ['Llama', 'LLama\t hi', 'Phish', 'Phish xy', 'Phish %llama', 'Phish https://example.invalid/']) {
    assert.equal(phishSongQuery(invalid), undefined);
    assert.deepEqual(await search(invalid, signal()), []);
  }
  assert.equal(calls.length, 0);
  assert.equal(phishSongQuery('phish: You Enjoy Myself'), 'You Enjoy Myself');
  assert.equal(catalogTargets(true, true).at(-1)?.id, 'phishin');
  assert.equal(catalogTargets(false, true).at(-1)?.id, 'phishin');
  const tracks = await search('Phish Llama', signal());
  assert.deepEqual(calls.map((url) => url.pathname), ['/api/v2/search/Llama', '/api/v2/tracks']);
  assert.deepEqual(Object.fromEntries(calls[1].searchParams), { song_slug: 'llama', audio_status: 'complete', per_page: '12', sort: 'likes_count:desc' });
  assert.deepEqual(tracks.map(({ id, artist, album, duration }) => [id, artist, album, duration]),
    [['phish-30344', 'Phish', '2015-08-14 · Walnut Creek Amphitheater', 340.454]]);
});

test('Phish.in misses and ambiguous names never look up a different song', async () => {
  for (const songs of [[], [{ ...phishSong, title: 'Too Much Llama' }], [phishSong, { ...phishSong, slug: 'llama-2' }]]) {
    let calls = 0;
    const search = createPhishSearch(async () => { calls++; return Response.json({ songs }); });
    assert.deepEqual(await search('Phish Llama', signal()), []);
    assert.equal(calls, 1);
  }
});

test('Phish.in tracks reject partial recordings, flagged recordings and non-archive media', () => {
  const read = (props: object) => readPhishTracks({ tracks: [{ ...phishTrack, ...props }] }, 'llama');
  for (const props of [{ audio_status: 'missing' }, { audio_status: 'partial' }, { tags: [{ name: 'Unfinished' }] },
    { show: { ...phishTrack.show, tags: [{ name: 'SBD' }] } }, { show_date: '2023-11-31' },
    { mp3_url: phishTrack.mp3_url.replace('phish.in', 'example.invalid') }, { mp3_url: `${phishTrack.mp3_url}?token=foo` },
    { mp3_url: phishTrack.show.album_zip_url }, { songs: [{ slug: 'another-song' }] }]) {
    assert.deepEqual(read(props), []);
  }
  const [track] = read({});
  assert.ok(sessionCatalogId(track.id));
  assert.equal(readOnlineTrack({ ...track, id: 'audius-DX0Xb' }), undefined);
  assert.equal(readOnlineTrack({ ...track, id: 'archive-deadbeef' }), undefined);
  assert.equal(commonsMp3Export(track), false);
  assert.equal(isOnlineExternalUrl(track.online.page), true);
  assert.equal(isOnlineExternalUrl(PHISH_LEGAL.taping), true);
  assert.equal(isOnlineExternalUrl(`${track.online.page}?next=example.invalid`), false);
  assert.equal(isOnlineExternalUrl(track.audioUrl), false, 'the shell opens source pages, not media URLs');
  assert.equal(buildSharedPlaylist('Phish', [track]), undefined);
  assert.equal(recordingEvidence(track, { ...track, id: 'local', online: undefined }), undefined);
  const prefs = decodePreferences(null);
  const persisted = encodePreferences({ ...prefs, onlineTracks: [track], onlineRefs: [track], recent: [track.id], favorites: [track.id] }, startQueue([track.id]));
  assert.doesNotMatch(persisted, /phish-30344|phish\.in/);
});
