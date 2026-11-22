import { cleanTrackText, musicSearchKey } from './russian.js';

export const SEARCH_HISTORY_LIMIT = 12;
function searchEntry(value: unknown) {
  const text = cleanTrackText(value).replace(/\s+/gu, ' ').slice(0, 140).trimEnd();
  return text.length >= 2 && /[\p{L}\p{N}]/u.test(text) && !text.includes('://') ? text : '';
}
export function readSearchHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const history = new Map<string, string>();
  for (const item of value.slice(0, SEARCH_HISTORY_LIMIT)) {
    const entry = searchEntry(item), key = musicSearchKey(entry);
    if (entry && !history.has(key)) history.set(key, entry);
  }
  return [...history.values()];
}
export function rememberSearch(history: string[], value: string) {
  const entry = searchEntry(value);
  if (!entry || entry === history[0]) return history;
  return readSearchHistory([entry, ...history.filter((item) => musicSearchKey(item) !== musicSearchKey(entry))]);
}
