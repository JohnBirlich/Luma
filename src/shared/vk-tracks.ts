import type { Track } from './media.js';
import { musicSearchKey } from './russian.js';
import { csvTracks, localRecordingMatches, readRecordingReference, recordingKey, textTracks } from './track-list.js';
import type { RecordingReference } from './track-list.js';

export const MAX_VK_TRACK_FILE = 2 * 1024 * 1024;
export const MAX_VK_TRACKS = 10_000;
/** Imported references are not Track objects. */
export type VkTrack = RecordingReference;
export type VkListFormat = 'csv' | 'txt';

export const vkTrackKey = (row: VkTrack) => `${recordingKey(row)}:${musicSearchKey(row.album)}`;

export function readVkTracks(value: unknown) {
  const items = new Map<string, VkTrack>();
  for (const row of Array.isArray(value) ? value.slice(0, MAX_VK_TRACKS) : []) {
    const item = readRecordingReference(row);
    if (item && !items.has(vkTrackKey(item))) items.set(vkTrackKey(item), item);
  }
  return [...items.values()];
}

export function parseVkTracks(bytes: Uint8Array, format: VkListFormat): VkTrack[] {
  if (bytes.byteLength > MAX_VK_TRACK_FILE) throw new Error('Выберите CSV или TXT размером до 2 МБ.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Не удалось прочитать файл. Сохраните его в кодировке UTF-8.'); }
  if (text.includes('\0')) throw new Error('Не удалось прочитать файл. Сохраните его в кодировке UTF-8.');
  const items = new Map<string, VkTrack>();
  for (const row of format === 'csv' ? csvTracks(text) : textTracks(text)) {
    const item = readRecordingReference(row);
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
  const find = localRecordingMatches(tracks);
  return (item: VkTrack) => {
    const matches = find(item);
    return matches.length === 1 ? matches[0] : undefined;
  };
}
