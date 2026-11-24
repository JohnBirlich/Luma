import { serviceQuery } from './music-services.js';
import { readMusicLink } from './music-links.js';
import { VK_MUSIC_URL } from './vk.js';
import type { VkDomainName } from './labs.js';
import type { Repeat } from './queue.js';

// A separate Chromium profile. Never reuse cookies from Luma's old VK modes or the system browser.
export const VK_SITE_PARTITION = 'persist:luma-vk-site';
const musicHosts = ['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com', 'music.vk.ru', 'music.vk.com'];
const siteHosts = new Set([...musicHosts, 'id.vk.ru', 'id.vk.com', 'login.vk.ru', 'login.vk.com', 'oauth.vk.ru', 'oauth.vk.com']);
export const VK_TRANSPORT = ['previous', 'toggle', 'next'] as const;
export type VkTransport = typeof VK_TRANSPORT[number];
export type VkPlaybackAction = VkTransport | 'pause' | 'shuffle' | 'repeat' | 'favorite' | 'like' | 'dislike' | 'volume' | 'mute';
export type VkSiteAction = VkPlaybackAction | 'seek' | 'back' | 'reload' | 'music';
/** VK's own catalogue entries Luma can start in the guest, in place, without leaving Home. */
export const VK_COLLECTIONS = ['mix', 'for-you', 'new', 'recent', 'favorites', 'genre', 'mood'] as const;
export type VkCollection = typeof VK_COLLECTIONS[number];
export const readVkCollection = (value: unknown): VkCollection | undefined =>
  typeof value === 'string' && (VK_COLLECTIONS as readonly string[]).includes(value) ? value as VkCollection : undefined;
/** A genre or mood is only ever a short literal name, never markup or a URL. */
export const readVkCollectionName = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 64 ? value.trim().replace(/\s+/gu, ' ') : undefined;
export interface VkBounds { x: number; y: number; width: number; height: number }
export interface VkPosition { position: number; duration: number; seek: boolean }
export interface VkNowPlaying {
  title: string; artist: string; playing: boolean; previous: boolean; toggle: boolean; next: boolean; timeline?: VkPosition;
  /** Opaque cover key from the app's own cache, so a saved listen keeps its artwork without a VK URL. */
  artwork?: string;
  link?: string; volume?: number; canMute?: boolean; shuffle?: boolean; repeat?: Repeat; favorite?: boolean;
  /** The rendered player's heart, which is a different control from “add to my music”. */
  liked?: boolean; disliked?: boolean;
}
export interface VkSiteState {
  host: string; phase: 'loading' | 'ready' | 'failed' | 'closed'; back: boolean; signIn: boolean; track?: VkNowPlaying;
  /** Ephemeral Luma image URL; no page URL or authentication data crosses IPC. */
  cover?: string;
  /** Playback has started in this signed-in music document. It stays selected when paused. */
  engaged?: boolean;
}

function https(value: unknown) {
  if (typeof value !== 'string' || value.length > 8192 || /[\\\p{Cc}]/u.test(value)) return;
  const url = URL.parse(value);
  if (url?.protocol === 'https:' && !url.username && !url.password && !url.port) return url;
}

export const VK_COVER_KEY = /^[a-f0-9]{32}$/;
export const VK_ARTWORK_HOST = /^sun[0-9]{1,3}(?:-[0-9]{1,4})?\.(?:userapi\.com|vkuserphoto\.ru)$/;
const artworkQuery = new Set(['as', 'ava', 'c_uniq_tag', 'crop', 'cs', 'from', 'keep_aspect_ratio', 'quality', 'sign', 'size', 'stp', 'type', 'u']);

/** Only VK's numbered image CDN and raster image routes; never arbitrary guest URLs. */
export function vkArtworkUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2_048 || /[^\x21-\x7e]/u.test(value)) return;
  const url = https(value);
  if (!url || url.hash || !VK_ARTWORK_HOST.test(url.hostname)
    || !/^\/(?:[\w-]+\/)*[\w.-]+$/u.test(url.pathname)
    || [...url.searchParams.keys()].some(key => !artworkQuery.has(key))) return;
  const cdnPath = url.pathname.startsWith('/impg/') || /^\/s\/v[12]\/(?:[\w-]+\/)+[\w-]+(?:\.(?:jpe?g|png|webp))?$/iu.test(url.pathname);
  const raster = /\.(?:jpe?g|png|webp)$/i.test(url.pathname);
  // The newer vkuserphoto.ru host is used for rendered VK thumbnails. Limit it
  // to observed raster delivery routes instead of trusting every path on it.
  if (url.hostname.endsWith('.vkuserphoto.ru') ? cdnPath && raster : cdnPath || raster) return url.href;
}

/**
 * The size a VK image address advertises. The rendered player draws small
 * thumbnails, so candidates are ranked by this instead of by DOM order to keep
 * the sharpest rendition for the hero and the saved listen.
 */
export function vkArtworkPixels(value: unknown) {
  const url = typeof value === 'string' ? URL.parse(value) : undefined;
  if (!url) return 0;
  let pixels = 0;
  for (const [name, raw] of url.searchParams) {
    if (name !== 'size' && name !== 'cs' && name !== 'as' && name !== 'crop') continue;
    for (const pair of raw.slice(0, 200).split(',')) {
      const match = /^(\d{1,5})x(\d{1,5})$/.exec(pair.trim());
      if (match) pixels = Math.max(pixels, Math.min(Number(match[1]), Number(match[2])));
    }
  }
  return pixels;
}

export function vkSiteUrl(value: unknown) {
  const url = https(value);
  return url && siteHosts.has(url.hostname) && !/^\/away(?:\.php|\/|$)/i.test(url.pathname) ? url : undefined;
}

/** Rewrites a validated VK address onto the domain the experimental switch picks. */
export function withVkDomain(value: unknown, domain: VkDomainName) {
  const url = vkSiteUrl(value);
  if (!url) return;
  if (url.hostname === domain || url.hostname === `m.${domain}` || url.hostname === `music.${domain}`) return url.href;
  const target = url.hostname.startsWith('login.') ? `login.${domain}` : url.hostname.startsWith('id.') ? `id.${domain}` : url.hostname;
  url.hostname = target === url.hostname ? domain : target;
  return url.href;
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

// Only destinations already validated as VK Music entries become a relative "to" argument.
export function vkSignInUrl(value: unknown) {
  if (!vkSiteEntry(value)) return;
  const { pathname, search } = new URL(value);
  return `https://vk.ru/login?${new URLSearchParams({ to: pathname + search })}`;
}

export function vkSignInPage(url: URL) {
  return !musicHosts.includes(url.hostname) || /^\/(?:$|(?:login|signin|join|authcheck|challenge|captcha)(?:\.php|\.html|\/|$))/i.test(url.pathname);
}

export function vkSeekRatio(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
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

export function readVkPosition(value: unknown): VkPosition | undefined {
  if (!value || typeof value !== 'object') return;
  const { position, duration, seek } = value as Partial<VkPosition>;
  if (typeof position !== 'number' || !Number.isFinite(position) || typeof duration !== 'number' || !(duration > 0 && duration <= 86_400)) return;
  return { position: Math.max(0, Math.min(position, duration)), duration, seek: seek === true };
}

export function vkHistoryLink(value: unknown) {
  const url = https(value);
  if (!url || !['vk.ru', 'vk.com'].includes(url.hostname)) return;
  const link = readMusicLink(url.href);
  return link?.provider === 'vk' && link.kind === 'track' ? link.url : undefined;
}

export function readVkNowPlaying(value: unknown): VkNowPlaying | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as Partial<VkNowPlaying>;
  const text = (input: unknown) => typeof input === 'string' ? input.slice(0, 256).replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ').trim().slice(0, 160) : '';
  const title = text(row.title), artist = text(row.artist);
  const previous = row.previous === true, toggle = row.toggle === true, next = row.next === true;
  const timeline = readVkPosition(row.timeline);
  if (!(title || artist || previous || toggle || next || timeline)) return;
  const volume = vkSeekRatio(row.volume);
  const repeat = row.repeat === 'off' || row.repeat === 'one' || row.repeat === 'all' ? row.repeat : undefined;
  const link = title ? vkHistoryLink(row.link) : undefined;
  const artwork = title && typeof row.artwork === 'string' && VK_COVER_KEY.test(row.artwork) ? row.artwork : undefined;
  return { title, artist, ...(link && { link }), ...(artwork && { artwork }), playing: row.playing === true, previous, toggle, next, ...(timeline && { timeline }),
    ...(volume !== undefined && { volume, canMute: row.canMute === true }), ...(typeof row.shuffle === 'boolean' && { shuffle: row.shuffle }),
    ...(repeat && { repeat }), ...(typeof row.favorite === 'boolean' && { favorite: row.favorite }),
    ...(typeof row.liked === 'boolean' && { liked: row.liked }), ...(typeof row.disliked === 'boolean' && { disliked: row.disliked }) };
}
