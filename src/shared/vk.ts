export const LEGACY_VK_SESSION = 'persist:luma-vk-web';
const VK_ORIGIN = 'https://vk.ru';
export const VK_MUSIC_URL = `${VK_ORIGIN}/audio`;
interface VkShareLink { ownerId: number; playlistId: number; shareKey?: string }

const overlayPattern = /^audio_playlist(-?[1-9]\d{0,14})_([1-9]\d{0,14})(?:[\/_]([A-Za-z0-9_-]{1,128}))?\/?$/;
const sharePattern = /^\/music\/playlist\/(-?[1-9]\d{0,14})_([1-9]\d{0,14})(?:_([A-Za-z0-9_-]{1,128}))?\/?$/;

export function parseVkShareLink(value: string): VkShareLink | undefined {
  try {
    const url = new URL(value.trim());
    if (!['https://vk.ru', 'https://vk.com'].includes(url.origin) || url.username || url.password) return;
    const overlay = url.searchParams.getAll('z');
    const match = sharePattern.exec(url.pathname)
      ?? (overlay.length === 1 && /^\/(?:music|audio|audios-?\d+)?\/?$/.test(url.pathname) ? overlayPattern.exec(overlay[0]) : null);
    if (match) return { ownerId: Number(match[1]), playlistId: Number(match[2]), shareKey: match[3] };
  } catch { /* Not an official playlist URL. */ }
}

export function vkPlaylistUrl({ ownerId, playlistId, shareKey }: VkShareLink) {
  return `${VK_ORIGIN}/music/playlist/${ownerId}_${playlistId}${shareKey ? `_${shareKey}` : ''}`;
}
