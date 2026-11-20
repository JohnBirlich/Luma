import type { Track } from './media.js';
import { cleanTrackText, musicSearchKey } from './russian.js';

export const MAX_VK_TRACK_FILE = 2 * 1024 * 1024;
export const MAX_VK_TRACKS = 10_000;
const MAX_FIELD = 240;
const invalidCsv = 'Не удалось прочитать CSV. Проверьте разделители и кавычки.';

/** Imported references are not Track objects, and never include a URI, token, or audio. */
export interface VkTrack { title: string; artist: string; album: string }
export type VkListFormat = 'csv' | 'txt';

function readItem(value: unknown): VkTrack | undefined {
  if (!value || typeof value !== 'object') return;
  const { title, artist, album } = value as Partial<VkTrack>;
  const field = (text: unknown) => cleanTrackText(text).slice(0, MAX_FIELD);
  const name = field(title);
  if (name) return { title: name, artist: field(artist), album: field(album) };
}

const recordingKey = ({ title, artist }: Pick<VkTrack, 'title' | 'artist'>) => JSON.stringify([musicSearchKey(title), musicSearchKey(artist)]);
export const vkTrackKey = (row: VkTrack) => `${recordingKey(row)}:${musicSearchKey(row.album)}`;

export function readVkTracks(value: unknown) {
  const items = new Map<string, VkTrack>();
  for (const row of Array.isArray(value) ? value.slice(0, MAX_VK_TRACKS) : []) {
    const item = readItem(row);
    if (item && !items.has(vkTrackKey(item))) items.set(vkTrackKey(item), item);
  }
  return [...items.values()];
}

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

const titleNames = new Set(['title', 'track', 'name', 'track title', 'track name', 'название', 'трек', 'название трека']);
const artistNames = new Set(['artist', 'artists', 'artist name', 'artist names', 'track artist', 'исполнитель', 'исполнители']);
const albumNames = new Set(['album', 'album name', 'album title', 'альбом', 'название альбома']);

function* csvTracks(text: string): Generator<VkTrack> {
  for (const separator of [',', ';', '\t']) {
    const rows = delimitedRows(text, separator);
    let header: string[];
    try {
      const first = rows.next();
      if (first.done) continue;
      header = first.value;
    } catch { continue; }
    const names = header.map((cell) => musicSearchKey(cell.replaceAll('_', ' ')));
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

function* textTracks(text: string): Generator<VkTrack> {
  for (const line of text.split(/\r\n|\n|\r/u)) {
    const value = line.trim();
    if (!value) continue;
    const separator = /\t| [–—-] /u.exec(value);
    if (!separator) throw new Error('В TXT запишите по одному треку на строку: Исполнитель — Название.');
    yield { title: value.slice(separator.index + separator[0].length).trim(), artist: value.slice(0, separator.index).trim(), album: '' };
  }
}

export function parseVkTracks(bytes: Uint8Array, format: VkListFormat): VkTrack[] {
  if (bytes.byteLength > MAX_VK_TRACK_FILE) throw new Error('Выберите CSV или TXT размером до 2 МБ.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Не удалось прочитать файл. Сохраните его в кодировке UTF-8.'); }
  if (text.includes('\0')) throw new Error('Не удалось прочитать файл. Сохраните его в кодировке UTF-8.');
  const items = new Map<string, VkTrack>();
  for (const row of format === 'csv' ? csvTracks(text) : textTracks(text)) {
    const item = readItem(row);
    if (item && !items.has(vkTrackKey(item))) {
      if (items.size === MAX_VK_TRACKS) throw new Error('В списке может быть не более 10 000 треков.');
      items.set(vkTrackKey(item), item);
    }
  }
  if (!items.size) throw new Error('В файле нет треков.');
  return [...items.values()];
}

export function filterVkTracks(items: readonly VkTrack[], query: string) {
  const terms = musicSearchKey(query).split(' ').filter(Boolean);
  return terms.length ? items.filter((item) => {
    const text = musicSearchKey(`${item.artist} ${item.title} ${item.album}`);
    return terms.every((term) => text.includes(term));
  }) : items;
}

export function vkLocalFiles(tracks: readonly Track[]) {
  const byRecording = new Map<string, Track[]>();
  for (const track of tracks) {
    if (track.demo || track.online) continue;
    const key = recordingKey(track);
    const list = byRecording.get(key);
    if (list) list.push(track);
    else byRecording.set(key, [track]);
  }
  return (item: VkTrack) => {
    if (!item.artist) return undefined;
    const byName = byRecording.get(recordingKey(item));
    const matches = item.album ? byName?.filter(({ album }) => musicSearchKey(album) === musicSearchKey(item.album)) : byName;
    return matches?.length === 1 ? matches[0] : undefined;
  };
}
