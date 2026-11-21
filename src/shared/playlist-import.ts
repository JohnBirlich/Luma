import { MAX_PLAYLIST_TRACKS, playlistTitle } from './luma-playlists.js';
import { audioMime } from './media.js';
import type { Track } from './media.js';
import { basenameKey, csvTracks, localRecordingMatches, readRecordingReference, textTracks } from './track-list.js';
import type { RecordingReference } from './track-list.js';

export const MAX_PLAYLIST_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_LISTS = 100;
export interface ImportRow extends RecordingReference { fileName?: string }
export interface PlaylistDraft { title: string; rows: ImportRow[]; skipped: number }
export type PlaylistFormat = 'csv' | 'txt' | 'm3u' | 'spotify-json';

export function playlistImportFormat(fileName: string): PlaylistFormat | undefined {
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
  match: 'Найден в медиатеке', unmatched: 'Нет в медиатеке', ambiguous: 'Несколько совпадений', duplicate: 'Повтор трека', limit: 'Сверх лимита',
} as const;
export type ImportStatus = keyof typeof IMPORT_STATUS;

export function previewPlaylist(draft: PlaylistDraft, collection: readonly Track[]) {
  const find = localRecordingMatches(collection);
  const files = new Map<string, Track[]>();
  if (draft.rows.some(({ fileName }) => fileName)) for (const track of collection) {
    if (track.online || track.demo || !track.fileName) continue;
    const key = basenameKey(track.fileName);
    const list = files.get(key);
    if (list) list.push(track); else files.set(key, [track]);
  }
  const items: Track[] = [];
  const seen = new Set<string>();
  const rows = draft.rows.map((ref) => {
    const meta = find(ref);
    const byFile = ref.fileName ? files.get(basenameKey(ref.fileName)) ?? [] : [];
    let matches = meta.length ? meta : byFile;
    if (meta.length && byFile.length) {
      const ids = new Set(byFile.map(({ id }) => id));
      // An exact basename can distinguish copies with identical tags, but conflicting evidence cannot.
      const intersection = meta.filter(({ id }) => ids.has(id));
      matches = intersection.length ? intersection : [meta[0], byFile[0]];
    }
    const match = matches.length === 1 ? matches[0] : undefined;
    const status: ImportStatus = !match ? matches.length > 1 ? 'ambiguous' : 'unmatched'
      : seen.has(match.id) ? 'duplicate' : items.length >= MAX_PLAYLIST_TRACKS ? 'limit' : 'match';
    if (match) seen.add(match.id);
    if (status === 'match' && match) items.push(match);
    return { ref, match, status };
  });
  return { rows, items };
}
