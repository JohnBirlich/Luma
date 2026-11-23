import { musicSearchKey } from './russian.js';
import { vkHistoryLink, vkMusicSearchUrl } from './vk-site.js';

export const VK_HISTORY_LIMIT = 60;
export interface VkHistoryEntry { title: string; artist: string; link?: string }

const text = (value: unknown) => typeof value === 'string'
  ? value.slice(0, 256).replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ').trim().slice(0, 160) : '';

export function readVkHistoryEntry(value: unknown): VkHistoryEntry | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as Partial<VkHistoryEntry>;
  const title = text(row.title), artist = text(row.artist);
  if (!title || !musicSearchKey(title) || (!artist && /^(?:vk music|vk музыка|вк музыка)$/i.test(title))) return;
  const link = vkHistoryLink(row.link);
  return { title, artist, ...(link && { link }) };
}

const identity = (entry: VkHistoryEntry) => `${musicSearchKey(entry.title)}\n${musicSearchKey(entry.artist)}`;
export const vkHistoryKey = (entry: VkHistoryEntry) => entry.link ?? identity(entry);

export function readVkHistory(value: unknown): VkHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const result: VkHistoryEntry[] = [];
  for (const item of value.slice(0, VK_HISTORY_LIMIT * 2)) {
    const entry = readVkHistoryEntry(item);
    if (entry && !result.some(other => vkHistoryKey(other) === vkHistoryKey(entry))) result.push(entry);
    if (result.length >= VK_HISTORY_LIMIT) break;
  }
  // Reconcile an entry previously saved without its canonical link, without
  // dropping distinct recordings that happen to have the same title and artist.
  return result.filter((entry) => entry.link || result.filter(other => other.link && identity(other) === identity(entry)).length !== 1);
}

export function rememberVkListen(items: VkHistoryEntry[], value: unknown): VkHistoryEntry[] {
  const entry = readVkHistoryEntry(value);
  if (!entry) return items;
  const label = identity(entry);
  const exact = items.filter(other => other.link && identity(other) === label);
  const link = entry.link ?? (exact.length === 1 ? exact[0].link : undefined);
  const matches = (other: VkHistoryEntry) => other.link ? other.link === link : identity(other) === label;
  const first = items[0];
  if (first?.title === entry.title && first.artist === entry.artist && first.link === link) return items;
  return [{ title: entry.title, artist: entry.artist, ...(link && { link }) }, ...items.filter(other => !matches(other))].slice(0, VK_HISTORY_LIMIT);
}

export function vkHistoryDestination(entry: VkHistoryEntry) {
  const link = vkHistoryLink(entry.link);
  if (link) return link;
  const cut = (value: string, max: number) => value.slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
  const artist = cut(entry.artist, 60), title = cut(entry.title, artist ? 137 - artist.length : 140);
  return vkMusicSearchUrl(artist ? `${artist} — ${title}` : title);
}
