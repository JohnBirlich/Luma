import { editorialPlaylist, isVkPlaylist, vkPlaylistKey } from '../shared/vk';
import type { NamedVkPlaylist } from '../shared/vk';

const STORAGE_KEY = 'luma-player:vk-playlists:v1';
export const MAX_VK_PLAYLISTS = 40;

interface VkShelf {
  playlists: NamedVkPlaylist[];
  selected: string;
}

export function readVkShelf(): VkShelf {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<VkShelf> | null;
    const data = Array.isArray(saved?.playlists) ? saved.playlists : [];
    const playlists: NamedVkPlaylist[] = [];
    const keys = new Set([vkPlaylistKey(editorialPlaylist)]);
    for (const item of data.slice(0, MAX_VK_PLAYLISTS)) {
      if (!isVkPlaylist(item) || typeof (item as Partial<NamedVkPlaylist>).name !== 'string') continue;
      const key = vkPlaylistKey(item);
      if (keys.has(key)) continue;
      const { ownerId, playlistId, hash } = item;
      const name = (item as NamedVkPlaylist).name.trim().slice(0, 70) || `Плейлист ${playlistId}`;
      playlists.push({ ownerId, playlistId, hash, name });
      keys.add(key);
    }
    const selected = typeof saved?.selected === 'string' && keys.has(saved.selected) ? saved.selected : vkPlaylistKey(editorialPlaylist);
    return { playlists, selected };
  } catch { return { playlists: [], selected: vkPlaylistKey(editorialPlaylist) }; }
}

export function saveVkShelf(shelf: VkShelf) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(shelf)); } catch { /* VK can still be used in this window. */ }
}
