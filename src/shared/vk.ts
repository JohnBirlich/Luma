export const LEGACY_VK_SESSION = 'persist:luma-vk-web';
const VK_ORIGIN = 'https://vk.ru';
export const VK_MUSIC_URL = `${VK_ORIGIN}/audio`;
const playlistPath = '/music/playlist/';
const idPattern = /^[1-9]\d{0,14}$/;
const ownerPattern = /^-?[1-9]\d{0,14}$/;
const hashPattern = /^[A-Za-z0-9_-]{1,128}$/;

export interface VkPlaylist {
  ownerId: number;
  playlistId: number;
  hash: string;
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

/** Validate the canonical destinations used by legacy VK bookmarks. */
export function isVkExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false;
  if (value === VK_MUSIC_URL) return true;
  const item = parseVkShareLink(value);
  return !!item && value === vkShelfUrl({ ...item, name: '' });
}
