import { serviceQuery } from './music-services.js';
import { readMusicLink } from './music-links.js';
import { VK_MUSIC_URL } from './vk.js';

// A separate Chromium profile. Never reuse cookies from Luma's old VK modes or the system browser.
export const VK_SITE_PARTITION = 'persist:luma-vk-site';
const musicHosts = ['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com', 'music.vk.ru', 'music.vk.com'];
const siteHosts = new Set([...musicHosts, 'id.vk.ru', 'id.vk.com', 'login.vk.ru', 'login.vk.com', 'oauth.vk.ru', 'oauth.vk.com']);
export const VK_TRANSPORT = ['previous', 'toggle', 'next'] as const;
export type VkTransport = typeof VK_TRANSPORT[number];
export type VkSiteAction = VkTransport | 'back' | 'reload' | 'music';
export interface VkBounds { x: number; y: number; width: number; height: number }
export interface VkNowPlaying { title: string; artist: string; playing: boolean; previous: boolean; toggle: boolean; next: boolean }
export interface VkSiteState { host: string; phase: 'loading' | 'ready' | 'failed' | 'closed'; back: boolean; track?: VkNowPlaying }

function https(value: unknown) {
  if (typeof value !== 'string' || value.length > 8192 || /[\\\p{Cc}]/u.test(value)) return;
  const url = URL.parse(value);
  if (url?.protocol === 'https:' && !url.username && !url.password && !url.port) return url;
}

export function vkSiteUrl(value: unknown) {
  const url = https(value);
  return url && siteHosts.has(url.hostname) && !/^\/away(?:\.php|\/|$)/i.test(url.pathname) ? url : undefined;
}

export function vkMusicSearchUrl(value: unknown) {
  const query = serviceQuery(value);
  return query ? `${VK_MUSIC_URL}?${new URLSearchParams({ q: query })}` : undefined;
}

export function vkSiteEntry(value: unknown): value is string {
  const url = vkSiteUrl(value);
  if (!url || typeof value !== 'string') return false;
  if (value === VK_MUSIC_URL || vkMusicSearchUrl(url.searchParams.get('q')) === value) return true;
  const link = readMusicLink(value);
  return link?.provider === 'vk' && link.url === value;
}

export function vkMusicPage(value: string) {
  const url = vkSiteUrl(value);
  return !!url && musicHosts.includes(url.hostname) && /^\/(?:audio(?:-?\d+_\d+)?\/?|audios-?\d+\/?|music(?:\/.*)?)$/.test(url.pathname);
}

export function vkViewBounds(value: unknown, zoom: number, w: number, h: number): VkBounds | undefined {
  if (!value || typeof value !== 'object') return;
  const { x, y, width, height } = value as VkBounds;
  if (![x, y, width, height, zoom, w, h].every((n) => Number.isFinite(n) && n >= 0 && n < 100_000)) return;
  const left = Math.ceil(x * zoom), top = Math.ceil(y * zoom);
  const right = Math.min(w, Math.floor((x + width) * zoom)), bottom = Math.min(h, Math.floor((y + height) * zoom));
  if (right - left < 168 || bottom - top < 80) return;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function readVkNowPlaying(value: unknown): VkNowPlaying | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as Partial<VkNowPlaying>;
  const text = (input: unknown) => typeof input === 'string' ? input.slice(0, 256).replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ').trim().slice(0, 160) : '';
  const title = text(row.title), artist = text(row.artist);
  const previous = row.previous === true, toggle = row.toggle === true, next = row.next === true;
  if (title || artist || previous || toggle || next) return { title, artist, playing: row.playing === true, previous, toggle, next };
}
