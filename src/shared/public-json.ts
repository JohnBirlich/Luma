import { readLimitedBody, waitForRequestSpacing } from './metadata-service.js';

export type PublicApiFetch = (url: string, options: RequestInit) => Promise<Response>;

/** For fixed, public API endpoints. One in-flight request per provider, with bounded errors and bodies. */
export function createPublicJsonRequest(fetcher: PublicApiFetch, { spacing, limit, missing404 = false }: {
  spacing: number; limit: number; missing404?: boolean;
}) {
  let busy = false;
  let next = 0;
  let blockedUntil = 0;
  return async (url: URL, signal: AbortSignal): Promise<unknown> => {
    signal.throwIfAborted();
    if (busy || blockedUntil > Date.now()) throw new Error('Каталог временно ограничил поиск. Попробуйте позже.');
    busy = true;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    try {
      const wait = next - Date.now();
      if (wait > 0) await waitForRequestSpacing(wait, deadline);
      deadline.throwIfAborted();
      next = Date.now() + spacing;
      const response = await fetcher(url.href, {
        signal: deadline, headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error',
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
        throw new Error(`Каталог сейчас недоступен (HTTP ${response.status}). Повторите попытку позже.`);
      }
      const body = await readLimitedBody(response, limit, deadline);
      deadline.throwIfAborted();
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } finally { busy = false; }
  };
}
