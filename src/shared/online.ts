import { readGenres } from './media.js';
import type { Track } from './media.js';
import { cleanTrackText } from './russian.js';

export const OPENVERSE_API = 'https://api.openverse.org/v1/audio/';
export const ONLINE_ORIGINS = {
  connect: 'https://api.openverse.org',
  images: 'https://api.openverse.org/v1/audio/',
  media: 'https://*.storage.jamendo.com https://storage.jamendo.com https://upload.wikimedia.org/wikipedia/commons/',
};
export const ONLINE_SOURCES = { jamendo: 'Jamendo', wikimedia_audio: 'Wikimedia Commons' } as const;
export type OnlineSource = keyof typeof ONLINE_SOURCES;
export type OnlineFilter = OnlineSource | 'all';
export const MAX_ONLINE_TRACKS = 180;
export interface OnlineCreditData { source: OnlineSource; page: string; license: string; licenseUrl: string }
export interface OnlineTrack extends Track { online: OnlineCreditData }

const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const title = (value: unknown, fallback = '') => typeof value === 'string' ? cleanTrackText(value).slice(0, 240) || fallback : fallback;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function webUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url;
  } catch { /* Invalid URL. */ }
}

function sourcePage(url: URL, source: OnlineSource): URL | undefined {
  if (source === 'jamendo') {
    if (['www.jamendo.com', 'jamendo.com'].includes(url.hostname) && /^\/track\/\d+(?:\/[^/]+)?\/?$/.test(url.pathname)) {
      return new URL(`https://www.jamendo.com${url.pathname}`);
    }
  } else if (url.hostname === 'commons.wikimedia.org') {
    if (/^\/wiki\/File:.+/i.test(url.pathname)) return new URL(url.origin + url.pathname);
    const id = url.searchParams.get('curid');
    if (url.pathname === '/w/index.php' && id && /^\d+$/.test(id)) return new URL(`${url.origin}/w/index.php?curid=${id}`);
  }
}

function ccPage(url: URL) {
  const match = /^(?:\/licenses\/(by|by-sa|by-nc|by-nd|by-nc-sa|by-nc-nd)|\/publicdomain\/(mark|zero))\/(\d\.\d)\/?$/.exec(url.pathname);
  if (url.hostname !== 'creativecommons.org' || !match) return;
  const label = match[1] ? `CC ${match[1].toUpperCase()} ${match[3]}` : match[2] === 'zero' ? `CC0 ${match[3]}` : `Public Domain Mark ${match[3]}`;
  return { url: url.origin + url.pathname.replace(/\/?$/, '/'), label };
}

/** The desktop shell only opens canonical attribution and track links. */
export function isOnlineExternalUrl(value: unknown): value is string {
  const url = webUrl(value);
  return !!url && (ccPage(url)?.url === value || sourcePage(url, 'jamendo')?.href === value || sourcePage(url, 'wikimedia_audio')?.href === value);
}

function sourceMedia(url: URL, source: OnlineSource, page: URL): string | undefined {
  if (source === 'jamendo') {
    const id = page.pathname.split('/')[2];
    const format = url.searchParams.get('format');
    if (/^(?:prod-\d+\.)?storage\.jamendo\.com$/.test(url.hostname) && url.pathname === '/' &&
      url.searchParams.get('trackid') === id && format && /^mp3[12]$/.test(format)) return `${url.origin}/?trackid=${id}&format=${format}`;
  } else if (url.hostname === 'upload.wikimedia.org' && /^\/wikipedia\/commons\/[\da-f]\/[\da-f]{2}\/[^/]+\.(?:ogg|oga|opus|mp3|flac|wav|webm)$/i.test(url.pathname)) {
    return url.origin + url.pathname;
  }
}

/** Validate both API results and restored references; audio data is never cached by Luma. */
export function readOnlineTrack(value: unknown): OnlineTrack | undefined {
  const row = object(value);
  const info = object(row.online);
  const id = typeof row.id === 'string' && row.id.startsWith('ov-') ? row.id.slice(3) : '';
  const source = info.source;
  if (!uuid.test(id) || (source !== 'jamendo' && source !== 'wikimedia_audio')) return;
  const pageUrl = webUrl(info.page), audioUrl = webUrl(row.audioUrl), licenseUrl = webUrl(info.licenseUrl);
  const page = pageUrl && sourcePage(pageUrl, source);
  const media = page && audioUrl && sourceMedia(audioUrl, source, page);
  const license = licenseUrl && ccPage(licenseUrl);
  if (!page || !media || !license) return;
  const name = title(row.title);
  if (!name) return;
  const art = webUrl(row.artworkUrl);
  const cover = art?.origin === ONLINE_ORIGINS.connect && art.pathname === `/v1/audio/${id}/thumb/` ? art.origin + art.pathname : undefined;
  return {
    id: `ov-${id.toLowerCase()}`, title: name, artist: title(row.artist, 'Неизвестный исполнитель'), album: title(row.album, ONLINE_SOURCES[source]),
    duration: typeof row.duration === 'number' && Number.isFinite(row.duration) ? Math.max(0, Math.min(86400, row.duration)) : 0,
    audioUrl: media, artworkUrl: cover, genres: readGenres(row.genres),
    online: { source, page: page.href, license: license.label, licenseUrl: license.url },
  };
}

export function decodeOpenverse(data: unknown): OnlineTrack | undefined {
  const row = object(data);
  if (typeof row.id !== 'string' || row.mature === true || (row.category && row.category !== 'music')) return;
  return readOnlineTrack({
    id: `ov-${row.id}`, title: row.title, artist: row.creator, album: object(row.audio_set).title,
    duration: typeof row.duration === 'number' ? row.duration / 1000 : 0, genres: row.genres,
    audioUrl: row.url, artworkUrl: row.thumbnail,
    online: { source: row.source, page: row.foreign_landing_url, licenseUrl: row.license_url },
  });
}

export function readOnlineShelf(data: unknown): OnlineTrack[] {
  if (!Array.isArray(data)) return [];
  const tracks = new Map<string, OnlineTrack>();
  for (const item of data.slice(0, MAX_ONLINE_TRACKS)) {
    const track = readOnlineTrack(item);
    if (track && !tracks.has(track.id)) tracks.set(track.id, track);
  }
  return [...tracks.values()];
}

export function openverseLinkId(value: string): string | undefined {
  const url = webUrl(value.trim());
  if (!url) return;
  const path = ['openverse.org', 'www.openverse.org'].includes(url.hostname) ? /^\/audio\/([^/]+)\/?$/
    : url.origin === ONLINE_ORIGINS.connect ? /^\/v1\/audio\/([^/]+)\/?$/ : null;
  const id = path?.exec(url.pathname)?.[1];
  return id && uuid.test(id) ? id.toLowerCase() : undefined;
}

export function onlineSearchUrl(text: string, filter: OnlineFilter): URL {
  const url = new URL(OPENVERSE_API);
  url.search = new URLSearchParams({ q: text.trim().slice(0, 140), source: filter === 'all' ? 'jamendo,wikimedia_audio' : filter,
    page_size: '14', mature: 'false', format: 'json' }).toString();
  return url;
}
