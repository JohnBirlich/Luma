import { CatalogRateLimit, findCatalog } from './online';
import { jamendoRecording } from '../shared/online';
import { CatalogError } from '../shared/catalog-reply';
import type { CatalogReply } from '../shared/catalog-reply';
import type { OnlineFilter, OnlineTrack } from '../shared/online';

const OPENVERSE = { id: 'openverse', source: 'all', name: 'Jamendo + Wikimedia Commons' } as const;
const NETLABELS = { id: 'netlabels', source: 'netlabels', name: 'Internet Archive · Netlabels' } as const;
const SOUTHERN_CITY = { id: 'southern_city', source: 'southern_city', name: 'Southern City’s Lab · Internet Archive' } as const;
const AUDIUS = { id: 'audius', source: 'audius', name: 'Audius' } as const;
const JAMENDO = { id: 'jamendo_direct', source: 'jamendo_direct', name: 'Jamendo · напрямую' } as const;
const PHISH = { id: 'phishin', source: 'phishin', name: 'Phish.in · концерты' } as const;
export type CatalogTarget = typeof OPENVERSE | typeof NETLABELS | typeof SOUTHERN_CITY | typeof AUDIUS | typeof JAMENDO | typeof PHISH;
export type CatalogId = CatalogTarget['id'];
export type CatalogResult = ({ id: CatalogId } & CatalogReply) | { id: CatalogId; error: unknown };
export const catalogTargets = (desktop: boolean, phish = false, jamendo = false): readonly CatalogTarget[] => [
  OPENVERSE, ...(desktop ? [NETLABELS, AUDIUS, SOUTHERN_CITY, ...(jamendo ? [JAMENDO] : [])] : []), ...(phish ? [PHISH] : []),
];
export const CATALOG_DEBOUNCE_MS = 650;

export function catalogQuery(text: string) {
  const value = text.normalize('NFC').replace(/[\p{Cc}\s]+/gu, ' ').trim().slice(0, 140).trimEnd();
  return value.length >= 2 && /[\p{L}\p{N}]/u.test(value) ? value : '';
}

/** Memory only: no history of what was searched. Debouncing lives in the UI; repeated queries reuse a short-lived result. */
export function createCatalogSearch(find: (query: string, source: OnlineFilter, signal: AbortSignal) => Promise<CatalogReply | OnlineTrack[]> = findCatalog, now = Date.now) {
  const cache = new Map<string, { tracks: OnlineTrack[]; expires: number }>();
  let openverseBlockedUntil = 0;
  return async (query: string, targets: readonly CatalogTarget[], signal: AbortSignal, report: (result: CatalogResult) => void) => {
    const text = catalogQuery(query);
    if (!text || signal.aborted) return;
    await Promise.all(targets.map(async ({ id, source }) => {
      const key = `${id}:${text}`;
      // Direct Jamendo results depend on the locally configured app and are not reused after it changes.
      const hit = id === 'jamendo_direct' ? undefined : cache.get(key);
      if (hit && hit.expires > now()) { report({ id, tracks: hit.tracks }); return; }
      const wait = id === 'openverse' ? openverseBlockedUntil - now() : 0;
      if (wait > 0) { report({ id, error: new CatalogRateLimit(wait) }); return; }
      let result: CatalogResult;
      try {
        const reply = await find(text, source, signal);
        const { tracks, issue } = Array.isArray(reply) ? { tracks: reply, issue: undefined } : reply;
        if (signal.aborted) return;
        if (issue && !tracks.length) throw new CatalogError(issue);
        if (!issue && id !== 'jamendo_direct') {
          cache.delete(key);
          cache.set(key, { tracks, expires: now() + 2 * 60_000 });
          if (cache.size > 24) cache.delete(cache.keys().next().value!);
        }
        result = { id, tracks, ...(issue && { issue }) };
      } catch (error) {
        if (signal.aborted) return;
        if (id === 'openverse' && error instanceof CatalogRateLimit) openverseBlockedUntil = Math.max(openverseBlockedUntil, now() + error.retryMs);
        result = { id, error };
      }
      if (!signal.aborted) report(result);
    }));
  };
}

export const searchCatalogs = createCatalogSearch();

export function compareJamendo(openverse: readonly OnlineTrack[], direct: readonly OnlineTrack[]) {
  const indexed = new Set(openverse.map(jamendoRecording).filter(Boolean));
  const recordings = new Set(direct.map(jamendoRecording).filter(Boolean));
  const matches = [...recordings].filter((id) => indexed.has(id)).length;
  return { matches, additional: recordings.size - matches };
}

/** Keep per-catalog order, prefer Openverse for the same Jamendo ID, and keep distinct recordings. */
export function mergeCatalogResults(results: readonly CatalogResult[]) {
  const indexed = new Set(results.flatMap((result) => result.id === 'openverse' && 'tracks' in result ? result.tracks.map(jamendoRecording).filter(Boolean) : []));
  const groups = results.flatMap((result) => 'tracks' in result ? [result.id === 'jamendo_direct'
    ? result.tracks.filter((track) => !indexed.has(jamendoRecording(track))) : result.tracks] : []);
  const merged = new Map<string, OnlineTrack>();
  for (let i = 0; groups.some((rows) => i < rows.length); i++) {
    for (const rows of groups) {
      const row = rows[i];
      if (row && !merged.has(row.id)) merged.set(row.id, row);
    }
  }
  return [...merged.values()];
}
