import { coverMime } from '../src/shared/artwork.js';
import type { CoverMime } from '../src/shared/artwork.js';
import { vkArtworkUrl } from '../src/shared/vk-site.js';

// A 1280px VK cover is often 400–900 KiB; the old half-megabyte ceiling silently
// fell back to the small rendition the player happened to draw.
export const MAX_VK_ARTWORK_BYTES = 1024 * 1024;
export interface VkArtwork { bytes: Uint8Array<ArrayBuffer>; mime: CoverMime }

/** One size-limited image from the current player's public artwork, with no cookies or referrer. */
export async function fetchVkArtwork(fetcher: (url: string, init: RequestInit) => Promise<Response>, candidate: string, signal: AbortSignal): Promise<VkArtwork | undefined> {
  const url = vkArtworkUrl(candidate);
  if (!url || signal.aborted) return;
  try {
    const response = await fetcher(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'image/webp,image/png,image/jpeg' } });
    const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    if (!response.ok || response.redirected || Number(response.headers.get('Content-Length')) > MAX_VK_ARTWORK_BYTES
      || (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp')) {
      void response.body?.cancel().catch(() => {});
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) return;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_VK_ARTWORK_BYTES) return;
        chunks.push(value);
      }
      if (signal.aborted || !size) return;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      if (coverMime(bytes) === mime) return { bytes, mime };
    } finally { void reader.cancel().catch(() => {}); }
  } catch { /* Missing, private or invalid artwork keeps the branded fallback. */ }
}

/**
 * A saved track page carries the same public cover in its link preview. Only a VK
 * artwork host is accepted, so the value is the same kind of address the player
 * would have shown — never an arbitrary URL from the page.
 */
export function readVkPageCover(html: string) {
  if (html.length > 512 * 1024) return;
  const tag = /<meta\b[^>]*>/gi;
  for (const [meta] of html.matchAll(tag)) {
    if (!/(?:property|name)\s*=\s*["\']og:image["\']/i.test(meta)) continue;
    const content = /content\s*=\s*["\']([^"\']{8,2048})["\']/i.exec(meta)?.[1];
    const url = content && vkArtworkUrl(content.replaceAll('&amp;', '&'));
    if (url) return url;
  }
}
