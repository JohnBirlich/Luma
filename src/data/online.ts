import { decodeOpenverse, onlineSearchUrl, OPENVERSE_API, openverseLinkId } from '../shared/online';
import type { OnlineFilter, OnlineTrack } from '../shared/online';

const MAX_JSON = 512 * 1024;

async function getJson(url: URL, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(11_000)]), redirect: 'error', credentials: 'omit',
    referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
  if (response.status === 429) throw new Error('Openverse временно ограничил поиск. Попробуйте чуть позже.');
  if (response.status === 404) throw new Error('Запись не найдена. Возможно, её убрали из каталога.');
  if (!response.ok || !response.body) throw new Error('Каталог сейчас недоступен.');
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

export async function findOnlineTracks(query: string, source: OnlineFilter, signal: AbortSignal): Promise<OnlineTrack[]> {
  const data = await getJson(onlineSearchUrl(query, source), signal) as { results?: unknown[] } | null;
  if (!Array.isArray(data?.results)) throw new Error('Каталог вернул неожиданный ответ.');
  const tracks = new Map<string, OnlineTrack>();
  for (const row of data.results) {
    const track = decodeOpenverse(row);
    if (track && (source === 'all' || track.online.source === source)) tracks.set(track.id, track);
  }
  return [...tracks.values()];
}

export async function importOnlineTrack(link: string, signal: AbortSignal): Promise<OnlineTrack> {
  const id = openverseLinkId(link);
  if (!id) throw new Error('Нужна ссылка на аудиозапись Openverse.');
  const data = await getJson(new URL(`${id}/?format=json`, OPENVERSE_API), signal);
  const track = decodeOpenverse(data);
  if (!track || track.id !== `ov-${id}`) throw new Error('Этот источник или формат не поддерживается.');
  return track;
}
