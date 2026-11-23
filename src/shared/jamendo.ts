import { catalogLicense, catalogObject as object, jamendoTrackId, readOnlineTrack } from './online.js';
import type { OnlineTrack } from './online.js';
import { serviceCredential, serviceQuery } from './music-services.js';
import { createPublicJsonRequest, PublicCooldownError, PublicHttpError } from './public-json.js';
import type { PublicApiFetch } from './public-json.js';

import { CatalogError, catalogIssue } from './catalog-reply.js';

const API = 'https://api.jamendo.com/v3.0/tracks/';
const LIMIT = 24;

export function jamendoSearchUrl(value: unknown, credential: unknown) {
  const query = serviceQuery(value), clientId = serviceCredential('jamendo', credential);
  if (!query || !clientId) return;
  const url = new URL(API);
  url.search = new URLSearchParams({ client_id: clientId, format: 'json', limit: String(LIMIT),
    type: 'single albumtrack', audioformat: 'mp32', search: query }).toString();
  return url;
}

export function jamendoTracks(value: unknown): OnlineTrack[] {
  const { headers, results } = object(value);
  const { code, status } = object(headers);
  // v3 response codes: a failure may be wrapped in HTTP 200. Do not relay error_message.
  if (code === 5 || code === '5' || code === 11 || code === '11') throw new CatalogError('credentials');
  if (code === 6 || code === '6') throw new CatalogError('quota');
  if (status === 'failed') throw new CatalogError('unavailable');
  if (!['success', 'succeed'].includes(String(status)) || (code !== 0 && code !== '0') || !Array.isArray(results)) throw new CatalogError('response');
  const tracks = new Map<string, OnlineTrack>();
  for (const item of results.slice(0, LIMIT)) {
    const row = object(item);
    const id = jamendoTrackId(row.id);
    if (!id || typeof row.artist_name !== 'string' || !row.artist_name.trim()) continue;
    const duration = typeof row.duration === 'string' && /^\d{1,5}$/.test(row.duration) ? Number(row.duration) : row.duration;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86_400) continue;
    // Only the stream field. Never expose download URLs, album art, or parameters carrying an app credential.
    const track = readOnlineTrack({ id: `jamendo-${id}`, title: row.name, artist: row.artist_name, album: row.album_name, duration,
      audioUrl: row.audio, online: { source: 'jamendo', page: `https://www.jamendo.com/track/${id}`, licenseUrl: catalogLicense(row.license_ccurl)?.url } });
    if (track && track.artist !== 'Неизвестный исполнитель') tracks.set(track.id, track);
  }
  return [...tracks.values()];
}

export function createJamendoSearch(fetcher: PublicApiFetch) {
  const request = createPublicJsonRequest(fetcher, { spacing: 1000, limit: 512 * 1024 });
  // A quota signalled in HTTP 200 is not visible to the transport's Retry-After logic.
  let bodyQuotaUntil = 0;
  return async (query: unknown, clientId: unknown, signal: AbortSignal) => {
    signal.throwIfAborted();
    const url = jamendoSearchUrl(query, clientId);
    if (!url) return [];
    if (bodyQuotaUntil > Date.now()) throw new CatalogError('quota');
    try { return jamendoTracks(await request(url, signal)); }
    catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof CatalogError) {
        if (error.issue === 'quota') bodyQuotaUntil = Date.now() + 60_000;
        throw error;
      }
      if (error instanceof PublicCooldownError) throw new CatalogError('quota');
      if (error instanceof PublicHttpError) throw new CatalogError(error.status === 429 ? 'quota' : error.status === 401 ? 'credentials' : 'unavailable');
      throw new CatalogError(error instanceof SyntaxError ? 'response' : catalogIssue(error));
    }
  };
}
