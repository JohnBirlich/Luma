import type { CoverMime } from './artwork.js';

const VK_ORIGIN = 'https://vk.ru';
export const VK_MUSIC_URL = `${VK_ORIGIN}/audio`;
export const VK_WIDGET_DOCS_URL = 'https://dev.vk.ru/ru/widgets/playlist';
export const VK_WIDGET_URL = `${VK_ORIGIN}/widget_playlist.php`;
const playlistPath = '/music/playlist/';
const idPattern = /^[1-9]\d{0,14}$/;
const ownerPattern = /^-?[1-9]\d{0,14}$/;
const hashPattern = /^[A-Za-z0-9_-]{1,128}$/;

export interface VkPlaylist {
  ownerId: number;
  playlistId: number;
  hash: string;
}

export interface VkCoverImage {
  mime: CoverMime;
  bytes: Uint8Array;
}

export interface NamedVkPlaylist extends VkPlaylist {
  name: string;
}

// Public editorial playlist used by the official widget generator's example.
export const editorialPlaylist: NamedVkPlaylist = {
  ownerId: -147845620, playlistId: 5, hash: 'c09c1c34cdf7190efb', name: 'Сегодня в плеере',
};

export function isVkPlaylist(value: unknown): value is VkPlaylist {
  if (!value || typeof value !== 'object') return false;
  const { ownerId, playlistId, hash } = value as Partial<VkPlaylist>;
  return typeof ownerId === 'number' && ownerPattern.test(String(ownerId))
    && typeof playlistId === 'number' && idPattern.test(String(playlistId))
    && typeof hash === 'string' && hashPattern.test(hash);
}

export const vkPlaylistKey = ({ ownerId, playlistId }: VkPlaylist) => `${ownerId}_${playlistId}`;
export const vkPlaylistUrl = (playlist: VkPlaylist) => `${VK_ORIGIN}${playlistPath}${vkPlaylistKey(playlist)}`;
export const vkPlaylistShareUrl = (playlist: VkPlaylist) => `${vkPlaylistUrl(playlist)}_${playlist.hash}`;

export function vkWidgetUrl(playlist: VkPlaylist): string {
  const query = new URLSearchParams({ oid: String(playlist.ownerId), pid: String(playlist.playlistId), hash: playlist.hash });
  return `${VK_WIDGET_URL}?${query}`;
}

function readWidgetUrl(url: URL): VkPlaylist | null {
  if (url.protocol !== 'https:' || !['vk.ru', 'vk.com'].includes(url.hostname) || url.port
    || url.username || url.password || url.pathname !== '/widget_playlist.php') return null;
  const { searchParams } = url;
  const [owner, id, hash] = ['oid', 'pid', 'hash'].map((key) => {
    const values = searchParams.getAll(key);
    return values.length === 1 ? values[0] : '';
  });
  if (!ownerPattern.test(owner) || !idPattern.test(id) || !hashPattern.test(hash)) return null;
  return { ownerId: Number(owner), playlistId: Number(id), hash };
}

/** Read only literal IDs and the public widget hash; never run or inject pasted HTML or JavaScript. */
export function parseVkPlaylist(input: string): VkPlaylist | null {
  const text = input.trim();
  if (!text || text.length > 8192) return null;
  try { return readWidgetUrl(new URL(text)); } catch { /* The official generator returns a snippet. */ }
  const match = /\bVK\.Widgets\.Playlist\s*\(\s*(['"])[A-Za-z0-9_-]{1,128}\1\s*,\s*(-?[1-9]\d{0,14})\s*,\s*([1-9]\d{0,14})\s*,\s*(['"])([A-Za-z0-9_-]{1,128})\4\s*[,)]/.exec(text);
  if (!match) return null;
  return { ownerId: Number(match[2]), playlistId: Number(match[3]), hash: match[5] };
}

/** Only the canonical official widget URL may navigate an iframe in Electron. */
export function isVkWidgetFrameUrl(value: string): boolean {
  try {
    const playlist = readWidgetUrl(new URL(value));
    return !!playlist && value === vkWidgetUrl(playlist);
  } catch { return false; }
}

/** The Electron bridge opens only these specific, user-facing VK destinations. */
export function isVkExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  return value === VK_MUSIC_URL || value === VK_WIDGET_DOCS_URL
    || /^https:\/\/vk\.ru\/music\/playlist\/-?[1-9]\d{0,14}_[1-9]\d{0,14}$/.test(value);
}

const vkWebsiteOrigins = new Set(['https://vk.ru', 'https://vk.com', 'https://id.vk.ru', 'https://id.vk.com', 'https://login.vk.ru', 'https://login.vk.com']);

/** First-party pages for the isolated VK website window, not for the privileged Luma renderer. */
export function isVkWebsiteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && vkWebsiteOrigins.has(url.origin);
  } catch { return false; }
}
