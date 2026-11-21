import { CatalogRateLimit, findOnlineTracks } from './online';
import type { OnlineTrack } from '../shared/online';

const OPENVERSE = { id: 'openverse', source: 'all', name: 'Jamendo + Wikimedia Commons' } as const;
const NETLABELS = { id: 'netlabels', source: 'netlabels', name: 'Internet Archive · Netlabels' } as const;
const SOUTHERN_CITY = { id: 'southern_city', source: 'southern_city', name: 'Southern City’s Lab · Internet Archive' } as const;
const CCMIXTER = { id: 'ccmixter', source: 'ccmixter', name: 'ccMixter' } as const;
const AUDIUS = { id: 'audius', source: 'audius', name: 'Audius' } as const;
export type CatalogTarget = typeof OPENVERSE | typeof NETLABELS | typeof SOUTHERN_CITY | typeof CCMIXTER | typeof AUDIUS;
export type CatalogId = CatalogTarget['id'];
export type CatalogResult = { id: CatalogId; tracks: OnlineTrack[] } | { id: CatalogId; error: unknown };
export const catalogTargets = (desktop: boolean): readonly CatalogTarget[] => desktop ? [OPENVERSE, NETLABELS, CCMIXTER, AUDIUS, SOUTHERN_CITY] : [OPENVERSE];
export const CATALOG_DEBOUNCE_MS = 650;

export function catalogQuery(text: string) {
  const value = text.normalize('NFC').replace(/[\p{Cc}\s]+/gu, ' ').trim().slice(0, 140).trimEnd();
  return value.length >= 2 && /[\p{L}\p{N}]/u.test(value) ? value : '';
}

/** Memory only: no history of what was searched. Debouncing lives in the UI; repeated queries reuse a short-lived result. */
export function createCatalogSearch(find = findOnlineTracks, now = Date.now) {
  const cache = new Map<string, { tracks: OnlineTrack[]; expires: number }>();
  let openverseBlockedUntil = 0;
  return async (query: string, targets: readonly CatalogTarget[], signal: AbortSignal, report: (result: CatalogResult) => void) => {
    const text = catalogQuery(query);
    if (!text || signal.aborted) return;
    await Promise.all(targets.map(async ({ id, source }) => {
      const key = `${id}:${text}`;
      const hit = cache.get(key);
      if (hit && hit.expires > now()) { report({ id, tracks: hit.tracks }); return; }
      const wait = id === 'openverse' ? openverseBlockedUntil - now() : 0;
      if (wait > 0) { report({ id, error: new CatalogRateLimit(wait) }); return; }
      let result: CatalogResult;
      try {
        const tracks = await find(text, source, signal);
        if (signal.aborted) return;
        cache.delete(key);
        cache.set(key, { tracks, expires: now() + 2 * 60_000 });
        if (cache.size > 24) cache.delete(cache.keys().next().value!);
        result = { id, tracks };
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

/** Keep per-catalog order, interleave sources fairly, and show overlapping Archive releases only once. */
export function mergeCatalogResults(results: readonly CatalogResult[]) {
  const groups = results.flatMap((result) => 'tracks' in result ? [result.tracks] : []);
  const merged = new Map<string, OnlineTrack>();
  for (let i = 0; groups.some((rows) => i < rows.length); i++) {
    for (const rows of groups) {
      const row = rows[i];
      if (row && !merged.has(row.id)) merged.set(row.id, row);
    }
  }
  return [...merged.values()];
}
