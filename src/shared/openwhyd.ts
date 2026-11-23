import { playlistTitle } from './luma-playlists.js';
import { catalogObject as object } from './online.js';
import type { PlaylistDraft } from './playlist-import.js';
import { createPublicJsonRequest } from './public-json.js';
import type { PublicApiFetch } from './public-json.js';
import { cleanTrackText } from './russian.js';
import { readRecordingReference } from './track-list.js';

const ORIGIN = 'https://openwhyd.org';
const LIMIT = 200;
const playlistPath = /^\/[a-z\d_-]{1,80}\/playlist\/(\d{1,9})\/?$/i;
const youtubeId = /^[A-Za-z0-9_-]{11}$/;
const soundcloudPath = /^\/[a-z\d_-]{1,80}\/[a-z\d_-]{1,160}$/i;
const bandcampPage = /^https:\/\/[a-z\d-]{1,62}\.bandcamp\.com\/track\/[a-z\d_-]{1,160}$/i;
const sourcePages = [
  [/^\/vi\/(\d{1,16})$/, 'https://vimeo.com/'],
  [/^\/dz\/(\d{1,16})$/, 'https://www.deezer.com/track/'],
  [/^\/dm\/([a-z\d]{1,20})$/i, 'https://www.dailymotion.com/video/'],
] as const;
export type OpenwhydDraft = PlaylistDraft & { sourceLinks: (string | undefined)[]; limited: boolean };

export function openwhydPlaylistUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 1024) return;
  try {
    const url = new URL(value.trim());
    if (url.origin !== ORIGIN || url.username || url.password || !playlistPath.test(url.pathname)) return;
    return new URL(`${url.pathname.replace(/\/$/, '')}?format=json&limit=${LIMIT + 1}`, ORIGIN);
  } catch { /* Accept only public playlist URLs from the documented domain. */ }
}

function sourceLink(value: unknown) {
  if (typeof value !== 'string' || value.length > 640) return;
  if (value.startsWith('/yt/') && youtubeId.test(value.slice(4))) return `https://www.youtube.com/watch?v=${value.slice(4)}`;
  if (value.startsWith('/sc/')) {
    const path = value.slice(3).split('#', 1)[0];
    if (soundcloudPath.test(path)) return `https://soundcloud.com${path}`;
  }
  if (value.startsWith('/bc/')) {
    const path = value.slice(4).split('#', 1)[0].replace(/^(?:https?:)?\/\//, '');
    const page = `https://${path}`;
    if (bandcampPage.test(page)) return page;
  }
  for (const [pattern, prefix] of sourcePages) {
    const id = pattern.exec(value)?.[1];
    if (id) return prefix + id;
  }
}

export function isOpenwhydSourceLink(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 280) return false;
  return /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(value)
    || (value.startsWith('https://soundcloud.com') && soundcloudPath.test(value.slice('https://soundcloud.com'.length)))
    || bandcampPage.test(value)
    || /^https:\/\/vimeo\.com\/\d{1,16}$/.test(value)
    || /^https:\/\/www\.deezer\.com\/track\/\d{1,16}$/.test(value)
    || /^https:\/\/www\.dailymotion\.com\/video\/[a-z\d]{1,20}$/i.test(value);
}

export function readOpenwhydDraft(value: unknown, url: URL): OpenwhydDraft {
  if (!Array.isArray(value)) throw new Error('Ответ Openwhyd не удалось прочитать.');
  const number = playlistPath.exec(url.pathname)?.[1];
  const draft: OpenwhydDraft = { title: '', rows: [], sourceLinks: [], skipped: 0, limited: value.length > LIMIT };
  for (const item of value.slice(0, LIMIT)) {
    const post = object(item), playlist = object(post.pl);
    if (playlist.id != null && String(playlist.id) !== number) { draft.skipped++; continue; }
    if (!draft.title && playlist.id != null) draft.title = playlistTitle(playlist.name);
    const name = cleanTrackText(post.name).slice(0, 480);
    if (!name || /^\w+:\/\//u.test(name)) { draft.skipped++; continue; }
    const parts = /^(.*?) [–—-] (.+)$/u.exec(name);
    const ref = readRecordingReference({ title: parts?.[2] ?? name, artist: parts?.[1], album: '' });
    if (!ref) { draft.skipped++; continue; }
    draft.rows.push(ref);
    draft.sourceLinks.push(sourceLink(post.eId));
  }
  if (!draft.rows.length) throw new Error('В открытом плейлисте Openwhyd нет записей.');
  draft.title ||= `Openwhyd · ${number ?? ''}`.trim();
  return draft;
}

export function createOpenwhydImport(fetcher: PublicApiFetch) {
  const request = createPublicJsonRequest(fetcher, { spacing: 1000, limit: 1024 * 1024, missing404: true });
  return async (value: unknown, signal: AbortSignal) => {
    const url = openwhydPlaylistUrl(value);
    if (!url) throw new Error('Нужна публичная ссылка на плейлист Openwhyd.');
    let data: unknown;
    try { data = await request(url, signal); }
    catch { throw new Error('Не удалось загрузить плейлист Openwhyd. Проверьте сеть и ссылку.'); }
    if (data === null) throw new Error('Плейлист Openwhyd не найден или не опубликован.');
    return readOpenwhydDraft(data, url);
  };
}
