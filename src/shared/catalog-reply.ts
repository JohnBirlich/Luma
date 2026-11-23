import type { OnlineTrack } from './online.js';

export type CatalogIssue = 'network' | 'timeout' | 'quota' | 'unavailable' | 'response' | 'credentials';
export interface CatalogReply { tracks: OnlineTrack[]; issue?: CatalogIssue }

export class CatalogError extends Error {
  constructor(readonly issue: CatalogIssue) { super('Catalog request failed'); }
}

export function catalogIssue(error: unknown): CatalogIssue {
  return error instanceof CatalogError ? error.issue : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
}

/** No raw endpoint, provider body, exception text or key crosses the desktop IPC boundary. */
export async function catalogReply(work: () => Promise<OnlineTrack[]>): Promise<CatalogReply> {
  try { return { tracks: await work() }; }
  catch (error) { return { tracks: [], issue: catalogIssue(error) }; }
}
