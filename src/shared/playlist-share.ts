import { MAX_PLAYLIST_TRACKS, playlistTitle } from './luma-playlists.js';
import { catalogObject, sessionCatalogId } from './online.js';
import type { Track } from './media.js';
import { readRecordingReference } from './track-list.js';
import type { RecordingReference } from './track-list.js';
import { readIsrc } from './recording-match.js';

export interface SharedRecording extends RecordingReference { duration?: number; isrc?: string }
export const MAX_PLAYLIST_SHARE_BYTES = 256 * 1024;

function shareRow(value: unknown): SharedRecording | undefined {
  const ref = readRecordingReference(value);
  if (!ref) return;
  const { duration, isrc } = catalogObject(value);
  const rounded = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 && duration <= 86400 ? Math.round(duration * 10) / 10 : 0;
  const code = readIsrc(isrc);
  return { ...ref, ...(rounded && { duration: rounded }), ...(code && { isrc: code }) };
}

export function readSharedPlaylist(value: unknown) {
  const row = catalogObject(value);
  const title = playlistTitle(row.title);
  if (row.format !== 'luma-playlist' || row.version !== 1 || !title || !Array.isArray(row.tracks) || !row.tracks.length || row.tracks.length > MAX_PLAYLIST_TRACKS) return;
  const tracks: SharedRecording[] = [];
  for (const value of row.tracks) {
    const track = shareRow(value);
    if (!track) return;
    tracks.push(track);
  }
  return { format: 'luma-playlist', version: 1, title, tracks } as const;
}

export type SharedPlaylist = NonNullable<ReturnType<typeof readSharedPlaylist>>;

export function buildSharedPlaylist(title: string, tracks: readonly Track[]) {
  return readSharedPlaylist({ format: 'luma-playlist', version: 1, title, tracks: tracks.filter((track) => !track.demo && track.online?.source !== 'broadcast' && !sessionCatalogId(track.id)) });
}
