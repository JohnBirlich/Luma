import { parseVkShareLink, vkPlaylistUrl } from './vk.js';

export const MUSIC_LINK_SCHEME = 'luma-player';
const OPEN = `${MUSIC_LINK_SCHEME}://open`;
const maxLength = 2048;
const trackVK = /^\/(?:music\/track\/|audio)(-?[1-9]\d{0,14}_[1-9]\d{0,14})\/?$/;
const overlayVK = /^audio(-?[1-9]\d{0,14}_[1-9]\d{0,14})$/;
const trackYandex = /^\/album\/[1-9]\d{0,14}\/track\/[1-9]\d{0,14}\/?$/;
const playlistYandex = /^\/(?:users\/[a-zA-Z0-9_.-]{1,64}\/playlists\/[1-9]\d{0,14}|playlists\/(?:[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}|[a-zA-Z0-9_-]{1,64}))\/?$/;
const trackOpenverse = /^\/audio\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\/?$/i;
export interface MusicLink { provider: 'vk' | 'yandex' | 'openverse'; kind: 'track' | 'playlist'; url: string }

function parse(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > maxLength || /[\\\p{Cc}]/u.test(value) || !/^[a-z-]+:\/\//i.test(value.trim())) return;
  try {
    const url = new URL(value.trim());
    if (!url.username && !url.password && !url.port) return url;
  } catch { /* Invalid link. */ }
}

export function readMusicLink(value: unknown): MusicLink | undefined {
  const outer = parse(value);
  if (!outer) return;
  let url: URL | undefined = outer;
  if (outer.protocol === `${MUSIC_LINK_SCHEME}:`) {
    if (outer.hostname !== 'open' || !['', '/'].includes(outer.pathname) || outer.hash
      || [...outer.searchParams].length !== 1) return;
    url = parse(outer.searchParams.get('url'));
  }
  if (!url || url.protocol !== 'https:') return;
  if (['vk.ru', 'vk.com'].includes(url.hostname)) {
    const list = parseVkShareLink(url.href);
    if (list) return { provider: 'vk', kind: 'playlist', url: vkPlaylistUrl(list) };
    const overlay = url.searchParams.getAll('z');
    const track = trackVK.exec(url.pathname)?.[1]
      ?? (overlay.length === 1 && /^\/(?:music|audio|audios-?\d+)?\/?$/.test(url.pathname) ? overlayVK.exec(overlay[0])?.[1] : undefined);
    if (track) return { provider: 'vk', kind: 'track', url: `https://vk.ru/audio${track}` };
  } else if (['music.yandex.ru', 'music.yandex.com'].includes(url.hostname)) {
    if (trackYandex.test(url.pathname) || playlistYandex.test(url.pathname)) return {
      provider: 'yandex', kind: trackYandex.test(url.pathname) ? 'track' : 'playlist', url: url.origin + url.pathname.replace(/\/$/, ''),
    };
  } else if (url.hostname === 'openverse.org' && trackOpenverse.test(url.pathname)) {
    return { provider: 'openverse', kind: 'track', url: url.origin + url.pathname.toLowerCase().replace(/\/?$/, '/') };
  }
}

export function musicLaunchUrl(link: MusicLink) {
  return `${OPEN}?${new URLSearchParams({ url: link.url })}`;
}

/** Windows passes application/Chromium switches in the same array; only inspect non-switch URLs. */
export function musicLinkArgument(args: readonly string[]) {
  for (const value of args.slice(0, 32)) {
    if (!value.startsWith(`${MUSIC_LINK_SCHEME}://`)) continue;
    const link = readMusicLink(value);
    if (link) return link.url;
  }
}
