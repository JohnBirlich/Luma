import { useEffect, useRef, useState } from 'react';
import { vkPlaylistShareUrl } from '../shared/vk';
import type { VkCoverImage, VkPlaylist } from '../shared/vk';

interface CachedCover { until: number; image: Promise<VkCoverImage | null> }
const cache = new Map<string, CachedCover>();

function requestCover(playlist: VkPlaylist, key: string, refresh: boolean): Promise<VkCoverImage | null> {
  const previous = cache.get(key);
  if (!refresh && previous && Date.now() < previous.until) return previous.image;
  const request = window.luma?.getVkCover;
  if (!request) return Promise.resolve(null);
  const entry: CachedCover = {
    until: Date.now() + 60_000,
    image: request({ ownerId: playlist.ownerId, playlistId: playlist.playlistId, hash: playlist.hash }).then((image) => {
      if (image) entry.until = Date.now() + 15 * 60_000;
      return image;
    }).catch(() => null),
  };
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return entry.image;
}

/** Load only the opened playlist; already viewed covers remain on the shelf for this page. */
export function useVkArtwork(playlist: VkPlaylist, refresh: number) {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const live = useRef(new Map<string, string>());
  const previousRefresh = useRef(refresh);
  const { ownerId, playlistId, hash } = playlist;
  useEffect(() => {
    const current = { ownerId, playlistId, hash };
    const key = vkPlaylistShareUrl(current);
    const retry = previousRefresh.current !== refresh;
    previousRefresh.current = refresh;
    if (!retry && live.current.has(key)) return;
    let cancelled = false;
    void requestCover(current, key, retry).then((image) => {
      if (cancelled || !image) return;
      const old = live.current.get(key);
      if (old) URL.revokeObjectURL(old);
      live.current.delete(key);
      live.current.set(key, URL.createObjectURL(new Blob([Uint8Array.from(image.bytes)], { type: image.mime })));
      if (live.current.size > 40) {
        const oldest = live.current.keys().next().value!;
        URL.revokeObjectURL(live.current.get(oldest)!);
        live.current.delete(oldest);
      }
      setUrls(new Map(live.current));
    });
    return () => { cancelled = true; };
  }, [ownerId, playlistId, hash, refresh]);
  useEffect(() => () => {
    for (const url of live.current.values()) URL.revokeObjectURL(url);
    live.current.clear();
  }, []);
  return urls;
}
