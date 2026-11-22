import { appApiAgent } from './app-info.js';
import { readLimitedBody } from './metadata-service.js';
import { readIsrc } from './recording-match.js';
import type { MetadataCandidate } from './recognition.js';
import { artistCreditKey, cleanTrackText, musicSearchKey } from './russian.js';

const SEARCH_URL = 'https://musicbrainz.org/ws/2/recording';
const RESULT_LIMIT = 8;
const RELEASE_LIMIT = 32;
const RECORDING_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const field = (value: unknown, limit = 256) => cleanTrackText(value).slice(0, limit).trim();
const date = (value: unknown) => typeof value === 'string' && /^\d{4}(?:-\d\d){0,2}$/.test(value) ? value : '';

export interface MusicBrainzQuery { title: string; artist?: string; album?: string; isrc?: string; duration?: number }

export function readMusicBrainzQuery(value: unknown): MusicBrainzQuery | undefined {
  const query = record(value);
  const title = field(query.title, 160), artist = field(query.artist), album = field(query.album);
  if (typeof query.title !== 'string' || query.title.length > 256 || !/[\p{L}\p{N}]/u.test(title)) return;
  const duration = query.duration;
  return { title, artist: ['неизвестный исполнитель', 'unknown artist'].includes(musicSearchKey(artist)) ? undefined : artist || undefined,
    album: ['без альбома', 'unknown album'].includes(musicSearchKey(album)) ? undefined : album || undefined,
    isrc: typeof query.isrc === 'string' ? readIsrc(query.isrc) : undefined,
    duration: typeof duration === 'number' && duration > 0 && duration <= 86_400 ? duration : undefined };
}

function searchUrl({ title, artist, isrc }: MusicBrainzQuery) {
  // All input stays inside quoted Lucene literals, then URLSearchParams encodes the query.
  const phrase = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;
  const byName = `recording:${phrase(title)}${artist ? ` AND artist:${phrase(artist)}` : ''}`;
  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({ fmt: 'json', limit: `${RESULT_LIMIT}`,
    query: `(${isrc ? `isrc:${isrc} OR (${byName})` : byName}) AND NOT video:true` }).toString();
  return url.href;
}

function creditedArtist(value: unknown) {
  const credits = list(value).slice(0, 8).map(record);
  return field(credits.map(({ name, artist, joinphrase }, index) => {
    const credit = field(name) || field(record(artist).name);
    const join = typeof joinphrase === 'string' && joinphrase.length <= 32 ? joinphrase : ', ';
    return credit && (credit + (index < credits.length - 1 ? join : ''));
  }).join(''));
}

function recordingReleases(value: unknown, albumHint?: string) {
  const releases = list(value);
  const titles = new Map<string, string>();
  const sorted = releases.slice(0, RELEASE_LIMIT).map(record).sort((a, b) =>
    Number(b.status === 'Official') - Number(a.status === 'Official') || (date(a.date) || '~').localeCompare(date(b.date) || '~', 'en'));
  for (const release of sorted) {
    const title = field(release.title);
    const key = musicSearchKey(title);
    if (key && !titles.has(key)) titles.set(key, title);
  }
  const releaseTitles = [...titles.values()].slice(0, 3);
  // A recording can appear on multiple albums. Do not overwrite the file's album with a guessed one.
  const album = (albumHint ? titles.get(musicSearchKey(albumHint)) : undefined)
    ?? (titles.size === 1 && releases.length <= RELEASE_LIMIT ? releaseTitles[0] : undefined);
  return { album, releaseTitles: !album && releaseTitles.length ? releaseTitles : undefined };
}

export function readMusicBrainzCandidates(data: unknown, query: MusicBrainzQuery): MetadataCandidate[] {
  const { recordings } = record(data);
  if (!Array.isArray(recordings)) throw new Error('Ответ MusicBrainz не удалось прочитать.');
  const seen = new Set<string>();
  return recordings.slice(0, RESULT_LIMIT).flatMap((entry): MetadataCandidate[] => {
    const item = record(entry);
    if (item.video === true || typeof item.id !== 'string' || !RECORDING_ID.test(item.id) || seen.has(item.id.toLowerCase())) return [];
    const title = field(item.title), artist = creditedArtist(item['artist-credit']);
    if (!title || !artist) return [];
    const codes = list(item.isrcs).slice(0, 32).flatMap((value) => readIsrc(value) ?? []);
    const distinct = [...new Set(codes)];
    const isrc = query.isrc && distinct.includes(query.isrc) ? query.isrc : distinct.length === 1 ? distinct[0] : undefined;
    const id = item.id.toLowerCase();
    seen.add(id);
    return [{ source: 'musicbrainz', page: `https://musicbrainz.org/recording/${id}`, title, artist,
      duration: typeof item.length === 'number' && item.length > 0 && item.length <= 86_400_000 ? item.length / 1000 : undefined,
      disambiguation: field(item.disambiguation) || undefined, year: date(item['first-release-date']).slice(0, 4) || undefined, isrc,
      ...recordingReleases(item.releases, query.album) }];
  }).map((item) => ({ item, rank:
    (query.isrc && item.isrc === query.isrc ? 100 : 0) +
    (musicSearchKey(item.title) === musicSearchKey(query.title) ? 30 : 0) +
    (query.artist && artistCreditKey(item.artist) === artistCreditKey(query.artist) ? 16 : 0) +
    (query.album && item.album && musicSearchKey(item.album) === musicSearchKey(query.album) ? 8 : 0) +
    (query.duration && item.duration ? Math.max(0, 10 - Math.abs(query.duration - item.duration)) : 0),
  })).sort((a, b) => b.rank - a.rank).map(({ item }) => item);
}

/** Called in the desktop main process to identify Luma with MusicBrainz's required User-Agent. */
export function createMusicBrainzLookup(fetcher: (url: string, init: RequestInit) => Promise<Response>, version: string) {
  let nextCall = 0;
  let busy = false;
  const agent = appApiAgent(version);
  const cache = new Map<string, { until: number; candidates: MetadataCandidate[] }>();
  return async (input: unknown, signal: AbortSignal) => {
    signal.throwIfAborted();
    const query = readMusicBrainzQuery(input);
    if (!query) return [];
    const key = JSON.stringify(query);
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.candidates;
    if (busy || Date.now() < nextCall) throw new Error('Подождите немного перед повторным запросом MusicBrainz.');
    busy = true;
    nextCall = Date.now() + 1100;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(8500)]);
    try {
      const response = await fetcher(searchUrl(query), { signal: deadline, headers: { Accept: 'application/json', 'User-Agent': agent },
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get('Retry-After');
          const wait = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : NaN;
          nextCall = Date.now() + (Number.isFinite(wait) ? Math.max(1100, wait) : 5000);
        }
        throw new Error('MusicBrainz сейчас недоступен. Попробуйте позже.');
      }
      const body = await readLimitedBody(response, 512 * 1024, deadline);
      const candidates = readMusicBrainzCandidates(JSON.parse(new TextDecoder().decode(body)), query);
      cache.delete(key);
      cache.set(key, { candidates, until: Date.now() + (candidates.length ? 600_000 : 60_000) });
      if (cache.size > 24) cache.delete(cache.keys().next().value!);
      return candidates;
    } finally { busy = false; }
  };
}
