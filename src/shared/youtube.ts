import type { UiLanguage } from './ui-language.js';

export const YOUTUBE_WATCH_ORIGIN = 'https://www.youtube.com';
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
export const YOUTUBE_EMBED_SOURCE = `${YOUTUBE_EMBED_ORIGIN}/embed/`;
export const YOUTUBE_FRAME_NAME = 'luma-youtube-player';
export const YOUTUBE_TERMS = `${YOUTUBE_WATCH_ORIGIN}/t/terms`;
export const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

export const isYouTubeId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{11}$/.test(value);

function httpsUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\p{Cc}]/u.test(value) || !/^https:\/\//i.test(value.trim())) return;
  try {
    const url = new URL(value.trim());
    if (!url.username && !url.password && !url.port) return url;
  } catch { /* Not a URL. */ }
}

/** Accept only single-video links. Strip timestamps, playlist context and tracking on handoff. */
export function readYouTubeId(value: unknown) {
  const url = httpsUrl(value);
  if (!url) return;
  const short = url.hostname === 'youtu.be';
  const web = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname);
  let id: string | undefined;
  if (short) id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  else if (web && url.pathname === '/watch') {
    const ids = url.searchParams.getAll('v');
    if (ids.length === 1) id = ids[0];
  } else if (web || url.origin === YOUTUBE_EMBED_ORIGIN) id = /^\/embed\/([\w-]{11})$/.exec(url.pathname)?.[1];
  return isYouTubeId(id) ? id : undefined;
}

export const youTubeWatchUrl = (id: string) => `${YOUTUBE_WATCH_ORIGIN}/watch?${new URLSearchParams({ v: id })}`;

export function youTubeEmbedUrl(id: string, language: UiLanguage) {
  if (isYouTubeId(id)) return `${YOUTUBE_EMBED_SOURCE}${id}?hl=${language}`;
}

export function isYouTubeEmbedUrl(value: unknown) {
  const url = httpsUrl(value);
  return url?.origin === YOUTUBE_EMBED_ORIGIN && /^\/embed\/[\w-]{11}$/.test(url.pathname);
}
