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

export interface VkViewBounds { x: number; y: number; width: number; height: number }
export interface VkWebsiteState { host: string; loading: boolean; failed: boolean; canGoBack: boolean }

export interface VkCoverImage {
  mime: CoverMime;
  bytes: Uint8Array;
}

export interface VkShelfItem extends Pick<VkPlaylist, 'ownerId' | 'playlistId'> {
  name: string;
  // A share key opens a public page only; it does not grant licensed widget playback.
  shareKey?: string;
  hash?: string;
}
export type NamedVkPlaylist = VkShelfItem & VkPlaylist;

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

export const vkPlaylistKey = ({ ownerId, playlistId }: Pick<VkPlaylist, 'ownerId' | 'playlistId'>) => `${ownerId}_${playlistId}`;
export const vkPlaylistUrl = (playlist: Pick<VkPlaylist, 'ownerId' | 'playlistId'>) => `${VK_ORIGIN}${playlistPath}${vkPlaylistKey(playlist)}`;
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
  if (match) return { ownerId: Number(match[2]), playlistId: Number(match[3]), hash: match[5] };
  const frame = /<iframe\b[^<>]*?\ssrc\s*=\s*(['"])(https:\/\/[^'"<>]+)\1/i.exec(text);
  if (frame) {
    try { return readWidgetUrl(new URL(frame[2].replaceAll('&amp;', '&'))); } catch { /* Invalid iframe URL. */ }
  }
  return null;
}

/** Only the canonical official widget URL may navigate an iframe in Electron. */
export function isVkWidgetFrameUrl(value: string): boolean {
  try {
    const playlist = readWidgetUrl(new URL(value));
    return !!playlist && value === vkWidgetUrl(playlist);
  } catch { return false; }
}

const overlayPattern = /^audio_playlist(-?[1-9]\d{0,14})_([1-9]\d{0,14})(?:[\/_]([A-Za-z0-9_-]{1,128}))?\/?$/;
const sharePattern = /^\/music\/playlist\/(-?[1-9]\d{0,14})_([1-9]\d{0,14})(?:_([A-Za-z0-9_-]{1,128}))?\/?$/;

export function parseVkShareLink(value: string): Omit<VkShelfItem, 'name' | 'hash'> | undefined {
  try {
    const url = new URL(value.trim());
    if (!['https://vk.ru', 'https://vk.com'].includes(url.origin) || url.username || url.password) return;
    const overlay = url.searchParams.getAll('z');
    const match = sharePattern.exec(url.pathname)
      ?? (overlay.length === 1 && /^\/(?:music|audio|audios-?\d+)?\/?$/.test(url.pathname) ? overlayPattern.exec(overlay[0]) : null);
    if (match) return { ownerId: Number(match[1]), playlistId: Number(match[2]), shareKey: match[3] };
  } catch { /* Not an official playlist URL. */ }
}

export function vkShelfUrl(item: VkShelfItem) {
  return `${vkPlaylistUrl(item)}${item.shareKey ? `_${item.shareKey}` : ''}`;
}

/** The desktop bridge opens only canonical VK destinations selected by the user. */
export function isVkMusicDestination(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false;
  if (value === VK_MUSIC_URL) return true;
  const item = parseVkShareLink(value);
  return !!item && value === vkShelfUrl({ ...item, name: '' });
}

export function isVkExternalUrl(value: unknown): value is string {
  return value === VK_WIDGET_DOCS_URL;
}

// The account surface is first-party VK web content, not a general browser or an OAuth client.
const vkWebHosts = new Set(['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com', 'music.vk.com', 'music.vk.ru',
  'id.vk.ru', 'id.vk.com', 'login.vk.ru', 'login.vk.com', 'oauth.vk.ru', 'oauth.vk.com']);
export function isVkWebsiteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && vkWebHosts.has(url.hostname)
      && !/^\/away(?:\.php|\/|$)/i.test(url.pathname);
  } catch { return false; }
}
