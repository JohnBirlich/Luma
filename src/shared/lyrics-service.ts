import { appApiAgent } from './app-info.js';
import { lyricsSearchUrl, lyricsUrl, readLyrics, readLyricsQuery, readSearchedLyrics } from './lyrics.js';
import type { Lyrics } from './lyrics.js';
import { readLimitedBody, waitForRequestSpacing } from './metadata-service.js';

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;
const SPACING = 350;

export function createLyricsService(fetcher: Fetcher = fetch, desktop = false, version?: string) {
  const label = appApiAgent(version);
  const cache = new Map<string, { result: Lyrics | null; until: number }>();
  let nextCall = 0;
  let busy = false;

  async function request(url: string, signal: AbortSignal, limit: number, allowMiss = false): Promise<unknown> {
    signal.throwIfAborted();
    const response = await fetcher(url, {
      signal, headers: { Accept: 'application/json', [desktop ? 'User-Agent' : 'Lrclib-Client']: label },
      referrerPolicy: 'no-referrer', credentials: 'omit', redirect: 'error',
    });
    if (response.ok) {
      const body = await readLimitedBody(response, limit, signal);
      signal.throwIfAborted();
      return JSON.parse(new TextDecoder().decode(body));
    }
    void response.body?.cancel().catch(() => {});
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get('Retry-After');
      const wait = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : NaN;
      const cooldown = Number.isFinite(wait) ? Math.max(1000, wait) : response.status === 429 ? 60_000 : 2000;
      nextCall = Date.now() + cooldown * (1 + Math.random() * .15);
    }
    if (allowMiss && response.status === 404) return null;
    throw new Error('LRCLIB сейчас недоступен. Попробуйте позже.');
  }

  return async (input: unknown, signal: AbortSignal, refresh = false) => {
    const query = readLyricsQuery(input);
    if (!query) return null;
    signal.throwIfAborted();
    const url = lyricsUrl(query).href;
    const hit = cache.get(url);
    if (!refresh && hit && hit.until > Date.now()) return hit.result;
    if (busy || nextCall > Date.now()) throw new Error('Подождите немного перед повторным запросом LRCLIB.');
    busy = true;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    try {
      let result = readLyrics(await request(url, deadline, 384 * 1024, true), query);
      // Do at most one structured v1 search. The same deadline, spacing and cooldown cover both calls.
      if (!result && query.duration !== undefined) {
        await waitForRequestSpacing(SPACING, deadline);
        result = readSearchedLyrics(await request(lyricsSearchUrl(query).href, deadline, 1024 * 1024), query);
      }
      deadline.throwIfAborted();
      cache.delete(url);
      cache.set(url, { result, until: Date.now() + (result ? 3_600_000 : 180_000) });
      if (cache.size > 48) cache.delete(cache.keys().next().value!);
      return result;
    } finally { busy = false; nextCall = Math.max(nextCall, Date.now() + SPACING); }
  };
}
