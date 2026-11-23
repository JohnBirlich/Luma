import type { Track } from './media.js';
import { createPublicJsonRequest, PublicHttpError } from './public-json.js';
import type { PublicApiFetch } from './public-json.js';
import { cleanTrackText } from './russian.js';
import { RADIO_LINEUP } from './radio-lineup.js';

const MIRROR = 'de1.api.radio-browser.info';
const PAGE = 'https://www.radio-browser.info/history/';
const UUID = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const uuidPattern = new RegExp(`^${UUID}$`, 'i');
const stationPattern = new RegExp(`^radio-browser-(${UUID})$`);
const PAGE_PATTERN = new RegExp(`^https://www\\.radio-browser\\.info/history/${UUID}$`);
const LIMIT = 24;
const AUDIO = new Set(['MP3', 'AAC', 'AAC+', 'OGG', 'OPUS']);
const curatedStreams = new Set(RADIO_LINEUP.flatMap(([, , , , stream]) => stream?.startsWith('https://') ? [new URL(stream).href] : []));
const STREAM_PATHS: Record<string, RegExp> = {
  'https://stream.laut.fm': /^\/[a-z0-9_-]{1,100}$/i,
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`https://ice${n}.somafm.com`, /^\/[a-z0-9]+-\d{2,3}-(?:mp3|aac|aacp)$/i])),
  'https://radiorecord.hostingradio.ru': /^\/[a-z0-9_-]{1,100}\.(?:aacp|mp3)$/i,
};
// These publishers provide public live streams. No wildcard HTTPS or URL proxy is added to the renderer.
export const RADIO_BROWSER_MEDIA = Object.keys(STREAM_PATHS).map((origin) => `${origin}/`).join(' ');
export type RadioBrowserQuery = { name: string; country: string; language: string; genre: string };
export interface RadioBrowserStation {
  id: string; name: string; country: string; language: string; genre: string; codec: string; bitrate?: number;
  page: string; stream?: string;
}

export function radioBrowserUuid(id: unknown) {
  return typeof id === 'string' ? stationPattern.exec(id)?.[1] : undefined;
}
export const isRadioBrowserPage = (value: unknown): value is string => typeof value === 'string' && PAGE_PATTERN.test(value);

const text = (value: unknown, limit: number) => cleanTrackText(value).replace(/\s+/gu, ' ').trim().slice(0, limit);
const obj = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function readRadioBrowserQuery(value: unknown): RadioBrowserQuery | undefined {
  const input = obj(value);
  const { name, country, language, genre } = input;
  if ([name, country, language, genre].some((item) => item !== undefined && (typeof item !== 'string' || item.length > 120))) return;
  const query = { name: text(name, 80), country: text(country, 8).toUpperCase(), language: text(language, 32), genre: text(genre, 32) };
  if (query.country && !/^[A-Z]{2}$/.test(query.country)) return;
  if (Object.values(query).some((part) => part && !/[\p{L}\p{N}]/u.test(part))) return;
  if (Object.values(query).some(Boolean)) return query;
}

export function trustedRadioBrowserStream(value: unknown) {
  if (typeof value !== 'string' || value.length > 512) return;
  try {
    const url = new URL(value);
    if (curatedStreams.has(url.href)) return url.href;
    if (!url.username && !url.password && !url.search && !url.hash
      && Object.hasOwn(STREAM_PATHS, url.origin) && STREAM_PATHS[url.origin].test(url.pathname)) return url.href;
  } catch { /* Unsupported stream URL. */ }
}

export function readRadioBrowserStations(value: unknown): RadioBrowserStation[] {
  if (!Array.isArray(value)) throw new Error('Ответ Radio Browser не удалось прочитать.');
  const stations = new Map<string, RadioBrowserStation>();
  for (const item of value.slice(0, LIMIT)) {
    const row = obj(item);
    const uuid = typeof row.stationuuid === 'string' && uuidPattern.test(row.stationuuid) && row.stationuuid.toLowerCase();
    const name = text(row.name, 100);
    if (!uuid || !name || stations.has(uuid)) continue;
    const codec = text(row.codec, 20).toUpperCase();
    const stream = row.lastcheckok === 1 && row.ssl_error === 0 && row.hls === 0 && AUDIO.has(codec)
      ? trustedRadioBrowserStream(row.url_resolved) : undefined;
    const bitrate = typeof row.bitrate === 'number' && Number.isInteger(row.bitrate) && row.bitrate > 0 && row.bitrate <= 1536 ? row.bitrate : undefined;
    stations.set(uuid, { id: `radio-browser-${uuid}`, name, country: text(row.country, 55) || text(row.countrycode, 2), language: text(row.language, 55) || text(row.languagecodes, 24),
      genre: text(row.tags, 70).split(',').slice(0, 3).join(', '), codec, bitrate, page: `${PAGE}${uuid}`, stream });
  }
  return [...stations.values()];
}

export function radioBrowserTrack(station: RadioBrowserStation): Track | undefined {
  const uuid = radioBrowserUuid(station.id), stream = trustedRadioBrowserStream(station.stream);
  if (!uuid || !stream) return;
  return { id: station.id, title: station.name, artist: 'Radio Browser', album: station.country, audioUrl: stream, duration: 0, color: '#92bffa',
    online: { source: 'broadcast', page: `${PAGE}${uuid}`, license: '', licenseUrl: '' } };
}

export function radioBrowserServers(discovered: readonly string[]) {
  const hosts = [...new Set(discovered.slice(0, 8).map((value) => value.toLowerCase().replace(/\.$/, ''))
    .filter((value) => /^[a-z0-9][a-z0-9-]{0,47}\.api\.radio-browser\.info$/.test(value)))].slice(0, 2);
  return [...new Set([...hosts, MIRROR])];
}

export function createRadioBrowser(fetcher: PublicApiFetch, version: string, discover: () => Promise<string[]> = async () => []) {
  const request = createPublicJsonRequest(fetcher, { spacing: 650, limit: 384 * 1024 });
  const receipt = createPublicJsonRequest(fetcher, { spacing: 1500, limit: 16 * 1024 });
  const headers = { 'User-Agent': `Luma-Player/${version} (https://github.com/JohnBirlich/VKX-Modded)` };
  let active = false;
  let mirror = MIRROR;
  let lastResults = new Set<string>();
  let lastClick = 0;
  return {
    async search(value: unknown) {
      const query = readRadioBrowserQuery(value);
      if (!query) throw new Error('Укажите название, код страны из двух букв, язык или жанр.');
      if (active) throw new Error('Поиск станций уже выполняется.');
      active = true;
      try {
        const signal = AbortSignal.timeout(10_000);
        const servers = radioBrowserServers(await discover().catch(() => []));
        for (const server of servers) {
          const url = new URL(`https://${server}/json/stations/search`);
          url.search = new URLSearchParams({ hidebroken: 'true', order: 'votes', reverse: 'true', limit: String(LIMIT),
            ...(query.name && { name: query.name }), ...(query.country && { countrycode: query.country }),
            ...(query.language && { language: query.language }), ...(query.genre && { tag: query.genre }) }).toString();
          try {
            const found = readRadioBrowserStations(await request(url, AbortSignal.any([signal, AbortSignal.timeout(3600)]), { headers }));
            mirror = server;
            lastResults = new Set(found.filter(({ stream }) => stream).map(({ id }) => id));
            return found;
          } catch (error) {
            // Honour a provider rate limit; DNS failover is for an unreachable mirror, not quota bypass.
            if (signal.aborted || (error instanceof PublicHttpError && error.status === 429)) break;
          }
        }
        throw new Error('Radio Browser сейчас недоступен. Попробуйте позже.');
      } finally { active = false; }
    },
    async click(id: unknown) {
      const uuid = radioBrowserUuid(id), now = Date.now();
      if (!uuid || !lastResults.has(id as string) || active || now - lastClick < 1500) return;
      lastClick = now;
      // The directory asks clients to count explicit user selections; never send a listening history.
      await receipt(new URL(`https://${mirror}/json/url/${uuid}`), AbortSignal.timeout(3000), { headers }).catch(() => {});
    },
  };
}
