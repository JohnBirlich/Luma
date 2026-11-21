import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { ONLINE_ORIGINS } from '../src/shared/online.js';
import { RADIO_ORIGINS } from '../src/shared/radio.js';
import { audioMime } from '../src/shared/media.js';
import { APP_ORIGIN, type DesktopLibrary } from './library.js';
import type { StreamCache } from './stream-cache.js';
import { streamAudius } from './audius-stream.js';
import type { AudiusFetch } from './audius-stream.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
};
const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: ${ONLINE_ORIGINS.images} ${RADIO_ORIGINS.images}; connect-src 'self' ${ONLINE_ORIGINS.connect}; media-src 'self' blob: ${ONLINE_ORIGINS.media} ${RADIO_ORIGINS.media}; worker-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;

export function parseByteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  if (first === null) return last ? { start: Math.max(0, size - last), end: size - 1 } : null;
  if (first >= size || (last !== null && last < first)) return null;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

export function staticPath(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  if (!decoded.startsWith('/') || /[\\:\0]/.test(decoded)) return undefined;
  const path = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  const within = relative(root, path);
  if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return undefined;
  return path;
}

async function streamFile(path: string, request: Request, headers: Headers) {
  const metadata = await stat(path).catch(() => null);
  if (!metadata?.isFile()) return new Response(null, { status: 404, headers });
  const { size } = metadata;
  headers.set('Content-Type', headers.get('Content-Type') ?? audioMime(path) ?? CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  const rawRange = request.headers.get('Range');
  const range = rawRange && parseByteRange(rawRange, size);
  if (rawRange && !range) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  headers.set('Content-Length', String(range ? range.end - range.start + 1 : size));
  const body = request.method === 'HEAD' || !size
    ? null
    : Readable.toWeb(createReadStream(path, range || undefined)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}

export function createProtocolHandler(root: string, library: DesktopLibrary, devOrigin?: string, cache?: StreamCache, audiusFetch?: AudiusFetch) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.protocol !== 'luma:' || url.hostname !== 'app' || url.port || url.username || url.password) return new Response(null, { status: 404 });
    const origin = request.headers.get('Origin');
    if (origin && origin !== APP_ORIGIN && origin !== devOrigin) return new Response(null, { status: 403 });
    // Allow WASM compilation only in the bundled fingerprint worker, never in the app page.
    const fingerprintWorker = /^\/assets\/fingerprint\.worker-[\w-]+\.js$/.test(url.pathname);
    const headers = new Headers({
      'Content-Security-Policy': fingerprintWorker
        ? "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; base-uri 'none'"
        : CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    if (origin && origin === devOrigin) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Range');
      headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
      headers.set('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS' && origin && origin === devOrigin) return new Response(null, { status: 204, headers });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers });
    const audius = /^\/media\/audius\/([A-Za-z0-9]{3,16})$/.exec(url.pathname);
    if (audius && audiusFetch && !url.search) return streamAudius(audiusFetch, audius[1], request, headers);
    const cacheMatch = /^\/media\/cache\/([a-f0-9]{64})$/.exec(url.pathname);
    if (cacheMatch) {
      const path = cache?.mediaPath(cacheMatch[1]);
      return path ? streamFile(path, request, headers) : new Response(null, { status: 404, headers });
    }
    const match = /^\/media\/(audio|cover)\/([a-f\d-]+)$/i.exec(url.pathname);
    const path = match
      ? library.mediaPath(match[2], match[1] as 'audio' | 'cover')
      : staticPath(root, url.pathname);
    if (!match && path && extname(path) === '.webm') headers.set('Content-Type', 'video/webm');
    return path ? streamFile(path, request, headers) : new Response(null, { status: 404, headers });
  };
}
