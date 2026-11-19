import { coverMime } from '../src/shared/artwork.js';
import { isVkPlaylist, vkPlaylistShareUrl } from '../src/shared/vk.js';
import type { VkCoverImage } from '../src/shared/vk.js';

const MAX_HTML = 256 * 1024;
export const MAX_VK_COVER = 1024 * 1024;
const CDN_HOST = /^(?:sun\d{1,4}(?:-\d{1,4})?|pp)\.(?:userapi\.com|vkuserphoto\.(?:ru|net)|vkuseraudio\.net)$/i;

function coverUrl(raw: string): string | undefined {
  if (raw.length > 2048) return;
  try {
    const url = new URL(raw.replace(/&(?:amp|#38|#x26);/gi, '&'));
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && CDN_HOST.test(url.hostname)) return url.href;
  } catch { /* Not a URL. */ }
}

/** Read the Open Graph image from a public playlist preview, not the widget's player or session data. */
export function readVkCoverMeta(html: string): string | undefined {
  const head = html.replace(/<!--[\s\S]*?(?:-->|$)|<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi, '')
    .split(/<\/head\s*>|<body\b/i, 1)[0];
  for (const tag of head.matchAll(/<meta\b(?:[^<>'"]|'[^']*'|"[^"]*")*>/gi)) {
    const fields = new Map<string, string>();
    for (const match of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
      const [, name, quoted, single, bare] = match;
      if (!fields.has(name.toLowerCase())) fields.set(name.toLowerCase(), quoted ?? single ?? bare);
    }
    const property = (fields.get('property') ?? fields.get('name'))?.toLowerCase();
    if (property === 'og:image' || property === 'og:image:secure_url') {
      const url = coverUrl(fields.get('content')?.trim() ?? '');
      if (url) return url;
    }
  }
}

async function readPreview(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let html = '';
  try {
    while (size < MAX_HTML) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, MAX_HTML - size);
      size += part.byteLength;
      html += decoder.decode(part, { stream: true });
      if (/<\/head\s*>|<body\b/i.test(html)) break;
    }
    return html + decoder.decode();
  } finally { void reader.cancel().catch(() => undefined); }
}

async function readCover(response: Response): Promise<VkCoverImage | null> {
  if (!response.body || Number(response.headers.get('Content-Length')) > MAX_VK_COVER) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VK_COVER) return null;
      parts.push(value);
    }
  } finally { void reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let start = 0;
  for (const part of parts) { bytes.set(part, start); start += part.length; }
  const mime = coverMime(bytes);
  return mime ? { mime, bytes } : null;
}

/** One public HTML request and, if present, one bounded image request. No cookies or redirects. */
export async function fetchVkCover(value: unknown, request: typeof fetch = fetch): Promise<VkCoverImage | null> {
  if (!isVkPlaylist(value)) return null;
  const options = { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(6500) } as const;
  try {
    const html = await request(vkPlaylistShareUrl(value), { ...options, headers: { Accept: 'text/html' } });
    if (!html.ok || !/^text\/html(?:\s*;|$)/i.test(html.headers.get('Content-Type') ?? '')) {
      void html.body?.cancel().catch(() => undefined);
      return null;
    }
    const preview = readVkCoverMeta(await readPreview(html));
    if (!preview) return null;
    const image = await request(preview, { ...options, headers: { Accept: 'image/webp,image/png,image/jpeg' } });
    if (!image.ok || !/^image\/(?:webp|png|jpe?g)(?:\s*;|$)/i.test(image.headers.get('Content-Type') ?? '')) {
      void image.body?.cancel().catch(() => undefined);
      return null;
    }
    return await readCover(image);
  } catch { return null; }
}
