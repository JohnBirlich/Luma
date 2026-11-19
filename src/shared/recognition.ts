import { cleanTrackText, musicSearchKey } from './russian.js';

export const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
export const ACOUSTID_LOOKUP_URL = 'https://api.acoustid.org/v2/lookup';
export const FINGERPRINT_SECONDS = 120;
export const MAX_AUDIO_SECONDS = 720;
export const MIN_AUDIO_SECONDS = 8;

export interface MetadataCandidate {
  source: 'apple' | 'acoustid';
  page: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  score?: number;
}

export interface Fingerprint {
  compressed: string;
  duration: number;
}

type ObjectData = Record<string, unknown>;
const object = (value: unknown): ObjectData => value !== null && typeof value === 'object' ? value as ObjectData : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const field = (value: unknown) => cleanTrackText(value).slice(0, 256).trim();
const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? `${value}` : undefined;
const seconds = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 24 * 3600 ? value : undefined;
const mbid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

// This is a search variant only, not a display-name conversion or a guess about an artist.
const letters = Object.fromEntries(Object.entries({ shch: 'щ', sch: 'щ', zh: 'ж', kh: 'х', ts: 'ц', ch: 'ч', sh: 'ш',
  ya: 'я', yu: 'ю', yo: 'ё', ye: 'е', iy: 'ий', yy: 'ый', a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г',
  h: 'х', i: 'и', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т',
  u: 'у', v: 'в', w: 'в', x: 'кс', y: 'ы', z: 'з', "'": 'ь' }));
function cyrillicVariant(text: string) {
  return text.toLowerCase().replace(/[’ʼ]/g, "'").replace(/shch|sch|zh|kh|ts|ch|sh|ya|yu|yo|ye|iy|yy|[a-z']/g, (match) => letters[match]);
}
export function metadataQueries(value: unknown): string[] {
  const term = field(value).slice(0, 160).trim().replace(/\s+/gu, ' ');
  if (term.length < 2 || !/[\p{L}\p{N}]/u.test(term)) return [];
  const variant = !/\p{Script=Cyrillic}/u.test(term) && /[a-z]{3}/i.test(term) ? cyrillicVariant(term) : term;
  return [...new Set([term, variant])];
}

function normalized(value: string) {
  return musicSearchKey(cyrillicVariant(value)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function matchesTitle(query: string, title: string) {
  const q = ` ${normalized(query)} `;
  const t = normalized(title);
  return t.length >= 3 && (q.includes(` ${t} `) || ` ${t} `.includes(q));
}
export function hasTitleMatch(query: string, candidates: MetadataCandidate[]) {
  return candidates.some((candidate) => matchesTitle(query, candidate.title));
}

export function musicStorefront(locale: unknown) {
  if (typeof locale !== 'string' || locale.length > 32) return 'RU';
  try {
    const language = new Intl.Locale(locale);
    return language.region?.match(/^[A-Z]{2}$/)?.[0] ?? (language.language === 'ru' ? 'RU' : 'US');
  } catch { return 'RU'; }
}

export function readAppleCandidates(data: unknown, country: string): MetadataCandidate[] {
  const results = object(data).results;
  if (!Array.isArray(results)) throw new Error('Ответ Apple Music не удалось прочитать.');
  if (!/^[A-Z]{2}$/.test(country)) return [];
  return results.slice(0, 18).flatMap((entry) => {
    const track = object(entry);
    const trackId = id(track.trackId);
    const collectionId = id(track.collectionId);
    const title = field(track.trackName);
    const duration = typeof track.trackTimeMillis === 'number' ? seconds(track.trackTimeMillis / 1000) : undefined;
    const artist = field(track.artistName);
    if (track.kind !== 'song' || !trackId || !collectionId || !title || !artist) return [];
    return [{ source: 'apple', page: `https://music.apple.com/${country.toLowerCase()}/album/${collectionId}?i=${trackId}`,
      title, artist, album: field(track.collectionName) || undefined, duration }];
  });
}

export function rankAppleCandidates(candidates: MetadataCandidate[], query: string, artistHint: string, duration: number) {
  const seen = new Set<string>();
  const byScore = (candidate: MetadataCandidate) => {
    const titleScore = normalized(candidate.title) === normalized(query) ? 26 : matchesTitle(query, candidate.title) ? 16 : 0;
    const artistScore = normalized(candidate.artist) === normalized(artistHint) ? 12 : 0;
    const timeScore = candidate.duration && duration > 0 ? Math.max(0, 10 - Math.abs(candidate.duration - duration)) : 0;
    return titleScore + artistScore + timeScore;
  };
  return candidates.filter((candidate) => !seen.has(candidate.page) && seen.add(candidate.page))
    .map((candidate) => ({ candidate, score: byScore(candidate) })).sort((a, b) => b.score - a.score).slice(0, 6).map(({ candidate }) => candidate);
}

export function readAcoustidCandidates(data: unknown): MetadataCandidate[] {
  const response = object(data);
  if (response.status !== 'ok' || !Array.isArray(response.results)) throw new Error('Сервис AcoustID не принял запрос.');
  const seen = new Set<string>();
  return response.results.slice(0, 24).map(object)
    .filter(({ score }) => typeof score === 'number' && score >= 0.65 && score <= 1)
    .sort((a, b) => Number(b.score) - Number(a.score)).flatMap((result): MetadataCandidate[] =>
      list(result.recordings).slice(0, 16).flatMap((entry): MetadataCandidate[] => {
        const recording = object(entry);
        const title = field(recording.title);
        const artist = field(list(recording.artists).slice(0, 8).map((item) => field(object(item).name)).filter(Boolean).join(', '));
        if (typeof recording.id !== 'string' || !mbid.test(recording.id) || seen.has(recording.id) || !title || !artist) return [];
        seen.add(recording.id);
        return [{ source: 'acoustid', page: `https://musicbrainz.org/recording/${recording.id}`, title, artist,
          duration: seconds(recording.duration), score: Number(result.score) }];
      })).slice(0, 6);
}

export function isMetadataPage(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 180 || value.trim() !== value) return false;
  return /^https:\/\/music\.apple\.com\/[a-z]{2}\/album\/[1-9]\d{0,15}\?i=[1-9]\d{0,15}$/.test(value)
    || (value.startsWith('https://musicbrainz.org/recording/') && mbid.test(value.slice('https://musicbrainz.org/recording/'.length)));
}

export function isFingerprint(value: unknown): value is Fingerprint {
  const { compressed, duration } = object(value);
  return typeof compressed === 'string' && /^[A-Za-z0-9_-]{16,16384}={0,2}$/.test(compressed)
    && typeof duration === 'number' && Number.isInteger(duration) && duration >= MIN_AUDIO_SECONDS && duration <= MAX_AUDIO_SECONDS;
}
