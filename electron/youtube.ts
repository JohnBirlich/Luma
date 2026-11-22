import { APP_USER_MODEL_ID } from '../src/shared/app-info.js';
import { isYouTubeEmbedUrl, readYouTubeId, YOUTUBE_EMBED_ORIGIN, YOUTUBE_WATCH_ORIGIN, youTubeWatchUrl } from '../src/shared/youtube.js';

// YouTube requires a stable app identity for native embeds where Chromium has no HTTP(S) parent referrer.
export const YOUTUBE_APP_REFERRER = `https://${APP_USER_MODEL_ID.toLowerCase()}/`;

export function youTubeAppHeaders(details: {
  url: string;
  method: string;
  webContentsId?: number;
  initiatorOrigin?: string;
  resourceType: string;
  requestHeaders: Record<string, string>;
}, ownerId: number, appOrigin: string) {
  if (details.webContentsId !== ownerId || details.initiatorOrigin !== appOrigin || details.method !== 'GET'
    || details.resourceType !== 'subFrame' || !isYouTubeEmbedUrl(details.url)) return;
  const headers = Object.fromEntries(Object.entries(details.requestHeaders).filter(([name]) => name.toLowerCase() !== 'referer'));
  return { ...headers, Referer: YOUTUBE_APP_REFERRER };
}

/** Route the embedded player's official video/channel links to the system browser, not a privileged window. */
export function youTubePopupUrl(value: string, referrer: string) {
  try {
    if (new URL(referrer).origin !== YOUTUBE_EMBED_ORIGIN) return;
    const url = new URL(value);
    if (url.username || url.password || url.port || ![YOUTUBE_WATCH_ORIGIN, YOUTUBE_EMBED_ORIGIN].includes(url.origin)) return;
    if (url.pathname === '/watch') {
      const id = readYouTubeId(value);
      return id ? youTubeWatchUrl(id) : undefined;
    }
    if (/^\/channel\/UC[\w-]{22}\/?$/.test(url.pathname) || /^\/@[\w.-]{1,80}\/?$/.test(url.pathname)) {
      return YOUTUBE_WATCH_ORIGIN + url.pathname;
    }
  } catch { /* Not a trusted YouTube destination. */ }
}
