import { readWordTimedLyrics } from './lyricsfile.js';
import { artistCreditKey, cleanTrackText, musicSearchKey } from './russian.js';

export const LRCLIB_URL = 'https://lrclib.net/api/get';
const SEARCH_RESULT_LIMIT = 20;
export interface LyricsQuery { title: string; artist: string; album?: string; duration?: number }
export interface Lyrics { plain?: string; synced?: string; wordLines?: LyricLine[]; instrumental: boolean }
export const MAX_LYRIC_FILE = 128 * 1024;
export interface TimedWord { time: number; end?: number; text: string }
export interface LyricLine extends TimedWord { words?: TimedWord[] }
const field = (value: unknown) => typeof value === 'string' && value.length <= 256 ? cleanTrackText(value) : '';

export function readLyricsQuery(input: unknown): LyricsQuery | undefined {
  const row = input as Partial<LyricsQuery> | null;
  const title = field(row?.title), artist = field(row?.artist), album = field(row?.album);
  if (!title || !artist || title === 'Без названия' || artist === 'Неизвестный исполнитель') return;
  const duration = row?.duration;
  return { title, artist, ...(album && album !== 'Без альбома' && { album }),
    ...(typeof duration === 'number' && duration >= 1 && duration <= 3600 && { duration }) };
}

export function lyricsUrl(query: LyricsQuery) {
  const url = new URL(LRCLIB_URL);
  url.searchParams.set('track_name', query.title);
  url.searchParams.set('artist_name', query.artist);
  if (query.album) url.searchParams.set('album_name', query.album);
  if (query.duration) url.searchParams.set('duration', String(query.duration));
  return url;
}

export function lyricsSearchUrl(query: LyricsQuery) {
  const url = lyricsUrl(query);
  url.pathname = '/api/search';
  url.searchParams.delete('duration');
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

/** A pasted LRC stays timed; ordinary text is not treated as synchronized lyrics. */
export function readCustomLyrics(value: unknown): Lyrics | null {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_LYRIC_FILE) return null;
  return readLocalLyrics(undefined, value) ?? readLocalLyrics(value);
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

export function activeLyricLine(lines: readonly { time: number }[], seconds: number) {
  let lo = 0, hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].time <= seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function activeLyricWord(line: LyricLine | undefined, seconds: number) {
  if (!line?.words || (line.end !== undefined && seconds >= line.end)) return -1;
  const { words } = line;
  // Use the latest still-active segment when explicit intervals overlap.
  for (let index = activeLyricLine(words, seconds); index >= 0; index--) {
    const end = words[index].end ?? words[index + 1]?.time;
    if (end === undefined || seconds < end) return index;
  }
  return -1;
}

interface LyricsRecord {
  trackName?: unknown; artistName?: unknown; albumName?: unknown; duration?: unknown;
  plainLyrics?: unknown; syncedLyrics?: unknown; instrumental?: unknown; hasWordSync?: unknown; lyricsfile?: unknown;
}

function matchRecording(input: unknown, query: LyricsQuery) {
  const row = input as LyricsRecord | null;
  if (!row) return;
  const title = field(row.trackName), artist = field(row.artistName), duration = query.duration;
  if (!title || !artist || musicSearchKey(title) !== musicSearchKey(query.title)) return;
  // An alternate recording can have different timing and even different words. Don't attach it.
  if (duration !== undefined && (typeof row.duration !== 'number' || !Number.isFinite(row.duration) || row.duration <= 0
    || Math.abs(duration - row.duration) > 2)) return;
  const credit = artistCreditKey(artist);
  if (musicSearchKey(artist) !== musicSearchKey(query.artist) && (duration === undefined || !credit || credit !== artistCreditKey(query.artist))) return;
  return { row, title, artist, duration };
}

function readMatchedLyrics({ row, title, artist, duration }: NonNullable<ReturnType<typeof matchRecording>>): Lyrics | null {
  if (row.instrumental === true) return { instrumental: true };
  const legacy = readLocalLyrics(row.plainLyrics, duration !== undefined ? row.syncedLyrics : undefined);
  const wordLines = duration !== undefined && row.hasWordSync === true ? readWordTimedLyrics(row.lyricsfile, { title, artist, duration }) : undefined;
  return wordLines ? { ...(legacy ?? { instrumental: false }), wordLines } : legacy;
}

export function readLyrics(input: unknown, query: LyricsQuery): Lyrics | null {
  const match = matchRecording(input, query);
  return match ? readMatchedLyrics(match) : null;
}

export function readSearchedLyrics(input: unknown, query: LyricsQuery): Lyrics | null {
  if (!Array.isArray(input)) throw new Error('Ответ LRCLIB не удалось прочитать.');
  // A full page may hide another version. Do not attach lyrics on incomplete evidence.
  if (query.duration === undefined || input.length >= SEARCH_RESULT_LIMIT) return null;
  const album = query.album && musicSearchKey(query.album);
  let candidate: ReturnType<typeof matchRecording>;
  for (const row of input) {
    const match = matchRecording(row, query);
    if (!match || (album && musicSearchKey(field(match.row.albumName)) !== album)) continue;
    if (candidate) return null;
    candidate = match;
  }
  // Count matches before checking their lyrics; a better timing format cannot identify the recording.
  return candidate ? readMatchedLyrics(candidate) : null;
}

export type LyricSource = 'auto' | 'attached' | 'local' | 'lrclib' | 'lyricsovh' | 'edition';

/** An edition is prose, not a recording match. Explicit sources never silently substitute another text. */
export function selectLyrics(choice: LyricSource, inputs: {
  attached?: Lyrics; local?: Lyrics | null; lrclib?: Lyrics | null; lyricsovh?: Lyrics | null; edition?: { plain: string };
}): { source?: Exclude<LyricSource, 'auto'>; lyrics?: Lyrics } {
  const { attached, local, lrclib, lyricsovh, edition } = inputs;
  if (choice === 'lyricsovh') return { source: 'lyricsovh', lyrics: readLocalLyrics(lyricsovh?.plain) ?? undefined };
  if (choice === 'edition') return { source: 'edition', lyrics: edition && { plain: edition.plain, instrumental: false } };
  if (choice === 'attached' || (choice === 'auto' && attached)) return { source: 'attached', lyrics: attached };
  if (choice === 'local' || (choice === 'auto' && local)) return { source: 'local', lyrics: local ?? undefined };
  if (choice === 'lrclib' || lrclib) return { source: 'lrclib', lyrics: lrclib ?? undefined };
  return {};
}
