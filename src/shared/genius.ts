import { catalogObject as object } from './online.js';
import { serviceCredential, serviceQuery } from './music-services.js';
import { createPublicJsonRequest, PublicHttpError } from './public-json.js';
import type { PublicApiFetch } from './public-json.js';
import { cleanTrackText } from './russian.js';

const API = 'https://api.genius.com/';
export interface GeniusSong { id: number; title: string; artist: string; page: string }
export interface GeniusAnnotation { id: number; excerpt: string }
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 999_999_999;

export function isGeniusPage(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 750) return false;
  // Only the song page, no query, anchors, redirect route, subdirectory or credentials.
  const prefix = 'https://genius.com/';
  if (!value.startsWith(prefix) || !/^(?:[A-Za-z0-9_-]|%[0-9a-fA-F]{2}){1,240}-lyrics$/.test(value.slice(prefix.length))) return false;
  try { return /^[\p{L}\p{M}\p{N}_-]+-lyrics$/u.test(decodeURIComponent(value.slice(prefix.length))); }
  catch { return false; }
}

function results(value: unknown, field: string) {
  const row = object(value);
  const rows = object(row.response)[field];
  if (object(row.meta).status !== 200 || !Array.isArray(rows)) throw new Error('Ответ Genius не удалось прочитать.');
  return rows;
}

export function geniusSongs(data: unknown): GeniusSong[] {
  const found = new Map<number, GeniusSong>();
  for (const hit of results(data, 'hits').slice(0, 10)) {
    const row = object(hit), song = object(row.result);
    const title = cleanTrackText(song.title).slice(0, 200);
    const artist = cleanTrackText(object(song.primary_artist).name).slice(0, 180);
    if (row.type === 'song' && validId(song.id) && title && artist && isGeniusPage(song.url)) {
      found.set(song.id, { id: song.id, title, artist, page: song.url });
    }
  }
  return [...found.values()].slice(0, 6);
}

export function geniusAnnotations(data: unknown): GeniusAnnotation[] {
  const found = new Map<number, GeniusAnnotation>();
  for (const referent of results(data, 'referents').slice(0, 6)) {
    const { annotations } = object(referent);
    if (!Array.isArray(annotations)) continue;
    for (const item of annotations.slice(0, 2)) {
      const row = object(item);
      // Deliberately omit the referent's lyric fragment, rich HTML and user/account data.
      const text = cleanTrackText(object(row.body).plain).replace(/\s+/gu, ' ');
      if (validId(row.id) && text) found.set(row.id, { id: row.id, excerpt: text.length > 420 ? `${text.slice(0, 420).trimEnd()}…` : text });
    }
  }
  return [...found.values()].slice(0, 5);
}

export function createGeniusLookup(fetcher: PublicApiFetch) {
  const request = createPublicJsonRequest(fetcher, { spacing: 600, limit: 384 * 1024 });
  async function get(url: URL, value: unknown, signal: AbortSignal) {
    const token = serviceCredential('genius', value);
    if (!token) throw new Error('Добавьте токен Genius в настройках.');
    try { return await request(url, signal, { headers: { Authorization: `Bearer ${token}` } }); }
    catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof PublicHttpError && (error.status === 401 || error.status === 403)) throw new Error('Genius не принял токен. Проверьте настройки.');
      throw new Error('Genius сейчас недоступен. Повторите попытку позже.');
    }
  }
  return {
    async search(query: unknown, token: unknown, signal: AbortSignal) {
      const text = serviceQuery(query);
      if (!text) return [];
      const url = new URL('search', API);
      url.searchParams.set('q', text);
      return geniusSongs(await get(url, token, signal));
    },
    async annotations(id: unknown, token: unknown, signal: AbortSignal) {
      if (!validId(id)) return [];
      const url = new URL('referents', API);
      url.search = new URLSearchParams({ song_id: String(id), text_format: 'plain', per_page: '6' }).toString();
      return geniusAnnotations(await get(url, token, signal));
    },
  };
}
