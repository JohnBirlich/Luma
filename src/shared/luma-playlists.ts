import { sessionCatalogId } from './online.js';
import { STATION_IDS } from './radio.js';
import { cleanTrackText } from './russian.js';

export const MAX_PLAYLISTS = 36;
export const MAX_PLAYLIST_TRACKS = 100;
export interface LumaPlaylist { id: string; title: string; trackIds: string[] }

export const playlistTitle = (value: unknown) => typeof value === 'string' ? cleanTrackText(value).slice(0, 64) : '';
export function playlistTrackIds(value: readonly unknown[]) {
  return [...new Set(value.slice(0, MAX_PLAYLIST_TRACKS).filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && !STATION_IDS.has(id) && !sessionCatalogId(id)))];
}
export function readLumaPlaylists(value: unknown): LumaPlaylist[] {
  if (!Array.isArray(value)) return [];
  const rows = new Map<string, LumaPlaylist>();
  for (const row of value.slice(0, MAX_PLAYLISTS)) {
    const id: unknown = row?.id;
    const title = playlistTitle(row?.title);
    if (typeof id !== 'string' || !/^list-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || !title || !Array.isArray(row?.trackIds)) continue;
    const trackIds = playlistTrackIds(row.trackIds);
    if (trackIds.length && !rows.has(id)) rows.set(id, { id, title, trackIds });
  }
  return [...rows.values()];
}
