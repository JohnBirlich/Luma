import { AUDIUS_API, AUDIUS_APP_NAME, CCMIXTER_ORIGIN, audiusId, audiusMediaUrl, catalogLicense, catalogObject as object, readOnlineTrack } from './online.js';
import type { OnlineTrack } from './online.js';

export type PublicCatalog = 'audius' | 'ccmixter';

export function publicCatalogUrl(query: string, source: PublicCatalog) {
  const q = query.trim().slice(0, 140);
  const url = source === 'audius' ? new URL('search', AUDIUS_API) : new URL('/api/query', CCMIXTER_ORIGIN);
  url.search = new URLSearchParams(source === 'audius'
    ? { query: q, limit: '12', app_name: AUDIUS_APP_NAME }
    : { s: q, search_type: 'all', reqtags: 'remix', f: 'json', limit: '12' }).toString();
  return url;
}

function ccMixterTrack(data: unknown): OnlineTrack | undefined {
  const row = object(data), extra = object(row.upload_extra);
  const license = catalogLicense(row.license_url);
  if (!Number.isSafeInteger(row.upload_id) || typeof row.user_name !== 'string' || !/^[\w-]{1,80}$/.test(row.user_name)
    || extra.nsfw || !license || !Array.isArray(row.files)) return;
  // ccHost returns stems and alternate formats alongside a remix. Use only the primary complete MP3.
  const file = row.files.slice(0, 24).map(object).find((file) => file.file_order === 0 && file.file_upload === row.upload_id
    && file.file_is_remote === 0 && object(file.file_format_info)['format-name'] === 'audio-mp3-mp3');
  if (!file) return;
  const playtime = object(file.file_format_info).ps;
  const parts = typeof playtime === 'string' ? /^(\d{1,3}):(\d{2})$/.exec(playtime) : null;
  return readOnlineTrack({ title: row.upload_name, artist: row.user_real_name || row.user_name,
    duration: parts ? 60 * Number(parts[1]) + Number(parts[2]) : 0,
    genres: typeof extra.usertags === 'string' ? extra.usertags.split(',', 10) : undefined,
    audioUrl: file.download_url,
    online: { source: 'ccmixter', page: `${CCMIXTER_ORIGIN}/files/${row.user_name}/${String(row.upload_id)}`, licenseUrl: license.url },
  });
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

export function publicCatalogTracks(data: unknown, source: PublicCatalog) {
  const rows = source === 'audius' ? object(data).data : data;
  if (!Array.isArray(rows)) throw new Error('Каталог вернул неожиданный ответ.');
  const tracks = new Map<string, OnlineTrack>();
  const decode = source === 'audius' ? audiusTrack : ccMixterTrack;
  for (const row of rows.slice(0, 12)) {
    const track = decode(row);
    if (track && !tracks.has(track.id)) tracks.set(track.id, track);
  }
  return [...tracks.values()];
}
