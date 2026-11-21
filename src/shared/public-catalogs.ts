import { AUDIUS_API, AUDIUS_APP_NAME, audiusId, audiusMediaUrl, catalogObject as object, readOnlineTrack } from './online.js';
import type { OnlineTrack } from './online.js';

export function audiusSearchUrl(query: string) {
  const url = new URL('search', AUDIUS_API);
  url.search = new URLSearchParams({ query: query.trim().slice(0, 140), limit: '12', app_name: AUDIUS_APP_NAME }).toString();
  return url;
}

function audiusTrack(data: unknown): OnlineTrack | undefined {
  const row = object(data), user = object(row.user);
  if (!audiusId(row.id) || row.is_streamable !== true || row.is_available !== true || object(row.access).stream !== true
    || row.is_stream_gated !== false || row.stream_conditions || row.is_unlisted || row.is_delete || row.is_scheduled_release || row.stem_of
    || row.parental_warning_type || (Array.isArray(row.allowed_api_keys) ? row.allowed_api_keys.length > 0 : row.allowed_api_keys != null)
    || typeof row.permalink !== 'string' || !row.permalink.startsWith('/')) return;
  // Ignore the distributed-node URLs and signed stream values embedded in search results.
  return readOnlineTrack({ id: `audius-${row.id}`, title: row.title, artist: user.name || user.handle, duration: row.duration,
    genres: [row.genre], audioUrl: audiusMediaUrl(row.id), online: { source: 'audius', page: `https://audius.co${row.permalink}` },
  });
}

export function audiusTracks(data: unknown) {
  const rows = object(data).data;
  if (!Array.isArray(rows)) throw new Error('Каталог вернул неожиданный ответ.');
  const tracks = new Map<string, OnlineTrack>();
  for (const row of rows.slice(0, 12)) {
    const track = audiusTrack(row);
    if (track && !tracks.has(track.id)) tracks.set(track.id, track);
  }
  return [...tracks.values()];
}
