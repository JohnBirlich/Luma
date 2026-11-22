import { createPublicJsonRequest, type PublicApiFetch } from './public-json.js';
import type { MetadataCandidate } from './recognition.js';
import { knownRecordingName, readIsrc } from './recording-match.js';
import { artistCreditKey, cleanTrackText, musicSearchKey } from './russian.js';

// 123 is the provider's published free v1 key, not a private credential.
const TRACK_SEARCH = 'https://www.theaudiodb.com/api/v1/json/123/searchtrack.php';
export const THEAUDIODB_ART_ORIGIN = 'https://r2.theaudiodb.com/images/media/track/thumb/';
const row = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const field = (value: unknown, limit = 160) => typeof value === 'string' && value.length <= 256 ? cleanTrackText(value).slice(0, limit).trim() : '';

export function readAudioDbQuery(value: unknown) {
  const input = row(value);
  const title = field(input.title), artist = field(input.artist);
  if (!knownRecordingName({ title, artist }) || !/[\p{L}\p{N}]/u.test(title) || !/[\p{L}\p{N}]/u.test(artist)) return;
  return { title, artist };
}

function trackArt(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith(THEAUDIODB_ART_ORIGIN)) return;
  const file = value.slice(THEAUDIODB_ART_ORIGIN.length);
  if (/^[A-Za-z0-9_-]{1,128}\.(?:jpg|jpeg|png)$/i.test(file)) return `${THEAUDIODB_ART_ORIGIN}${file}/small`;
}

export function readAudioDbCandidates(value: unknown, query: NonNullable<ReturnType<typeof readAudioDbQuery>>): MetadataCandidate[] {
  const tracks = row(value).track;
  if (tracks === null) return [];
  if (!Array.isArray(tracks)) throw new Error('Ответ TheAudioDB не удалось прочитать.');
  // Free search returns at most one track. This is a candidate, not a version match.
  const item = row(tracks[0]);
  const title = field(item.strTrack), artist = field(item.strArtist), id = item.idTrack;
  if (typeof id !== 'string' || !/^[1-9]\d{0,11}$/.test(id) || musicSearchKey(title) !== musicSearchKey(query.title) ||
    !artist || ![artist, field(item.strArtistAlternate)].some((name) => artistCreditKey(name) === artistCreditKey(query.artist))) return [];
  const milliseconds = typeof item.intDuration === 'string' && /^\d{1,8}$/.test(item.intDuration) ? Number(item.intDuration) : item.intDuration;
  const duration = typeof milliseconds === 'number' && Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 86_400_000
    ? milliseconds / 1000 : undefined;
  return [{ source: 'theaudiodb', page: `https://www.theaudiodb.com/track/${id}`, title, artist,
    album: field(item.strAlbum) || undefined, genre: field(item.strGenre, 80) || undefined,
    duration, isrc: typeof item.strISRC === 'string' ? readIsrc(item.strISRC) : undefined, artworkUrl: trackArt(item.strTrackThumb) }];
}

export function createAudioDbLookup(fetcher: PublicApiFetch = fetch) {
  // Free API: 30 requests/minute; no automatic searches or retries.
  const request = createPublicJsonRequest(fetcher, { spacing: 2100, limit: 384 * 1024 });
  return async (input: unknown, signal: AbortSignal) => {
    const query = readAudioDbQuery(input);
    if (!query) return [];
    const url = new URL(TRACK_SEARCH);
    url.search = new URLSearchParams({ s: query.artist, t: query.title }).toString();
    return readAudioDbCandidates(await request(url, signal), query);
  };
}
