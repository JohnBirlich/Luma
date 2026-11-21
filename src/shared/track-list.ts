import type { Track } from './media.js';
import { knownRecordingName, recordingKey } from './recording-match.js';
import { cleanTrackText, musicSearchKey } from './russian.js';

/** Metadata only. Never carry service URLs, paths, or credentials. */
export interface RecordingReference { title: string; artist: string; album: string }
const MAX_FIELD = 240;
const invalidCsv = 'Не удалось прочитать CSV. Проверьте разделители и кавычки.';

export function readRecordingReference(value: unknown): RecordingReference | undefined {
  if (!value || typeof value !== 'object') return;
  const { title, artist, album } = value as Partial<RecordingReference>;
  const field = (text: unknown) => cleanTrackText(text).slice(0, MAX_FIELD);
  const name = field(title);
  if (name) return { title: name, artist: field(artist), album: field(album) };
}

// Basenames are matched without removing punctuation, whitespace, or Cyrillic distinctions.
export const basenameKey = (name: string) => name.normalize('NFC').toLowerCase();

export { recordingKey };
function* delimitedRows(text: string, separator: string) {
  let row: string[] = [], field = '';
  let quoted = false, closed = false;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === undefined) throw new Error(invalidCsv);
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (char === separator || char === '\n' || char === '\r' || char === undefined) {
      row.push(field); field = ''; closed = false;
      if (char !== separator) {
        if (row.some((cell) => cell.trim())) yield row;
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (char === '"' && !closed && !field.trim()) {
      field = ''; quoted = true;
    } else if (closed ? char !== ' ' && char !== '\t' : char === '"') {
      throw new Error(invalidCsv);
    } else if (!closed) field += char;
  }
}

const titleNames = new Set(['title', 'track', 'name', 'track title', 'track name', 'song name', 'song title', 'название', 'трек', 'название трека']);
const artistNames = new Set(['artist', 'artists', 'artist name', 'artist names', 'track artist', 'track artist names', 'исполнитель', 'исполнители']);
const albumNames = new Set(['album', 'album name', 'album title', 'альбом', 'название альбома']);

export function* csvTracks(text: string): Generator<RecordingReference> {
  for (const separator of [',', ';', '\t']) {
    const rows = delimitedRows(text, separator);
    let header: string[];
    try {
      const first = rows.next();
      if (first.done) continue;
      header = first.value;
    } catch { continue; }
    const names = header.map((cell) => musicSearchKey(cell.replace(/\(s\)/gi, 's').replaceAll('_', ' ')));
    const title = names.findIndex((name) => titleNames.has(name));
    if (title < 0) continue;
    const artist = names.findIndex((name) => artistNames.has(name));
    const album = names.findIndex((name) => albumNames.has(name));
    for (const row of rows) {
      if (row.length !== header.length) throw new Error(invalidCsv);
      yield { title: row[title], artist: row[artist] ?? '', album: row[album] ?? '' };
    }
    return;
  }
  throw new Error('В CSV нужна строка заголовков с колонкой title или «Название».');
}

export function* textTracks(text: string): Generator<RecordingReference> {
  for (const line of text.split(/\r\n|\n|\r/u)) {
    const value = line.trim();
    if (!value) continue;
    const separator = /\t| [–—-] /u.exec(value);
    if (!separator) throw new Error('В TXT запишите по одному треку на строку: Исполнитель — Название.');
    yield { title: value.slice(separator.index + separator[0].length).trim(), artist: value.slice(0, separator.index).trim(), album: '' };
  }
}

export function localRecordingMatches(tracks: readonly Track[]) {
  const index = new Map<string, Track[]>();
  for (const track of tracks) {
    if (track.demo || track.online) continue;
    const key = recordingKey(track);
    const list = index.get(key);
    if (list) list.push(track);
    else index.set(key, [track]);
  }
  return (item: RecordingReference): readonly Track[] => {
    if (!knownRecordingName(item)) return [];
    const byName = index.get(recordingKey(item)) ?? [];
    return item.album ? byName.filter(({ album }) => musicSearchKey(album) === musicSearchKey(item.album)) : byName;
  };
}
