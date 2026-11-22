import { MAX_LYRIC_FILE, readLocalLyrics, readLyricsQuery } from './lyrics.js';
import { createPublicJsonRequest, type PublicApiFetch } from './public-json.js';
import { knownRecordingName } from './recording-match.js';

const LYRICS_OVH_API = 'https://api.lyrics.ovh/v1/';

export function readPlainLyricsQuery(input: unknown) {
  const query = readLyricsQuery(input);
  if (!query || !knownRecordingName(query) || !/[\p{L}\p{N}]/u.test(query.title) || !/[\p{L}\p{N}]/u.test(query.artist)) return;
  return { title: query.title, artist: query.artist };
}

export function createLyricsOvhLookup(fetcher: PublicApiFetch = fetch) {
  const request = createPublicJsonRequest(fetcher, { spacing: 900, limit: MAX_LYRIC_FILE, missing404: true });
  return async (input: unknown, signal: AbortSignal) => {
    const query = readPlainLyricsQuery(input);
    if (!query) return null;
    const url = new URL(`${encodeURIComponent(query.artist)}/${encodeURIComponent(query.title)}`, LYRICS_OVH_API);
    const data = await request(url, signal);
    if (data === null) return null;
    const lyrics = (data as { lyrics?: unknown })?.lyrics;
    if (typeof lyrics !== 'string') throw new Error('Ответ Lyrics.ovh не удалось прочитать.');
    // Never interpret this response as LRC or word timing, even if its text contains timestamps.
    return readLocalLyrics(lyrics);
  };
}
