import { catalogObject, PHISH_API, phishDate, phishSlug, readOnlineTrack } from './online.js';
import type { OnlineTrack } from './online.js';
import { createPublicJsonRequest, type PublicApiFetch } from './public-json.js';
import { cleanTrackText, musicSearchKey } from './russian.js';

/** This archive is queried only for explicitly prefixed song searches, e.g. Phish Llama. */
export function phishSongQuery(query: string) {
  const title = /^phish(?:\s*:\s*|\s+)(.+)$/i.exec(cleanTrackText(query).replace(/\s+/gu, ' '))?.[1].trim();
  if (!title || title.length < 3 || title.length > 96 ||
    !/^[\p{L}\p{N}][\p{L}\p{N}\s'’.,!?&()+-]*$/u.test(title)) return;
  return title;
}

function exactSong(value: unknown, title: string) {
  const { songs } = catalogObject(value);
  if (!Array.isArray(songs)) throw new Error('Ответ Phish.in не удалось прочитать.');
  const key = musicSearchKey(title);
  const matches = songs.slice(0, 50).map(catalogObject).filter(({ slug, title, alias, tracks_with_audio_count }) =>
    phishSlug(slug) && Number.isSafeInteger(tracks_with_audio_count) && Number(tracks_with_audio_count) > 0 &&
    [title, alias].some((name) => typeof name === 'string' && musicSearchKey(name) === key));
  return matches.length === 1 && phishSlug(matches[0].slug) ? matches[0].slug : undefined;
}

const EXCLUDED_TAGS = new Set(['sbd', 'cut', 'unfinished']);
function audienceTags(raw: unknown) {
  return Array.isArray(raw) && raw.length <= 128 && raw.every((item) => {
    const { name } = catalogObject(item);
    return typeof name === 'string' && !EXCLUDED_TAGS.has(musicSearchKey(name));
  });
}

export function readPhishTracks(data: unknown, song: string) {
  const { tracks } = catalogObject(data);
  if (!Array.isArray(tracks)) throw new Error('Ответ Phish.in не удалось прочитать.');
  const results = new Map<string, OnlineTrack>();
  for (const item of tracks.slice(0, 12)) {
    const track = catalogObject(item), show = catalogObject(track.show);
    const date = track.show_date;
    if (track.audio_status !== 'complete' || !phishSlug(track.slug) || !phishDate(date) || show.date !== date ||
      typeof track.id !== 'number' || !Number.isSafeInteger(track.id) || track.id < 1 ||
      typeof track.duration !== 'number' || !Number.isSafeInteger(track.duration) || track.duration < 10_000 || track.duration > 86_400_000 ||
      !audienceTags(track.tags) || !audienceTags(show.tags) ||
      !Array.isArray(track.songs) || !track.songs.slice(0, 8).some((item) => catalogObject(item).slug === song)) continue;
    const venue = cleanTrackText(track.venue_name).slice(0, 170);
    const normalized = readOnlineTrack({ id: `phish-${track.id}`, title: track.title, duration: track.duration / 1000,
      album: venue ? `${date} · ${venue}` : date, audioUrl: track.mp3_url,
      online: { source: 'phishin', page: `https://phish.in/${date}/${track.slug}` } });
    if (normalized) results.set(normalized.id, normalized);
  }
  return [...results.values()];
}

export function createPhishSearch(fetcher: PublicApiFetch = fetch) {
  const request = createPublicJsonRequest(fetcher, { spacing: 350, limit: 512 * 1024 });
  return async (query: string, signal: AbortSignal) => {
    const title = phishSongQuery(query);
    if (!title) return [];
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
    const search = new URL(`search/${encodeURIComponent(title)}`, PHISH_API);
    search.search = new URLSearchParams({ scope: 'songs', audio_status: 'complete_or_partial' }).toString();
    const song = exactSong(await request(search, deadline), title);
    if (!song) return [];
    const tracks = new URL('tracks', PHISH_API);
    tracks.search = new URLSearchParams({ song_slug: song, audio_status: 'complete', per_page: '12', sort: 'likes_count:desc' }).toString();
    return readPhishTracks(await request(tracks, deadline), song);
  };
}
