import { catalogLicense, catalogObject as object, jamendoTrackId, readOnlineTrack } from './online.js';
import type { OnlineTrack } from './online.js';
import { serviceCredential, serviceQuery } from './music-services.js';
import { createPublicJsonRequest } from './public-json.js';
import type { PublicApiFetch } from './public-json.js';

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
  // Jamendo reports invalid credentials and some quota errors with an HTTP 200 body.
  if (object(headers).status !== 'success' || !Array.isArray(results)) throw new Error('Jamendo не принял запрос. Проверьте Client ID в настройках.');
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
  return async (query: unknown, clientId: unknown, signal: AbortSignal) => {
    const url = jamendoSearchUrl(query, clientId);
    if (!url) return [];
    try { return jamendoTracks(await request(url, signal)); }
    catch (error) {
      // A fetch error can carry its request URL. Never forward the Client ID in an IPC error.
      if (signal.aborted) throw signal.reason;
      if (error instanceof Error && error.message === 'Jamendo не принял запрос. Проверьте Client ID в настройках.') throw error;
      throw new Error('Jamendo сейчас недоступен. Проверьте сеть и Client ID.');
    }
  };
}
