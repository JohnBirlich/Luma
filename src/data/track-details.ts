import { useRef, useState } from 'react';
import type { Track } from '../shared/media';
import { cleanTrackText } from '../shared/russian';

export type TrackDetails = Pick<Track, 'title' | 'artist' | 'album'>;
export const TRACK_DETAIL_LIMIT = 256;
const STORAGE_KEY = 'luma-track-details:v1';

function parseDetails(input: unknown): TrackDetails | undefined {
  if (!input || typeof input !== 'object') return;
  const { title, artist, album } = input as Partial<TrackDetails>;
  if ([title, artist, album].some((value) => typeof value !== 'string' || value.length > TRACK_DETAIL_LIMIT)) return;
  const name = cleanTrackText(title);
  return name ? {
    title: name,
    artist: cleanTrackText(artist) || 'Неизвестный исполнитель',
    album: cleanTrackText(album) || 'Без альбома',
  } : undefined;
}

function readDetails(): Map<string, TrackDetails> {
  const result = new Map<string, TrackDetails>();
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return result;
    for (const [id, value] of Object.entries(stored)) {
      const details = parseDetails(value);
      if (details) result.set(id, details);
    }
  } catch { /* A restrictive or damaged profile does not block playback. */ }
  return result;
}

export function useTrackDetails() {
  const [details, setDetails] = useState(readDetails);
  const current = useRef(details);
  function update(id: string, value?: TrackDetails): boolean {
    const updated = new Map(current.current);
    if (value) {
      const valid = parseDetails(value);
      if (!valid) return false;
      updated.set(id, valid);
    } else if (!updated.delete(id)) return true;
    current.current = updated;
    setDetails(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(updated)));
      return true;
    } catch { return false; }
  }
  return { details, update };
}
