import { readGenres } from './media.js';
import type { Track } from './media.js';
import { cleanTrackText } from './russian.js';
import { readIsrc } from './recording-match.js';

export const OPENVERSE_API = 'https://api.openverse.org/v1/audio/';
const OPENVERSE_ORIGIN = new URL(OPENVERSE_API).origin;
export const AUDIUS_API = 'https://api.audius.co/v1/tracks/';
export const AUDIUS_CONTENT_ORIGIN = 'https://creatornode.audius.co';
export const AUDIUS_LEGAL = {
  terms: 'https://audius.co/legal/api-terms', privacy: 'https://audius.co/legal/privacy-policy',
} as const;
export const AUDIUS_APP_NAME = 'Luma Player';
export const ONLINE_ORIGINS = {
  connect: OPENVERSE_ORIGIN,
  images: 'https://api.openverse.org/v1/audio/',
  media: 'https://*.storage.jamendo.com https://storage.jamendo.com https://upload.wikimedia.org/wikipedia/commons/ https://archive.org/download/ https://*.archive.org/',
};
export const ONLINE_SOURCES = { jamendo: 'Jamendo', wikimedia_audio: 'Wikimedia Commons', netlabels: 'Internet Archive · Netlabels', audius: 'Audius' } as const;
export type OnlineSource = keyof typeof ONLINE_SOURCES;
export type CommunitySource = 'netlabels' | 'southern_city';
export type DesktopCatalogSource = CommunitySource | 'audius';
export type OnlineFilter = OnlineSource | DesktopCatalogSource | 'all';
export const MAX_ONLINE_TRACKS = 180;
export interface OnlineCreditData { source: OnlineSource | 'broadcast'; page: string; license: string; licenseUrl: string }
export interface OnlineTrack extends Track { online: OnlineCreditData & { source: OnlineSource } }
type LyricWrite = 'saved' | 'existing' | 'failed';
export interface Mp3ExportResult { saved: boolean; lyrics?: { synced?: LyricWrite; plain?: LyricWrite }; credit?: boolean }

/** Only original MP3s offered from Wikimedia Commons under supported reusable licenses. */
export function commonsMp3Export(track: OnlineTrack) {
  return track.online.source === 'wikimedia_audio' && /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[\da-f]\/[\da-f]{2}\/[^/?#]+\.mp3$/i.test(track.audioUrl)
    && /^https:\/\/creativecommons\.org\/(?:licenses\/by(?:-sa)?|publicdomain\/(?:mark|zero))\/\d\.\d\/$/.test(track.online.licenseUrl);
}

const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const title = (value: unknown, fallback = '') => typeof value === 'string' ? cleanTrackText(value).slice(0, 240) || fallback : fallback;
export const catalogObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function webUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url;
  } catch { /* Invalid URL. */ }
}

export const archiveId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{1,99}$/.test(value);

const audiusTrackPage = /^\/[\w-]{1,64}\/[\w-]{1,180}$/;
export const audiusId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9]{3,16}$/.test(value);
export const sessionCatalogId = (value: unknown) => typeof value === 'string' && value.startsWith('audius-') && audiusId(value.slice(7));
export const audiusMediaUrl = (id: string) => `luma://app/media/audius/${id}`;

function sourcePage(url: URL, source: OnlineSource): URL | undefined {
  if (source === 'jamendo') {
    if (['www.jamendo.com', 'jamendo.com'].includes(url.hostname) && /^\/track\/\d+(?:\/[^/]+)?\/?$/.test(url.pathname)) {
      return new URL(`https://www.jamendo.com${url.pathname}`);
    }
  } else if (source === 'netlabels') {
    const id = url.pathname.match(/^\/details\/([^/]+)\/?$/)?.[1];
    if (url.hostname === 'archive.org' && archiveId(id)) return new URL(`${url.origin}/details/${id}`);
  } else if (source === 'audius') {
    if (url.origin === 'https://audius.co' && audiusTrackPage.test(url.pathname)) return new URL(url.origin + url.pathname);
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

/** Older catalogs publish CC URLs with http. Upgrade only this known attribution origin. */
export function catalogLicense(value: unknown) {
  const url = webUrl(typeof value === 'string' ? value.replace(/^http:\/\/creativecommons\.org\//, 'https://creativecommons.org/') : value);
  return url && ccPage(url);
}

function singleAudioFile(path: string) {
  try {
    const name = decodeURIComponent(path);
    return name.length <= 200 && !/[\/\\:#?%\x00-\x1f\x7f]/.test(name) && /\.mp3$/i.test(name) ? encodeURIComponent(name) : undefined;
  } catch { return undefined; }
}

/** The desktop shell only opens canonical attribution and track links. */
export function isOnlineExternalUrl(value: unknown): value is string {
  if (value === AUDIUS_LEGAL.terms || value === AUDIUS_LEGAL.privacy) return true;
  const url = webUrl(value);
  return !!url && (ccPage(url)?.url === value || (Object.keys(ONLINE_SOURCES) as OnlineSource[]).some((source) => sourcePage(url, source)?.href === value));
}

function sourceMedia(url: URL, source: OnlineSource, page: URL): string | undefined {
  if (source === 'jamendo') {
    const id = page.pathname.split('/')[2];
    const format = url.searchParams.get('format');
    if (/^(?:prod-\d+\.)?storage\.jamendo\.com$/.test(url.hostname) && url.pathname === '/' &&
      url.searchParams.get('trackid') === id && format && /^mp3[12]$/.test(format)) return `${url.origin}/?trackid=${id}&format=${format}`;
  } else if (source === 'netlabels') {
    const prefix = `/download/${page.pathname.split('/')[2]}/`;
    const file = url.hostname === 'archive.org' && url.pathname.startsWith(prefix) && singleAudioFile(url.pathname.slice(prefix.length));
    if (file) return url.origin + prefix + file;
  } else if (source === 'wikimedia_audio' && url.hostname === 'upload.wikimedia.org' && /^\/wikipedia\/commons\/[\da-f]\/[\da-f]{2}\/[^/]+\.(?:ogg|oga|opus|mp3|flac|wav|webm)$/i.test(url.pathname)) {
    return url.origin + url.pathname;
  }
}

/** Stable reference from the canonical file URL (not used as a security proof). */
function archiveTrackId(url: string) {
  let left = 2166136261, right = 5381;
  for (let i = 0; i < url.length; i++) {
    left = Math.imul(left ^ url.charCodeAt(i), 16777619);
    right = Math.imul(right, 33) ^ url.charCodeAt(i);
  }
  return `archive-${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`;
}

/** Validate both API results and restored references; never trust cross-source URLs. */
export function readOnlineTrack(value: unknown): OnlineTrack | undefined {
  const row = catalogObject(value);
  const info = catalogObject(row.online);
  const id = typeof row.id === 'string' && row.id.startsWith('ov-') ? row.id.slice(3) : '';
  const source = info.source;
  if (source !== 'jamendo' && source !== 'wikimedia_audio' && source !== 'netlabels' && source !== 'audius') return;
  const openverse = source === 'jamendo' || source === 'wikimedia_audio';
  if (openverse && !uuid.test(id)) return;
  const pageUrl = webUrl(info.page), audioUrl = webUrl(row.audioUrl), licenseUrl = webUrl(info.licenseUrl);
  const page = pageUrl && sourcePage(pageUrl, source);
  const audius = source === 'audius' && sessionCatalogId(row.id) ? String(row.id).slice(7) : undefined;
  const media = audius ? row.audioUrl === audiusMediaUrl(audius) && audiusMediaUrl(audius)
    : page && audioUrl && sourceMedia(audioUrl, source, page);
  const license = audius ? { label: 'Только в этой сессии', url: '' } : licenseUrl && ccPage(licenseUrl);
  if (!page || !media || !license) return;
  const name = title(row.title);
  if (!name) return;
  const normalizedId = openverse ? `ov-${id.toLowerCase()}` : audius ? `audius-${audius}` : archiveTrackId(media);
  if (!openverse && row.id !== normalizedId && row.id !== undefined) return;
  const art = openverse ? webUrl(row.artworkUrl) : undefined;
  const cover = art?.origin === OPENVERSE_ORIGIN && art.pathname === `/v1/audio/${id}/thumb/` ? art.origin + art.pathname : undefined;
  const isrc = readIsrc(row.isrc);
  return {
    id: normalizedId, ...(isrc && { isrc }), title: name, artist: title(row.artist, 'Неизвестный исполнитель'), album: title(row.album, ONLINE_SOURCES[source]),
    duration: typeof row.duration === 'number' && Number.isFinite(row.duration) ? Math.max(0, Math.min(86400, row.duration)) : 0,
    audioUrl: media, artworkUrl: cover, genres: readGenres(row.genres),
    online: { source, page: page.href, license: license.label, licenseUrl: license.url },
  };
}

export function decodeOpenverse(data: unknown): OnlineTrack | undefined {
  const row = catalogObject(data);
  if ((row.source !== 'jamendo' && row.source !== 'wikimedia_audio') || typeof row.id !== 'string' || row.mature === true || (row.category && row.category !== 'music')) return;
  return readOnlineTrack({
    id: `ov-${row.id}`, isrc: row.isrc, title: row.title, artist: row.creator, album: catalogObject(row.audio_set).title,
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
    : url.origin === OPENVERSE_ORIGIN ? /^\/v1\/audio\/([^/]+)\/?$/ : null;
  const id = path?.exec(url.pathname)?.[1];
  return id && uuid.test(id) ? id.toLowerCase() : undefined;
}

export function catalogRetryDelay(value: string | null, now = Date.now()) {
  const delay = value && /^\d+$/.test(value) ? Number(value) * 1000 : value ? Date.parse(value) - now : NaN;
  return Number.isFinite(delay) ? Math.max(1000, delay) : 60_000;
}

export function onlineSearchUrl(text: string, filter: OnlineFilter): URL {
  const url = new URL(OPENVERSE_API);
  url.search = new URLSearchParams({ q: text.trim().slice(0, 140), source: filter === 'jamendo' || filter === 'wikimedia_audio' ? filter : 'jamendo,wikimedia_audio',
    page_size: '14', mature: 'false', format: 'json' }).toString();
  return url;
}
