// Minimal provider schemas, with fixture-only credentials. No real personal tokens or signed media URLs.
export const jamendoClient = 'fixture-client';
export const geniusToken = 'fixture-genius-token';
export const listenBrainzToken = 'fixture-listenbrainz-token';
export const jamendoDirect = { id: '1348466', name: 'All About Jazz', artist_name: 'Brotha D', album_name: 'Jazz', duration: 235,
  license_ccurl: 'http://creativecommons.org/licenses/by-nc-nd/3.0/', audio: 'https://prod-1.storage.jamendo.com/?trackid=1348466&format=mp32&from=app-fixture',
  audiodownload_allowed: false, audiodownload: 'https://prod-1.storage.jamendo.com/download/track/1348466/mp32/', album_image: 'https://example.invalid/image' };
export const jamendoAdditional = { ...jamendoDirect, id: '1848357', name: 'mañana será tarde', artist_name: 'fankel', album_name: '', duration: 272,
  audio: 'https://prod-1.storage.jamendo.com/?trackid=1848357&format=mp32&from=app-fixture' };
export const jamendoResponse = { headers: { status: 'success', code: 0, results_count: 2 }, results: [jamendoDirect, jamendoAdditional] };
export const geniusPage = 'https://genius.com/Coldplay-yellow-lyrics';
export const geniusHit = { type: 'song', result: { id: 235729, title: 'Yellow', primary_artist: { name: 'Coldplay' }, url: geniusPage,
  song_art_image_url: 'https://example.invalid/cover' } };
export const geniusSearchResponse = { meta: { status: 200 }, response: { hits: [geniusHit] } };
export const geniusReferentsResponse = { meta: { status: 200 }, response: { referents: [{ fragment: 'Ignore the lyric fragment', annotations: [{
  id: 903, body: { plain: 'A short contextual note.', html: '<b>Ignore rich markup</b>' }, authors: ['Ignore account metadata'],
}] }] } };
export const openwhydExample = 'https://openwhyd.org/adrien/playlist/10';
export const openwhydResponse = [
  { name: 'Ария - Ты здесь', eId: '/yt/AVUR778jnmE', img: 'https://example.invalid/image', pl: { id: 10, name: 'Sample playlist' } },
  { name: 'DJ Pone — Falken’s Maze', eId: '/sc/briceb/dj-pone-falkens-maze#https://api.soundcloud.com/tracks/127926347' },
  { name: 'Carpenter Brut - Obituary', eId: '/vi/74333931' },
  { name: 'A title only', eId: '/fi/https://example.invalid/stream.mp3', src: { id: 'https://example.invalid/stream.mp3' } },
];
export const discoveryStation = { stationuuid: '21a5044d-3a7a-4a10-a1e8-e139d3582a4d', name: 'Radio Record - Nu Dance',
  country: 'The Russian Federation', countrycode: 'RU', language: 'english,russian', tags: 'electronic,house', codec: 'AAC', bitrate: 96, hls: 0,
  url_resolved: 'https://radiorecord.hostingradio.ru/nudance96.aacp', lastcheckok: 1, ssl_error: 0,
  homepage: 'https://www.radiorecord.ru/', favicon: 'https://example.invalid/do-not-load' };
export const browserStation = { ...discoveryStation, stationuuid: '38f80a1f-cb96-4ad2-9d6b-a3e66b671882', name: 'Soma FM Groove Salad HLS',
  hls: 1, url_resolved: 'https://hls.somafm.com/hls/groovesalad/320k/program.m3u8' };
