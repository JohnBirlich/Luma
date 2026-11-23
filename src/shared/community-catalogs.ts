import { archiveId, catalogLicense, catalogRetryDelay, catalogObject as object, readOnlineTrack } from './online.js';
import type { CommunitySource, DesktopCatalogSource, OnlineTrack } from './online.js';
import { musicSearchKey, searchWords } from './russian.js';
import { CatalogError, catalogIssue } from './catalog-reply.js';
import type { CatalogReply } from './catalog-reply.js';
import { readLimitedBody, waitForRequestSpacing } from './metadata-service.js';
import { audiusSearchUrl, audiusTracks } from './public-catalogs.js';

const list = (value: unknown, max: number) => Array.isArray(value) ? value.slice(0, max) : [];
const str = (value: unknown) => typeof value === 'string' ? value : '';
const byName = (value: unknown) => Array.isArray(value) ? str(value[0]) : str(value);
const fileTitle = (name: string) => name.replace(/\.mp3$/i, '').replace(/^\d{1,3}[_ .-]+/, '').replaceAll('_', ' ').trim();
const duration = (value: unknown) => /^\d{1,3}:\d{2}$/.test(str(value)) ? str(value).split(':').reduce((a, b) => a * 60 + Number(b), 0) : Number(value);

export function archiveTracks(item: string, data: unknown, source: CommunitySource = 'netlabels'): OnlineTrack[] {
  const row = object(data), meta = object(row.metadata);
  const license = catalogLicense(meta.licenseurl);
  if (!archiveId(item) || meta.identifier !== item || meta.mediatype !== 'audio' || ![meta.collection].flat().includes('netlabels') || (source === 'southern_city' && ![meta.collection].flat().includes('southern-citys-lab'))
    || !license || row.is_dark || meta.access_restricted_item || meta.private) return [];
  return list(row.files, 240).map(object).flatMap((file) => {
    const name = str(file.name);
    if (file.source !== 'original' || !['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', '320Kbps MP3', '192Kbps MP3'].includes(str(file.format))
      || file.private || !name || name.length > 200 || /[\\/:#?%\u0000-\u001f\u007f]/.test(name)) return [];
    const title = str(file.title).trim() || fileTitle(name);
    if (!/[\p{L}]/u.test(title)) return [];
    const track = readOnlineTrack({ title, artist: file.artist || file.creator || byName(meta.creator),
      album: file.album || meta.title, genres: [file.genre, ...[meta.subject].flat().slice(0, 10)], duration: duration(file.length),
      audioUrl: `https://archive.org/download/${item}/${encodeURIComponent(name)}`,
      online: { source: 'netlabels', page: `https://archive.org/details/${item}`, licenseUrl: license.url } });
    return track ? [track] : [];
  }).slice(0, 28);
}

export function communitySearchUrl(query: string, source: CommunitySource) {
  // Treat user input as literal search words, not arbitrary advanced search syntax.
  const words = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 10).map((word) => `"${word.slice(0, 45)}"`);
  const term = words?.join(' AND ') || '"no-result"';
  const url = new URL('https://archive.org/advancedsearch.php');
  url.search = new URLSearchParams({ q: `collection:${source === 'southern_city' ? 'southern-citys-lab' : 'netlabels'} AND mediatype:audio AND licenseurl:* AND (${term})`, 'fl[]': 'identifier', rows: '4', output: 'json' }).toString();
  return url;
}

type FetchCatalog = (url: string, init?: RequestInit) => Promise<Response>;
const validQuery = (value: unknown): value is string => typeof value === 'string' && value.length <= 140 && value.trim().length >= 2 && /[\p{L}\p{N}]/u.test(value);
const ARCHIVE = 'archive.org';
const ARCHIVE_PARALLEL = 2;
const ARCHIVE_METADATA_MS = 4200;
const ARCHIVE_SEARCH_MS = 6900;
const SEARCH_DEADLINE_MS = 16_000;

/** The two Archive scopes share slots for requests and their bodies, not just connection setup. */
function archiveSlots() {
  let active = 0;
  const queued: (() => void)[] = [];
  return async <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    if (active >= ARCHIVE_PARALLEL) await new Promise<void>((resolve, reject) => {
      const run = () => { signal.removeEventListener('abort', abort); active++; resolve(); };
      const abort = () => { queued.splice(queued.indexOf(run), 1); reject(signal.reason); };
      queued.push(run);
      signal.addEventListener('abort', abort, { once: true });
    });
    else active++;
    try { signal.throwIfAborted(); return await work(); }
    finally { active--; queued.shift()?.(); }
  };
}

function communityLookup(fetcher: FetchCatalog, now: () => number) {
  const inArchiveSlot = archiveSlots();
  const retryAt = new Map<string, number>();
  const metadata = new Map<string, { tracks: OnlineTrack[]; southern: boolean; expires: number }>();
  async function get(url: URL, limit: number, signal: AbortSignal) {
    signal.throwIfAborted();
    if ((retryAt.get(url.hostname) ?? 0) > now()) throw new CatalogError('quota');
    const response = await fetcher(url.href, { signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    if (!response.ok || !response.body) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 429 || (response.status === 503 && response.headers.has('Retry-After'))) {
        const time = now();
        retryAt.set(url.hostname, Math.max(retryAt.get(url.hostname) ?? 0, time + catalogRetryDelay(response.headers.get('Retry-After'), time)));
        throw new CatalogError('quota');
      }
      throw new CatalogError('unavailable');
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedBody(response, limit, signal))) as unknown;
    } catch (error) { throw new CatalogError(signal.aborted ? catalogIssue(signal.reason) : error instanceof TypeError || error instanceof SyntaxError ? 'response' : 'unavailable'); }
  }
  async function findReleases(value: string, source: CommunitySource, signal: AbortSignal) {
    const url = communitySearchUrl(value, source);
    // Retry a transient failure once, but not a quota/timeout. Leave time for inspecting records.
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(ARCHIVE_SEARCH_MS)]);
    let result;
    try { result = await get(url, 256 * 1024, deadline); }
    catch (error) {
      const issue = catalogIssue(error);
      if (deadline.aborted || (issue !== 'network' && issue !== 'unavailable')) throw error;
      await waitForRequestSpacing(400, deadline);
      result = await get(url, 256 * 1024, deadline);
    }
    const response = object(object(result).response);
    if (!Array.isArray(response.docs)) throw new CatalogError('response');
    return [...new Set(list(response.docs, 4).map((row) => object(row).identifier).filter(archiveId))];
  }
  const loadRelease = (id: string, source: CommunitySource, signal: AbortSignal) => inArchiveSlot(signal, async () => {
    const cached = metadata.get(id);
    if (cached && cached.expires > now()) return source === 'netlabels' || cached.southern ? cached.tracks : [];
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(ARCHIVE_METADATA_MS)]);
    const result = object(await get(new URL(`https://${ARCHIVE}/metadata/${id}`), 2 * 1024 * 1024, deadline));
    if (!result.metadata || !Array.isArray(result.files)) throw new CatalogError('response');
    const tracks = archiveTracks(id, result);
    const southern = [object(result.metadata).collection].flat().includes('southern-citys-lab');
    metadata.delete(id);
    metadata.set(id, { tracks, southern, expires: now() + 3 * 60_000 });
    if (metadata.size > 24) metadata.delete(metadata.keys().next().value!);
    return source === 'netlabels' || southern ? tracks : [];
  });

  return async (value: unknown, source: DesktopCatalogSource, signal: AbortSignal): Promise<CatalogReply> => {
    if (!validQuery(value)) return { tracks: [] };
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(SEARCH_DEADLINE_MS)]);
    try {
      if (source === 'audius') {
        const body = object(await get(audiusSearchUrl(value), 768 * 1024, deadline));
        if (!Array.isArray(body.data)) throw new CatalogError('response');
        return { tracks: audiusTracks(body) };
      }
      const items = await inArchiveSlot(deadline, () => findReleases(value, source, deadline));
      const results = await Promise.allSettled(items.map((id) => loadRelease(id, source, deadline)));
      signal.throwIfAborted(); // User cancellation suppresses the whole search, not a timed-out release.
      const words = searchWords(value);
      const rank = (track: OnlineTrack) => {
        const identity = musicSearchKey(`${track.title} ${track.artist}`);
        const context = musicSearchKey(`${track.album} ${track.genres?.join(' ') ?? ''}`);
        return words.reduce((score, word) => score + (identity.includes(word) ? 4 : context.includes(word) ? 1 : 0), 0);
      };
      const tracks = results.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : [])
        .map((track) => ({ track, score: rank(track) })).sort((a, b) => b.score - a.score).slice(0, 18).map(({ track }) => track);
      const issues = results.flatMap((entry) => entry.status === 'rejected' ? [catalogIssue(entry.reason)] : []);
      const issue = issues.includes('quota') ? 'quota' : issues.includes('timeout') ? 'timeout' : issues[0];
      return { tracks, ...(issue && { issue }) };
    } catch (error) {
      signal.throwIfAborted();
      return { tracks: [], issue: deadline.aborted ? 'timeout' : catalogIssue(error) };
    }
  };
}

export function searchCommunity(fetcher: FetchCatalog, value: unknown, source: DesktopCatalogSource, signal: AbortSignal) {
  return communityLookup(fetcher, Date.now)(value, source, signal);
}

/** A new query replaces only its own scope. Timeouts, concurrency and quota are shared per provider. */
export function createCommunitySearch(fetcher: FetchCatalog, now = Date.now) {
  const lookup = communityLookup(fetcher, now);
  const active = new Map<DesktopCatalogSource, { id: number; controller: AbortController }>();
  return {
    async search(id: unknown, query: unknown, source: unknown): Promise<CatalogReply> {
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !validQuery(query)
        || (source !== 'netlabels' && source !== 'southern_city' && source !== 'audius')) return { tracks: [] };
      active.get(source)?.controller.abort();
      const controller = new AbortController();
      active.set(source, { id, controller });
      try { return await lookup(query, source, controller.signal); }
      finally { if (active.get(source)?.controller === controller) active.delete(source); }
    },
    cancel(id: unknown) {
      for (const request of active.values()) if (request.id === id) request.controller.abort();
    },
  };
}
