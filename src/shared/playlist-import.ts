import { MAX_PLAYLIST_TRACKS, playlistTitle } from './luma-playlists.js';
import { audioMime } from './media.js';
import type { Track } from './media.js';
import { basenameKey, csvTracks, localRecordingMatches, readRecordingReference, textTracks } from './track-list.js';
import type { RecordingReference } from './track-list.js';
import { readOnlineTrack, sessionCatalogId } from './online.js';
import { musicSearchKey } from './russian.js';
import { MAX_PLAYLIST_SHARE_BYTES, readSharedPlaylist } from './playlist-share.js';
import type { SharedRecording } from './playlist-share.js';
import { recordingKey } from './recording-match.js';

export const MAX_PLAYLIST_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_LISTS = 100;
export interface ImportRow extends SharedRecording { fileName?: string }
export interface PlaylistDraft { title: string; rows: ImportRow[]; skipped: number }
export type PlaylistFormat = 'csv' | 'txt' | 'm3u' | 'spotify-json' | 'luma-json';

export function playlistImportFormat(fileName: string): PlaylistFormat | undefined {
  if (/\.luma\.json$/i.test(fileName)) return 'luma-json';
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase();
  if (ext === 'csv' || ext === 'txt') return ext;
  if (ext === 'm3u' || ext === 'm3u8') return 'm3u';
  if (ext === 'json') return 'spotify-json';
}

function readText(bytes: Uint8Array, format: PlaylistFormat) {
  const wide = format === 'txt' && (bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : false);
  try {
    const text = new TextDecoder(wide || 'utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
    return text;
  } catch { throw new Error('Не удалось прочитать файл. Сохраните его в кодировке UTF-8.'); }
}

function* m3uRows(text: string): Generator<ImportRow | undefined> {
  let label = '';
  for (const line of text.split(/\r\n|\n|\r/u)) {
    const value = line.trim();
    if (!value) continue;
    if (/^#EXT-X-/i.test(value)) throw new Error('Это поток HLS, а не список локальных файлов.');
    if (value.startsWith('#')) {
      const info = /^#EXTINF:[^,]*,(.*)$/i.exec(value);
      if (info) label = info[1].trim();
      continue;
    }
    const display = label; label = '';
    if (!/^[a-z]:[\\/]/i.test(value) && /^(?:[a-z][a-z\d+.-]+:|\/\/|\\\\)/i.test(value)) { yield undefined; continue; }
    const fileName = value.split(/[\\/]/).pop() ?? '';
    if (!fileName || fileName.length > 255 || !audioMime(fileName)) { yield undefined; continue; }
    const parts = /^(.*?) [–—-] (.+)$/u.exec(display);
    const row = readRecordingReference({ title: parts?.[2] ?? (display || fileName), artist: parts?.[1], album: '' });
    yield row && { ...row, fileName };
  }
}

function* spotifyRows(items: unknown[]): Generator<RecordingReference | undefined> {
  for (const item of items) {
    const track = (item as { track?: { trackName?: unknown; artistName?: unknown; albumName?: unknown } } | null)?.track;
    yield readRecordingReference({ title: track?.trackName, artist: track?.artistName, album: track?.albumName });
  }
}

export function readPlaylistImport(bytes: Uint8Array, format: PlaylistFormat, fileName: string): PlaylistDraft[] {
  if (bytes.byteLength > MAX_PLAYLIST_IMPORT_BYTES) throw new Error('Выберите файл плейлиста размером до 2 МБ.');
  const text = readText(bytes, format);
  const name = playlistTitle(fileName.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, ''));
  if (format === 'luma-json') {
    if (bytes.length > MAX_PLAYLIST_SHARE_BYTES) throw new Error('Нужен файл .luma.json размером до 128 КБ.');
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error('Не удалось прочитать файл обмена Luma.'); }
    const shared = readSharedPlaylist(value);
    if (!shared) throw new Error('Не удалось прочитать файл обмена Luma.');
    return [{ title: shared.title, rows: shared.tracks, skipped: 0 }];
  }
  let total = 0;
  function draft(title: string, input: Iterable<ImportRow | undefined>): PlaylistDraft {
    const rows: ImportRow[] = [];
    let skipped = 0;
    for (const row of input) {
      if (++total > MAX_IMPORT_ROWS) throw new Error('В файле может быть не более 10 000 записей.');
      if (row) rows.push(row); else skipped++;
    }
    return { title, rows, skipped };
  }
  let lists: PlaylistDraft[];
  if (format === 'spotify-json') {
    let value: { playlists?: { name?: unknown; items?: unknown }[] } | null;
    try { value = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON Spotify.'); }
    if (!Array.isArray(value?.playlists) || value.playlists.length > MAX_IMPORT_LISTS) throw new Error('Выберите Playlist*.json из архива Spotify (до 100 плейлистов).');
    lists = value.playlists.flatMap((list) => Array.isArray(list?.items) ? [draft(playlistTitle(list.name) || name, spotifyRows(list.items))] : []);
  } else {
    // Apple Music's track information is a tab-separated table in .txt, not a list of prose lines.
    const header = format === 'txt' ? text.trimStart().split(/\r\n|\n|\r/u, 1)[0] : '';
    let input: Iterable<ImportRow | undefined>;
    if (format === 'm3u') input = m3uRows(text);
    else if (format === 'csv') input = mapReferences(csvTracks(text));
    else if (header.includes('\t')) {
      // Probe the header before falling back to artist<TAB>title. A malformed table is still an error.
      const table = csvTracks(text);
      let tableHeader = true;
      try { csvTracks(header).next(); } catch { tableHeader = false; }
      input = mapReferences(tableHeader ? table : textTracks(text));
    } else input = mapReferences(textTracks(text));
    lists = [draft(name, input)];
  }
  if (!lists.some(({ rows }) => rows.length)) throw new Error('В файле нет записей, которые можно сопоставить с медиатекой.');
  return lists;
}

function* mapReferences(input: Iterable<RecordingReference>) {
  for (const row of input) yield readRecordingReference(row);
}

export const IMPORT_STATUS = {
  match: 'Найден в медиатеке', chosen: 'Выбран вручную', unmatched: 'Нет в медиатеке', ambiguous: 'Несколько совпадений',
  skipped: 'Пропущен', duplicate: 'Повтор трека', limit: 'Сверх лимита',
} as const;
export type ImportStatus = keyof typeof IMPORT_STATUS;
export type PlaylistChoices = ReadonlyMap<number, string | null>;
export const canChooseForPlaylist = (track: Track) => !track.demo && !sessionCatalogId(track.id) && (!track.online || !!readOnlineTrack(track));

export function previewPlaylist(draft: PlaylistDraft, collection: readonly Track[], choices?: PlaylistChoices) {
  const find = localRecordingMatches(collection);
  const byId = new Map(collection.filter(canChooseForPlaylist).map((track) => [track.id, track]));
  const online = new Map<string, Track[]>();
  const files = new Map<string, Track[]>();
  const index = (map: Map<string, Track[]>, key: string, track: Track) => {
    const list = map.get(key);
    if (list) list.push(track); else map.set(key, [track]);
  };
  for (const track of byId.values()) {
    if (track.online) index(online, recordingKey(track), track);
    else if (track.fileName) index(files, basenameKey(track.fileName), track);
  }
  const items: Track[] = [];
  const seen = new Set<string>();
  const rows = draft.rows.map((ref, i) => {
    const compatible = (track: Track) => !(ref.isrc && track.isrc && ref.isrc !== track.isrc)
      && !(ref.duration && track.duration > 0 && Math.abs(ref.duration - track.duration) > 2);
    const meta = find(ref).filter(compatible);
    const byFile = ref.fileName ? files.get(basenameKey(ref.fileName)) ?? [] : [];
    let matches = meta.length ? meta : byFile;
    if (meta.length && byFile.length) {
      const ids = new Set(byFile.map(({ id }) => id));
      // An exact basename can distinguish copies with identical tags, but conflicting evidence cannot.
      const intersection = meta.filter(({ id }) => ids.has(id));
      matches = intersection.length ? intersection : [...meta, ...byFile];
    }
    const album = ref.album && musicSearchKey(ref.album);
    const suggested = (online.get(recordingKey(ref)) ?? []).filter((track) => compatible(track) && (!album || album === musicSearchKey(track.album)));
    const candidates = [...new Map([...matches.slice(0, 16), ...suggested.slice(0, 8)].map((track) => [track.id, track])).values()];
    const choice = choices?.get(i);
    const match = choice === undefined ? matches.length === 1 ? matches[0] : undefined : choice === null ? undefined : byId.get(choice);
    const status: ImportStatus = choice === null ? 'skipped' : !match ? matches.length > 1 || candidates.length ? 'ambiguous' : 'unmatched'
      : seen.has(match.id) ? 'duplicate' : items.length >= MAX_PLAYLIST_TRACKS ? 'limit' : choice === undefined ? 'match' : 'chosen';
    if (match && (status === 'match' || status === 'chosen')) { items.push(match); seen.add(match.id); }
    return { ref, match, status, candidates };
  });
  return { rows, items };
}
