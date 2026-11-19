import { ACOUSTID_LOOKUP_URL, hasTitleMatch, isFingerprint, ITUNES_SEARCH_URL, metadataQueries, musicStorefront, readAcoustidCandidates, readAppleCandidates } from './recognition.js';
import type { MetadataCandidate } from './recognition.js';
type MetadataFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Bound both claimed and actual body size (including responses with no Content-Length). */
export async function readLimitedBody(response: Response, limit: number, signal: AbortSignal) {
  if (!response.body) throw new Error('Пустой ответ.');
  const reader = response.body.getReader();
  try {
    if (Number(response.headers.get('Content-Length')) > limit) throw new Error('Слишком большой ответ.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('Слишком большой ответ.');
      chunks.push(value);
    }
    const output = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return output.buffer;
  } finally { void reader.cancel().catch(() => {}); }
}

async function jsonRequest(fetcher: MetadataFetch, url: string, signal: AbortSignal, post?: URLSearchParams) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(8500)]);
  const response = await fetcher(url, {
    ...(post && { method: 'POST', body: post }), signal: deadline,
    headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error(response.status === 429 ? 'Каталог временно ограничил поиск. Попробуйте позже.' : 'Каталог сейчас недоступен.');
  }
  const body = await readLimitedBody(response, 384 * 1024, deadline);
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export function createMetadataService(fetcher: MetadataFetch = fetch, appleSpacing = 3200) {
  let appleAt = 0;
  let appleBusy = false;
  let acoustidAt = 0;
  return {
    async search(value: unknown, locale: unknown, signal: AbortSignal): Promise<MetadataCandidate[]> {
      const terms = typeof value === 'string' && value.length <= 256 ? metadataQueries(value) : [];
      if (!terms.length) return [];
      if (appleBusy) throw new Error('Один поиск уже выполняется.');
      appleBusy = true;
      const country = musicStorefront(locale);
      const candidates: MetadataCandidate[] = [];
      try {
        for (const term of terms) {
          await wait(Math.max(0, appleAt - Date.now()), signal);
          appleAt = Date.now() + appleSpacing;
          const target = new URL(ITUNES_SEARCH_URL);
          target.search = new URLSearchParams({ term, country, media: 'music', entity: 'song', limit: '18' }).toString();
          candidates.push(...readAppleCandidates(await jsonRequest(fetcher, target.href, signal), country));
          if (hasTitleMatch(terms[0], candidates)) break;
        }
        return candidates;
      } finally { appleBusy = false; }
    },
    async identify(value: unknown, client: string, signal: AbortSignal) {
      if (!isFingerprint(value)) throw new Error('Не удалось получить отпечаток.');
      if (!validAcoustidClient(client)) throw new Error('AcoustID не настроен.');
      if (Date.now() < acoustidAt) throw new Error('Подождите перед повторным распознаванием.');
      acoustidAt = Date.now() + 1200;
      const data = new URLSearchParams({ client, fingerprint: value.compressed, duration: String(value.duration), meta: 'recordings', format: 'json' });
      return readAcoustidCandidates(await jsonRequest(fetcher, ACOUSTID_LOOKUP_URL, signal, data));
    },
  };
}

export const validAcoustidClient = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(value);
