import { editorialPlaylist, isVkPlaylist, parseVkShareLink, vkPlaylistKey, vkShelfUrl } from '../shared/vk';
import type { VkShelfItem } from '../shared/vk';

const STORAGE_KEY = 'luma-player:vk-playlists:v1';
export const MAX_VK_PLAYLISTS = 40;

interface VkShelf {
  playlists: VkShelfItem[];
  selected: string;
}

export function readVkShelf(): VkShelf {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<VkShelf> | null;
    const data = Array.isArray(saved?.playlists) ? saved.playlists : [];
    const playlists: VkShelfItem[] = [];
    const keys = new Set([vkPlaylistKey(editorialPlaylist)]);
    for (const item of data.slice(0, MAX_VK_PLAYLISTS)) {
      if (!item || typeof item.name !== 'string' || !Number.isSafeInteger(item.ownerId) || !Number.isSafeInteger(item.playlistId)) continue;
      const parsed = parseVkShareLink(vkShelfUrl({ ...item, shareKey: typeof item.shareKey === 'string' && /^[\w-]{1,128}$/.test(item.shareKey) ? item.shareKey : undefined }));
      if (!parsed) continue;
      const key = vkPlaylistKey(parsed);
      if (keys.has(key)) continue;
      const { playlistId } = parsed;
      const name = item.name.trim().slice(0, 70) || `Плейлист ${playlistId}`;
      playlists.push({ ...parsed, hash: isVkPlaylist(item) ? item.hash : undefined, name });
      keys.add(key);
    }
    const selected = typeof saved?.selected === 'string' && keys.has(saved.selected) ? saved.selected : vkPlaylistKey(editorialPlaylist);
    return { playlists, selected };
  } catch { return { playlists: [], selected: vkPlaylistKey(editorialPlaylist) }; }
}

export function saveVkShelf(shelf: VkShelf) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(shelf)); } catch { /* VK can still be used in this window. */ }
}
