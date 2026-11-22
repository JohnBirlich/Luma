import { readLimitedBody, waitForRequestSpacing } from './metadata-service.js';

export type PublicApiFetch = (url: string, options: RequestInit) => Promise<Response>;

export class PublicHttpError extends Error {
  constructor(readonly status: number) { super(`Каталог сейчас недоступен (HTTP ${status}). Повторите попытку позже.`); }
}

/** For fixed API endpoints. One in-flight request per provider, with bounded errors and bodies. */
export function createPublicJsonRequest(fetcher: PublicApiFetch, { spacing, limit, missing404 = false }: {
  spacing: number; limit: number; missing404?: boolean;
}) {
  let busy = false;
  let next = 0;
  let blockedUntil = 0;
  return async (url: URL, signal: AbortSignal, options: Pick<RequestInit, 'headers' | 'method' | 'body'> = {}): Promise<unknown> => {
    signal.throwIfAborted();
    if (busy || blockedUntil > Date.now()) throw new Error('Каталог временно ограничил поиск. Попробуйте позже.');
    busy = true;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    try {
      const wait = next - Date.now();
      if (wait > 0) await waitForRequestSpacing(wait, deadline);
      deadline.throwIfAborted();
      next = Date.now() + spacing;
      const headers = new Headers(options.headers);
      headers.set('Accept', 'application/json');
      const response = await fetcher(url.href, {
        ...options, signal: deadline, headers, credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', cache: 'no-store',
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get('Retry-After');
          const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : NaN;
          blockedUntil = Date.now() + (Number.isFinite(delay) ? Math.max(spacing, delay) : response.status === 429 ? 60_000 : 5000);
        }
        if (missing404 && response.status === 404) return null;
        throw new PublicHttpError(response.status);
      }
      const body = await readLimitedBody(response, limit, deadline);
      deadline.throwIfAborted();
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } finally { busy = false; }
  };
}
