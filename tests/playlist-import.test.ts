import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PLAYLIST_TRACKS } from '../src/shared/luma-playlists.js';
import type { Track } from '../src/shared/media.js';
import { checkPlaylistImportSize, MAX_PLAYLIST_IMPORT_BYTES, MAX_UNISON_IMPORT_BYTES, playlistImportFormat, previewPlaylist, readPlaylistImport } from '../src/shared/playlist-import.js';

const parse = (name: string, text: string) => readPlaylistImport(new TextEncoder().encode(text), playlistImportFormat(name)!, name);
const local = (id = 'file-a', overrides: Partial<Track> = {}): Track => ({
  id, title: 'Первый снег', artist: 'Артём', album: 'Зима', duration: 42, audioUrl: 'blob:local-file', ...overrides,
});

test('playlist CSV accepts service headers, ignores URI columns and previews repeats and missing recordings', () => {
  const [draft] = parse('Evening.csv', '\uFEFFTrack URI,Track Name,Artist Name(s),Album Name\r\nhttps://example.com/1,"Первый снег",Артём,Зима\r\nhttps://example.com/2,Первый снег,Артем,Зима\r\nhttps://example.com/3,"Track, with comma",Other,Some album');
  assert.equal(draft.title, 'Evening');
  assert.equal(JSON.stringify(draft).includes('https:'), false);
  const preview = previewPlaylist(draft, [local(), local('untimed', { album: 'Concert' })]);
  assert.deepEqual(preview.rows.map(({ status }) => status), ['match', 'duplicate', 'unmatched']);
  assert.deepEqual(preview.items.map(({ id }) => id), ['file-a']);
});

test('Spotify account export separates lists and ignores non-track entries and URIs', () => {
  const drafts = parse('Playlist1.json', JSON.stringify({ playlists: [
    { name: 'Вечер', items: [{ track: { trackName: 'Первый снег', artistName: 'Артём', albumName: 'Зима', trackUri: 'spotify:track:xyz' } }, { episode: { name: 'A Podcast' } }, null] },
    { name: 'Утро', items: [{ track: { trackName: 'Radio', artistName: 'Artist' } }] },
  ] }));
  assert.deepEqual(drafts, [{ title: 'Вечер', skipped: 2, rows: [{ title: 'Первый снег', artist: 'Артём', album: 'Зима' }] },
    { title: 'Утро', skipped: 0, rows: [{ title: 'Radio', artist: 'Artist', album: '' }] }]);
  assert.throws(() => parse('StreamingHistory.json', '[{"trackName":"Hi"}]'), /Playlist/);
});

test('Apple Music UTF-16 text export and plain TXT map to the same metadata', () => {
  const apple = Buffer.from('\uFEFF\r\nName\tArtist\tAlbum\tLocation\r\nПервый снег\tАртём\tЗима\tD:\\Users\\Test.mp3\r\n', 'utf16le');
  const [draft] = readPlaylistImport(apple, 'txt', 'Apple.txt');
  assert.deepEqual(draft.rows, [{ title: 'Первый снег', artist: 'Артём', album: 'Зима' }]);
  assert.deepEqual(parse('list.txt', 'Артём — Первый снег\nАртём\tВторой снег')[0].rows.map(({ title }) => title), ['Первый снег', 'Второй снег']);
  assert.throws(() => parse('bad.txt', 'Name\tArtist\tAlbum\nUnclosed\t"quote'), /CSV/);
});

test('M3U only matches already added files or metadata and never retains imported URLs and directories', () => {
  const [draft] = parse('mix.M3U8', '#EXTM3U\r\n#EXTINF:12,Other Artist - Another title\r\nC:\\private\\Mixed.flac\nhttps://untrusted.example/track.mp3\n#EXTINF:1,Артём - Первый снег\nold-folder/no-match-name.wav\nfile:///C:/private/File.ogg\n../unknown.mp3');
  assert.equal(draft.skipped, 2);
  assert.ok(!JSON.stringify(draft).match(/https?:|private|old-folder|file:/));
  const items = [local('file-b', { fileName: 'Mixed.flac', title: 'Imported file' }), local()];
  const preview = previewPlaylist(draft, items);
  assert.deepEqual(preview.items.map(({ id }) => id), ['file-b', 'file-a']);
  assert.deepEqual(preview.rows.map(({ status }) => status), ['match', 'match', 'unmatched']);
  assert.throws(() => parse('live.m3u8', '#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment.mp3'), /HLS/);
});

test('playlist import never guesses ambiguous recordings or matches demos and online tracks', () => {
  const [draft] = parse('playlist.txt', 'Артём — Первый снег');
  const online = local('online', { online: { source: 'broadcast', page: 'https://example.test', license: '', licenseUrl: '' } });
  assert.equal(previewPlaylist(draft, [online, local('demo', { demo: true })]).rows[0].status, 'unmatched');
  assert.equal(previewPlaylist(draft, [local(), local('other', { album: 'другое' })]).rows[0].status, 'ambiguous');
  assert.equal(previewPlaylist(parse('only-title.csv', 'Title\nПервый снег')[0], [local()]).items.length, 0);
});

test('playlist import previews overflow without exceeding the playlist and input bounds', () => {
  const tracks = Array.from({ length: MAX_PLAYLIST_TRACKS + 1 }, (_, i) => local(String(i), { title: `Song ${i}` }));
  const [draft] = parse('order.txt', tracks.map(({ title, artist }) => `${artist} — ${title}`).join('\n'));
  const preview = previewPlaylist(draft, [...tracks].reverse());
  assert.equal(preview.items.length, MAX_PLAYLIST_TRACKS);
  assert.equal(preview.rows.at(-1)?.status, 'limit');
  assert.deepEqual(preview.items, tracks.slice(0, MAX_PLAYLIST_TRACKS));
  assert.throws(() => readPlaylistImport(new Uint8Array(MAX_PLAYLIST_IMPORT_BYTES + 1), 'csv', 'too-big.csv'), /2 МБ/);
  assert.throws(() => parse('too-many.txt', 'a — b\n'.repeat(10001)), /10 000/);
  assert.throws(() => readPlaylistImport(Uint8Array.of(0xff), 'csv', 'invalid.csv'), /UTF-8/);
});

test('M3U does not guess when filename and metadata identify different local tracks', () => {
  const [mix] = parse('mix.m3u', '#EXTINF:12,Артём - Первый снег\nfolder/Mixed.flac');
  const tagged = local('other-file', { fileName: 'Other.flac' });
  const byNameOnly = local('preferred-file', { fileName: 'Mixed.flac', title: 'Elsewhere' });
  assert.equal(previewPlaylist(mix, [tagged, byNameOnly]).rows[0].status, 'ambiguous');
  assert.deepEqual(previewPlaylist(mix, [tagged, { ...byNameOnly, title: tagged.title }]).items.map(({ id }) => id), ['preferred-file']);
});

test('manual import picks only known usable entries, can skip a match and preserves file order across edits', () => {
  const [draft] = parse('list.txt', 'Артём — Первый снег\nАртём — Второй снег\nАртём — Незнакомый');
  const a = local(), b = local('live', { album: 'Вживую' }), c = local('second', { title: 'Второй снег' });
  const files = [a, b, c, local('demo', { demo: true })];
  const before = previewPlaylist(draft, files);
  assert.deepEqual(before.rows[0].candidates, [a, b]);
  assert.equal(before.rows[0].status, 'ambiguous');
  const picks = new Map<number, string | null>([[0, b.id], [1, null], [2, c.id]]);
  const edited = previewPlaylist(draft, files, picks);
  assert.deepEqual(edited.items, [b, c]);
  assert.deepEqual(edited.rows.map(({ status }) => status), ['chosen', 'skipped', 'chosen']);
  assert.deepEqual(previewPlaylist(draft, [...files, local('audius-aaa')], new Map([[0, 'audius-aaa'], [1, 'demo'], [2, 'invented']])).items, []);
});


test('Unison backup v1 imports ordered playlists and a favorites list without service data', () => {
  const trackJson = JSON.stringify({ source: 'VK', sourceId: 'vk-input-only', title: 'Первый снег', artists: 'Артём', album: 'Зима',
    durationMs: 42000, coverUrl: 'https://private.invalid/cover', alternates: [{ source: 'YOUTUBE', sourceId: 'alternate-input-only' }] });
  const backup = { app: 'Unison', version: 1, createdAt: 1754455022000,
    playlists: [{ name: 'Вечер', tracks: [{ trackJson }, { trackJson: 'broken' }, {
      trackJson: JSON.stringify({ title: 'Второй снег', artists: 'Артём', durationMs: -1 }) }] }],
    favorites: [{ trackJson, sentYandex: true, sentYoutube: true }],
    settings: { ytProxyHost: 'proxy-input-only' }, stats: [{ trackJson: 'history-input-only' }],
  };
  const [evening, favorites] = parse('luma-transfer.unison.json', JSON.stringify(backup));
  assert.deepEqual(evening, { title: 'Вечер', skipped: 1, rows: [
    { title: 'Первый снег', artist: 'Артём', album: 'Зима', duration: 42 }, { title: 'Второй снег', artist: 'Артём', album: '' },
  ] });
  assert.deepEqual(favorites, { title: 'Любимое Unison', skipped: 0, rows: [evening.rows[0]] });
  assert.doesNotMatch(JSON.stringify([evening, favorites]), /input-only|private\.invalid|sentYandex|sentYoutube/);
  assert.deepEqual(previewPlaylist(evening, [local(), local('live', { duration: 49, album: 'Зима' })]).items.map(({ id }) => id), ['file-a']);
});

test('Unison import rejects unsupported schema and enforces its file and playlist limits', () => {
  const backup = { app: 'Unison', version: 1, playlists: [], favorites: [] };
  const parseBackup = (data: unknown) => readPlaylistImport(new TextEncoder().encode(JSON.stringify(data)), 'unison-json', 'backup.json');
  assert.throws(() => parseBackup({ ...backup, version: 2 }), /версии 1/);
  assert.throws(() => parseBackup({ ...backup, playlists: [{}] }), /версии 1/);
  assert.throws(() => parseBackup({ ...backup, playlists: Array(101).fill({ tracks: [] }) }), /версии 1/);
  assert.throws(() => checkPlaylistImportSize(MAX_UNISON_IMPORT_BYTES + 1, 'unison-json'), /16 МБ/);
  assert.throws(() => parseBackup(backup), /нет записей/);
  assert.throws(() => parseBackup({ ...backup, playlists: [{ name: 'a', tracks: Array(6000).fill(null) }],
    favorites: Array(4001).fill(null) }), /10 000/);
});
