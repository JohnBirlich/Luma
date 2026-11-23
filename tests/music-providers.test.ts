import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogTargets, compareJamendo, mergeCatalogResults } from '../src/data/catalog-search.js';
import { decodePreferences, encodePreferences } from '../src/player/preferences.js';
import { createGeniusLookup, geniusAnnotations, geniusSongs, isGeniusPage } from '../src/shared/genius.js';
import { CatalogError, catalogReply } from '../src/shared/catalog-reply.js';
import { createJamendoSearch, jamendoSearchUrl, jamendoTracks } from '../src/shared/jamendo.js';
import { createOpenwhydImport, isOpenwhydSourceLink, openwhydPlaylistUrl, readOpenwhydDraft } from '../src/shared/openwhyd.js';
import { previewPlaylist } from '../src/shared/playlist-import.js';
import { commonsMp3Export, decodeOpenverse, isOnlineExternalUrl, readOnlineTrack } from '../src/shared/online.js';
import { createRadioBrowser, isRadioBrowserPage, radioBrowserServers, radioBrowserTrack, readRadioBrowserQuery,
  readRadioBrowserStations, trustedRadioBrowserStream } from '../src/shared/radio-browser.js';
import { RADIO_ORIGINS, readStationIds, STATIONS, tuneStation } from '../src/shared/radio.js';
import { startQueue } from '../src/shared/queue.js';
import { buildSharedPlaylist } from '../src/shared/playlist-share.js';
import { jamendoRecording } from './fixtures/openverse.mjs';
import { browserStation, discoveryStation, geniusHit, geniusPage, geniusReferentsResponse, geniusSearchResponse, geniusToken,
  jamendoAdditional, jamendoClient, jamendoDirect, jamendoResponse, openwhydExample, openwhydResponse } from './fixtures/music-providers.mjs';

const signal = () => new AbortController().signal;
const withTracks = (results: unknown[]) => ({ headers: jamendoResponse.headers, results });
const saved = decodeOpenverse(jamendoRecording)!;

test('Jamendo requests a registered client and free-text track/album/artist/tag search, including singles', async () => {
  const search = createJamendoSearch(async (raw, options) => {
    const url = new URL(raw);
    assert.equal(url.origin + url.pathname, 'https://api.jamendo.com/v3.0/tracks/');
    assert.deepEqual(Object.fromEntries(url.searchParams), { client_id: jamendoClient, format: 'json', limit: '24', type: 'single albumtrack', audioformat: 'mp32', search: 'jazz & mañana' });
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    return Response.json(jamendoResponse);
  });
  assert.equal(jamendoSearchUrl('jazz', 'not?a-key'), undefined);
  assert.deepEqual(await search('jazz', '', signal()), []);
  const [same, additional] = await search('jazz  &\tmañana', jamendoClient, signal());
  assert.equal(same.id, 'jamendo-1348466');
  assert.equal(same.audioUrl, saved.audioUrl);
  assert.equal(same.artist, 'Brotha D');
  assert.equal(same.online.licenseUrl, 'https://creativecommons.org/licenses/by-nc-nd/3.0/');
  assert.ok(isOnlineExternalUrl(same.online.page));
  assert.deepEqual(readOnlineTrack(same), same);
  assert.equal(additional.title, 'mañana será tarde');
  assert.doesNotMatch(JSON.stringify([same, additional]), /audiodownload|app-fixture|example\.invalid/);
  assert.equal(commonsMp3Export(same), false);
});

test('Jamendo refuses download/preview-only rows and invalid media, recording IDs and licenses', async () => {
  for (const override of [{ id: '1848357' }, { audio: '' }, { audio: jamendoDirect.audiodownload }, { audio: 'https://example.invalid/file.mp3' },
    { audio: 'https://prod-1.storage.jamendo.com/?trackid=1348466&format=unknown' }, { license_ccurl: 'https://example.invalid/license' },
    { name: '' }, { artist_name: '' }, { duration: -1 }]) assert.deepEqual(jamendoTracks(withTracks([{ ...jamendoDirect, ...override }])), []);
  assert.throws(() => jamendoTracks({ headers: { status: 'failed', code: 5 }, results: [] }), { issue: 'credentials' });
  const search = createJamendoSearch(async (url) => { throw new Error(`internal failure ${url}`); });
  await assert.rejects(search('jazz', jamendoClient, signal()), (error: unknown) => error instanceof CatalogError && error.issue === 'network' && !error.message.includes(jamendoClient));
  assert.equal(readOnlineTrack({ ...jamendoTracks(jamendoResponse)[0], id: 'jamendo-17' }), undefined);
});

test('compare distinct Jamendo IDs, prefer Openverse when both returned, and preserve old saves', () => {
  const [same, additional] = jamendoTracks(jamendoResponse);
  assert.deepEqual(compareJamendo([saved], [same, additional, same]), { matches: 1, additional: 1 });
  const direct = { id: 'jamendo_direct', tracks: [same, additional] } as const;
  assert.deepEqual(mergeCatalogResults([direct]), [same, additional]);
  assert.deepEqual(mergeCatalogResults([direct, { id: 'openverse', tracks: [saved] }]), [additional, saved]);
  assert.ok(catalogTargets(true, false, true).some(({ id }) => id === 'jamendo_direct'));
  assert.ok(!catalogTargets(true).some(({ id }) => id === 'jamendo_direct'));
  assert.ok(!catalogTargets(false, false, true).some(({ id }) => id === 'jamendo_direct'));
  const encoded = encodePreferences({ ...decodePreferences(''), onlineTracks: [saved, additional] }, startQueue([saved.id, additional.id], additional.id));
  assert.doesNotMatch(encoded, /jamendo-1848357|trackid=1848357/);
  assert.deepEqual(decodePreferences(encoded).onlineTracks, [saved]);
  assert.equal(decodePreferences(encoded).queue?.order.includes(saved.id), true);
  assert.equal(buildSharedPlaylist('Only a stream', [additional]), undefined);
});

test('Genius sends bearer auth only to the official endpoints and returns plain bounded annotations, not lyrics', async () => {
  const urls: string[] = [];
  const lookup = createGeniusLookup(async (raw, options) => {
    const url = new URL(raw);
    urls.push(url.pathname);
    assert.equal(url.origin, 'https://api.genius.com');
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${geniusToken}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.ok(!url.href.includes(geniusToken));
    if (url.pathname === '/search') {
      assert.deepEqual(Object.fromEntries(url.searchParams), { q: 'Coldplay Yellow' });
      return Response.json(geniusSearchResponse);
    }
    assert.deepEqual(Object.fromEntries(url.searchParams), { song_id: '235729', text_format: 'plain', per_page: '6' });
    return Response.json(geniusReferentsResponse);
  });
  await assert.rejects(lookup.search('Coldplay Yellow', '', signal()), /токен Genius/);
  assert.deepEqual(await lookup.annotations(-1, geniusToken, signal()), []);
  assert.deepEqual(await lookup.search('Coldplay Yellow', geniusToken, signal()), [{ id: 235729, title: 'Yellow', artist: 'Coldplay', page: geniusPage }]);
  assert.deepEqual(await lookup.annotations(235729, geniusToken, signal()), [{ id: 903, excerpt: 'A short contextual note.' }]);
  assert.deepEqual(urls, ['/search', '/referents']);
  assert.deepEqual(geniusAnnotations({ meta: { status: 200 }, response: { referents: [{ annotations: [{ id: 3, body: { plain: 'x'.repeat(800) } }] }] } }), [{ id: 3, excerpt: 'x'.repeat(420) + '…' }]);
});

test('Genius ignores non-song results and noncanonical links and does not echo provider failures', async () => {
  for (const url of ['http://genius.com/Coldplay-yellow-lyrics', 'https://genius.com.example.invalid/a-lyrics', `${geniusPage}?next=x`, `${geniusPage}#a`, 'https://genius.com/a%2Fb-lyrics', 'https://genius.com/%ff-lyrics']) {
    assert.equal(isGeniusPage(url), false);
    assert.deepEqual(geniusSongs({ meta: { status: 200 }, response: { hits: [{ ...geniusHit, result: { ...geniusHit.result, url } }] } }), []);
  }
  const denied = createGeniusLookup(async () => new Response(`private detail ${geniusToken}`, { status: 401 }));
  await assert.rejects(denied.search('Coldplay Yellow', geniusToken, signal()), (error: Error) => error.message.includes('не принял токен') && !error.message.includes(geniusToken));
});

test('public Openwhyd import keeps provider order, extracts only safe page links and reuses local matching', async () => {
  const load = createOpenwhydImport(async (raw, options) => {
    assert.equal(raw, `${openwhydExample}?format=json&limit=201`);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    return Response.json(openwhydResponse);
  });
  const draft = await load(`${openwhydExample}/?ref=other#section`, signal());
  assert.equal(draft.title, 'Sample playlist');
  assert.deepEqual(draft.rows.map(({ title }) => title), ['Ты здесь', 'Falken’s Maze', 'Obituary', 'A title only']);
  assert.deepEqual(draft.sourceLinks, ['https://www.youtube.com/watch?v=AVUR778jnmE', 'https://soundcloud.com/briceb/dj-pone-falkens-maze', 'https://vimeo.com/74333931', undefined]);
  assert.doesNotMatch(JSON.stringify(draft), /example\.invalid|api\.soundcloud|audioUrl/);
  const local = { id: 'local', title: 'Ты здесь', artist: 'Ария', album: 'Живой звук', duration: 235, audioUrl: 'luma://app/media/audio/local' };
  assert.equal(previewPlaylist(draft, [local]).rows[0].match?.id, 'local');
  assert.equal(previewPlaylist(draft, [local]).rows[1].match, undefined);
  assert.ok(draft.sourceLinks.slice(0, 3).every(isOpenwhydSourceLink));
  for (const link of ['https://soundcloud.com/user', 'https://soundcloud.com/user/song?token=x', 'https://api.soundcloud.com/tracks/12', 'https://example.invalid/stream.mp3'])
    assert.ok(!isOpenwhydSourceLink(link));
});

test('Openwhyd URL restrictions and bounded public playlist import', async () => {
  for (const url of ['https://openwhyd.org/adrien', 'http://openwhyd.org/adrien/playlist/10', 'https://openwhyd.org.example.invalid/u/playlist/10',
    'https://openwhyd.org:9000/u/playlist/10', 'https://user@openwhyd.org/u/playlist/10', 'https://openwhyd.org/u/playlist/10/other']) assert.equal(openwhydPlaylistUrl(url), undefined);
  const url = openwhydPlaylistUrl(openwhydExample)!;
  const draft = readOpenwhydDraft(Array.from({ length: 205 }, (_, index) => ({ name: `Song ${index + 1}`, eId: '/fi/http://127.0.0.1/stream' })), url);
  assert.equal(draft.rows.length, 200);
  assert.equal(draft.rows[199].title, 'Song 200');
  assert.equal(draft.limited, true);
  assert.ok(draft.sourceLinks.every((link) => !link));
  assert.throws(() => readOpenwhydDraft([{ name: 'Wrong playlist', pl: { id: 11 } }], url), /нет записей/);
  await assert.rejects(createOpenwhydImport(async () => new Response(null, { status: 404 }))(openwhydExample, signal()), /не найден/);
});

test('Radio Browser filters, retries an unavailable mirror, and counts only explicit native station selections', async () => {
  const seen: URL[] = [];
  const radio = createRadioBrowser(async (raw, options) => {
    const url = new URL(raw); seen.push(url);
    assert.match(new Headers(options.headers).get('user-agent')!, /^Luma-Player\/1\.2\.0/);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    if (url.hostname === 'test.api.radio-browser.info') throw new Error('Network timeout');
    assert.equal(url.hostname, 'de1.api.radio-browser.info');
    if (url.pathname.startsWith('/json/url/')) return Response.json({ ok: true, url: 'https://example.invalid/do-not-use' });
    assert.equal(url.pathname, '/json/stations/search');
    assert.deepEqual(Object.fromEntries(url.searchParams), { name: 'Radio & Record', countrycode: 'RU', language: 'russian', tag: 'house', hidebroken: 'true', order: 'votes', reverse: 'true', limit: '24' });
    return Response.json([discoveryStation, browserStation]);
  }, '1.2.0', async () => ['test.api.radio-browser.info.', 'example.invalid']);
  await assert.rejects(radio.search({ country: 'not a country code' }), /код страны/);
  assert.equal(seen.length, 0);
  const found = await radio.search({ name: ' Radio & Record ', country: 'ru', language: 'russian', genre: 'house' });
  assert.equal(found.length, 2);
  assert.equal(seen.length, 2, 'no station probes or clicks during search');
  await radio.click(found[1].id);
  assert.equal(seen.length, 2);
  await radio.click(found[0].id);
  assert.equal(seen[2].pathname, `/json/url/${discoveryStation.stationuuid}`);
  await radio.click(found[0].id);
  assert.equal(seen.length, 3, 'rapid repeated selections are rate limited');
});

test('Radio Browser bounds discovery and does not retry another mirror to evade cooldown', async () => {
  assert.deepEqual(radioBrowserServers(['De2.api.radio-browser.info.', 'http://evil.api.radio-browser.info', 'de3.api.radio-browser.info', 'de4.api.radio-browser.info']), [
    'de2.api.radio-browser.info', 'de3.api.radio-browser.info', 'de1.api.radio-browser.info',
  ]);
  assert.deepEqual(readRadioBrowserQuery({ genre: 'jazz' }), { name: '', country: '', language: '', genre: 'jazz' });
  let calls = 0;
  const radio = createRadioBrowser(async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '90' } }); }, '1.2.0', async () => ['de2.api.radio-browser.info']);
  await assert.rejects(radio.search({ genre: 'jazz' }), /недоступен/);
  await assert.rejects(radio.search({ name: 'Radio' }), /недоступен/);
  assert.equal(calls, 1);
});

test('Radio Browser exposes only vetted HTTPS broadcasts; fallback and preferences remain safe', () => {
  const [direct, web] = readRadioBrowserStations([discoveryStation, browserStation, discoveryStation, { ...discoveryStation, stationuuid: '../wrong' }]);
  const track = radioBrowserTrack(direct)!;
  assert.equal(track.online?.source, 'broadcast');
  assert.equal(track.audioUrl, discoveryStation.url_resolved);
  assert.equal(track.duration, 0);
  assert.equal(radioBrowserTrack(web), undefined);
  for (const url of ['http://stream.laut.fm/jazz', 'https://internal.invalid/stream.mp3', 'https://stream.laut.fm:8443/jazz', 'https://stream.laut.fm/a/b', 'https://stream.laut.fm/jazz?q=stream', 'https://stream.laut.fm.evil.invalid/jazz', 'https://account@stream.laut.fm/jazz'])
    assert.equal(trustedRadioBrowserStream(url), undefined);
  assert.equal(trustedRadioBrowserStream(STATIONS[0].stream), STATIONS[0].stream);
  for (const override of [{ hls: 1 }, { ssl_error: 1 }, { lastcheckok: 0 }, { codec: 'unknown' }, { url_resolved: 'https://example.invalid/live' }]) {
    const [station] = readRadioBrowserStations([{ ...discoveryStation, ...override }]);
    assert.equal(station.stream, undefined);
    assert.ok(isRadioBrowserPage(station.page));
    assert.ok(!isRadioBrowserPage(`${station.page}?redirect=external`));
  }
  assert.doesNotMatch(RADIO_ORIGINS.media, /(?:^| )https:(?: |$)|[*.]api\.radio-browser\.info|https:\/\/\*/);
  assert.deepEqual(readStationIds([direct.id, STATIONS[0].id]), [STATIONS[0].id]);
  assert.deepEqual(tuneStation(tuneStation(startQueue(['local']), STATIONS[0].id), direct.id).order, ['local', direct.id]);
  assert.doesNotMatch(encodePreferences(decodePreferences(''), startQueue([track.id], track.id)), new RegExp(track.id));
});

test('Jamendo HTTP 200 failures keep the API key, quota and upstream issues separate', async () => {
  for (const [code, issue] of [[5, 'credentials'], [11, 'credentials'], [6, 'quota'], [3, 'unavailable'], [1, 'unavailable']] as const) {
    let calls = 0;
    const search = createJamendoSearch(async () => { calls++; return Response.json({ headers: { status: 'failed', code, error_message: jamendoClient }, results: [] }); });
    const invoke = () => catalogReply(() => search('jazz', jamendoClient, signal()));
    assert.deepEqual(await invoke(), { tracks: [], issue });
    if (code === 6) { assert.deepEqual(await invoke(), { tracks: [], issue }); assert.equal(calls, 1); }
  }
  for (const [status, issue] of [[429, 'quota'], [401, 'credentials'], [403, 'unavailable'], [502, 'unavailable']] as const) {
    const search = createJamendoSearch(async () => new Response(jamendoClient, { status }));
    assert.deepEqual(await catalogReply(() => search('jazz', jamendoClient, signal())), { tracks: [], issue });
  }
  const malformed = createJamendoSearch(async () => new Response('not json'));
  assert.deepEqual(await catalogReply(() => malformed('jazz', jamendoClient, signal())), { tracks: [], issue: 'response' });
});
