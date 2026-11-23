import { catalogRetryDelay, decodeOpenverse, onlineSearchUrl, OPENVERSE_API, openverseLinkId } from '../shared/online';
import type { DesktopCatalogSource, OnlineFilter, OnlineTrack } from '../shared/online';

import { CatalogError } from '../shared/catalog-reply';
import type { CatalogReply } from '../shared/catalog-reply';
import { createPhishSearch } from '../shared/phishin';

const findPhishTracks = createPhishSearch();
const MAX_JSON = 512 * 1024;

export class CatalogRateLimit extends Error {
  constructor(readonly retryMs: number) { super('Openverse временно ограничил поиск. Попробуйте чуть позже.'); }
}

async function getJson(url: URL, signal: AbortSignal): Promise<unknown> {
  const options = { signal: AbortSignal.any([signal, AbortSignal.timeout(11_000)]), redirect: 'error', credentials: 'omit',
    referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } } as const;
  let response = await fetch(url, options);
  if ([500, 502, 503, 504].includes(response.status)) {
    // Retry a temporary upstream error once, within the original deadline. Never retry a rate limit.
    void response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 350));
    options.signal.throwIfAborted();
    response = await fetch(url, options);
  }
  if (response.status === 429) {
    void response.body?.cancel().catch(() => {});
    throw new CatalogRateLimit(catalogRetryDelay(response.headers.get('Retry-After')));
  }
  if (response.status === 404) throw new Error('Запись не найдена. Возможно, её убрали из каталога.');
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Каталог сейчас недоступен (HTTP ${response.status}). Повторите попытку позже.`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes > MAX_JSON) throw new Error('Ответ каталога слишком большой.');
      text += decoder.decode(value, { stream: true });
    }
  } finally { void reader.cancel().catch(() => {}); }
}

let requestId = 0;
const isDesktopSource = (source: OnlineFilter): source is DesktopCatalogSource | 'jamendo_direct' =>
  source === 'audius' || source === 'netlabels' || source === 'southern_city' || source === 'jamendo_direct';

async function communityTracks(query: string, source: DesktopCatalogSource | 'jamendo_direct', signal: AbortSignal): Promise<CatalogReply> {
  if (!window.luma) throw new CatalogError('unavailable');
  signal.throwIfAborted();
  const id = ++requestId;
  const cancel = () => { void window.luma?.cancelCatalogSearch(id).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const text = query.trim().slice(0, 140);
    return source === 'jamendo_direct' ? await window.luma.musicServices.searchJamendo(id, text) : await window.luma.searchCommunity(id, text, source);
  } catch {
    signal.throwIfAborted();
    return { tracks: [], issue: 'network' };
  } finally { signal.removeEventListener('abort', cancel); }
}

export async function findOnlineTracks(query: string, source: OnlineFilter, signal: AbortSignal): Promise<OnlineTrack[]> {
  if (source === 'phishin') return findPhishTracks(query, signal);
  const data = await getJson(onlineSearchUrl(query, source), signal) as { results?: unknown[] } | null;
  if (!Array.isArray(data?.results)) throw new Error('Каталог вернул неожиданный ответ.');
  const tracks = new Map<string, OnlineTrack>();
  for (const row of data.results) {
    const track = decodeOpenverse(row);
    if (track && (source === 'all' || track.online.source === source)) tracks.set(track.id, track);
  }
  return [...tracks.values()];
}

export async function findCatalog(query: string, source: OnlineFilter, signal: AbortSignal) {
  return isDesktopSource(source) ? communityTracks(query, source, signal) : { tracks: await findOnlineTracks(query, source, signal) };
}

export async function importOnlineTrack(link: string, signal: AbortSignal): Promise<OnlineTrack> {
  const id = openverseLinkId(link);
  if (!id) throw new Error('Нужна ссылка на аудиозапись Openverse.');
  const data = await getJson(new URL(`${id}/?format=json`, OPENVERSE_API), signal);
  const track = decodeOpenverse(data);
  if (!track || track.id !== `ov-${id}`) throw new Error('Этот источник или формат не поддерживается.');
  return track;
}
