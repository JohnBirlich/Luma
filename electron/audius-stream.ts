import { AUDIUS_API, AUDIUS_APP_NAME, AUDIUS_CONTENT_ORIGIN, audiusId, catalogObject } from '../src/shared/online.js';
import { readLimitedBody } from '../src/shared/metadata-service.js';

type AudioFetch = (url: string, init?: RequestInit) => Promise<Response>;
const privateRequest = { credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' } as const;

function contentUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 4096) return;
  try {
    const url = new URL(value);
    if (url.origin === AUDIUS_CONTENT_ORIGIN && !url.username && !url.password && !url.hash
      && /^\/tracks\/cidstream\/[a-zA-Z0-9]{32,128}$/.test(url.pathname) && url.searchParams.has('signature')) return url.href;
  } catch { /* Invalid provider response. */ }
}

/** Stream the official public MP3 on demand. No blob download, credentials, or disk caching. */
export async function streamAudius(fetcher: AudioFetch, id: string, request: Request, headers: Headers) {
  const fail = (status: number) => new Response(null, { status, headers });
  if (!audiusId(id)) return fail(404);
  const range = request.headers.get('Range');
  if (range && (range.length > 40 || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))) return fail(416);
  const api = new URL(`${id}/stream`, AUDIUS_API);
  api.search = new URLSearchParams({ app_name: AUDIUS_APP_NAME, no_redirect: 'true' }).toString();
  const connect = new AbortController();
  const timer = setTimeout(() => connect.abort(), 12_000);
  const signal = AbortSignal.any([request.signal, connect.signal]);
  try {
    const resolved = await fetcher(api.href, { ...privateRequest, signal, headers: { Accept: 'application/json' } });
    if (!resolved.ok) {
      void resolved.body?.cancel().catch(() => {});
      return fail(resolved.status === 404 ? 404 : 502);
    }
    const data: unknown = JSON.parse(new TextDecoder().decode(await readLimitedBody(resolved, 16 * 1024, signal)));
    const url = contentUrl(catalogObject(data).data);
    if (!url) return fail(502);
    const upstream = await fetcher(url, { ...privateRequest, signal, method: request.method,
      headers: { Accept: 'audio/mpeg', ...(range ? { Range: range } : {}) } });
    const mime = upstream.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    const contentRange = upstream.headers.get('Content-Range');
    if (upstream.status === 416 && contentRange && /^bytes \*\/\d+$/.test(contentRange)) {
      headers.set('Content-Range', contentRange);
      void upstream.body?.cancel().catch(() => {});
      return fail(416);
    }
    if (![200, 206].includes(upstream.status) || !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(mime ?? '')
      || (upstream.status === 206 && !/^bytes \d+-\d+\/\d+$/.test(contentRange ?? ''))) {
      void upstream.body?.cancel().catch(() => {});
      return fail(502);
    }
    headers.set('Content-Type', 'audio/mpeg');
    if (contentRange) headers.set('Content-Range', contentRange);
    if (upstream.headers.get('Accept-Ranges') === 'bytes' || upstream.status === 206) headers.set('Accept-Ranges', 'bytes');
    const length = upstream.headers.get('Content-Length');
    if (length && /^\d+$/.test(length) && !upstream.headers.has('Content-Encoding')) headers.set('Content-Length', length);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch { return fail(502); }
  finally { clearTimeout(timer); }
}
