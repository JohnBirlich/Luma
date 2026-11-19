import { cleanTrackText, musicSearchKey } from './russian.js';

export const LRCLIB_URL = 'https://lrclib.net/api/get';
export interface LyricsQuery { title: string; artist: string; album?: string; duration?: number }
export interface Lyrics { plain?: string; synced?: string; instrumental: boolean }
export const MAX_LYRIC_FILE = 128 * 1024;
export interface LyricLine { time: number; text: string }
const field = (value: unknown) => typeof value === 'string' && value.length <= 256 ? cleanTrackText(value) : '';

export function readLyricsQuery(input: unknown): LyricsQuery | undefined {
  const row = input as Partial<LyricsQuery> | null;
  const title = field(row?.title), artist = field(row?.artist), album = field(row?.album);
  if (!title || !artist || title === 'Без названия' || artist === 'Неизвестный исполнитель') return;
  const duration = row?.duration;
  return { title, artist, ...(album && album !== 'Без альбома' && { album }),
    ...(typeof duration === 'number' && duration >= 1 && duration <= 3600 && { duration: Math.round(duration) }) };
}

export function lyricsUrl(query: LyricsQuery) {
  const url = new URL(LRCLIB_URL);
  url.searchParams.set('track_name', query.title);
  url.searchParams.set('artist_name', query.artist);
  if (query.album) url.searchParams.set('album_name', query.album);
  if (query.duration) url.searchParams.set('duration', String(query.duration));
  return url;
}

function cleanLyrics(value: unknown) {
  if (typeof value !== 'string' || value.length > 64_000) return;
  const text = value.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '').trim();
  return text || undefined;
}

export function readLocalLyrics(plainText?: unknown, lrcText?: unknown): Lyrics | null {
  const plain = cleanLyrics(plainText);
  const lrc = cleanLyrics(lrcText);
  const synced = lrc && timedLines(lrc).some(({ text }) => text) ? lrc : undefined;
  return plain || synced ? { instrumental: false, ...(plain && { plain }), ...(synced && { synced }) } : null;
}

export function lyricsFromTags(tags?: { text?: string; timeStampFormat?: number; contentType?: number; syncText?: { timestamp?: number; text: string }[] }[]) {
  const timed = tags?.find((tag) => tag.timeStampFormat === 2 && tag.contentType === 1 && tag.syncText?.length)?.syncText;
  const synced = timed?.slice(0, 600).flatMap(({ timestamp, text }) => {
    if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 60_000_000 || !text.trim()) return [];
    const min = Math.floor(timestamp / 60_000);
    const sec = String(Math.floor(timestamp / 1000) % 60).padStart(2, '0');
    const ms = String(timestamp % 1000).padStart(3, '0');
    return [`[${min}:${sec}.${ms}]${text.replace(/[\r\n]+/g, ' ').slice(0, 1000)}`];
  }).join('\n');
  return readLocalLyrics(tags?.find(({ text }) => text?.trim())?.text, synced);
}

export function timedLines(text: string): LyricLine[] {
  const rows = text.split('\n').slice(0, 600);
  const offset = rows.map((row) => /^\[offset:([+-]?\d{1,6})\]$/i.exec(row.trim())).find(Boolean);
  const adjust = offset ? Number(offset[1]) / 1000 : 0;
  return rows.flatMap((row) => {
    const stamps = /^((?:\[\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?\]){1,8})/.exec(row.trim());
    if (!stamps) return [];
    const text = row.trim().slice(stamps[0].length).trim();
    return [...stamps[1].matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)].map(([, minutes, seconds, digits]) => ({
      time: Math.max(0, Number(minutes) * 60 + Number(seconds) + (digits ? Number(`0.${digits}`) : 0) + adjust), text,
    }));
  }).sort((a, b) => a.time - b.time);
}

export function activeLyricLine(lines: LyricLine[], seconds: number) {
  let lo = 0, hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].time <= seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function readLyrics(input: unknown, query: LyricsQuery): Lyrics | null {
  const row = input as (LyricsQuery & { trackName?: unknown; artistName?: unknown; plainLyrics?: unknown; syncedLyrics?: unknown; instrumental?: unknown }) | null;
  if (musicSearchKey(field(row?.trackName)) !== musicSearchKey(query.title) || musicSearchKey(field(row?.artistName)) !== musicSearchKey(query.artist)) return null;
  // An alternate recording can have different timing and even different words. Don't attach it.
  const sameLength = typeof row?.duration === 'number' && Number.isFinite(row.duration) && query.duration !== undefined && Math.abs(query.duration - row.duration) <= 2;
  if (query.duration !== undefined && !sameLength) return null;
  if (row?.instrumental === true) return { instrumental: true };
  return readLocalLyrics(row?.plainLyrics, sameLength ? row?.syncedLyrics : undefined);
}
