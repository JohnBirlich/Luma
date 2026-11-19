import type { Track } from './media.js';

export const COVER_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
export const MAX_COVER_FILE = 20 * 1024 * 1024;

export interface CoverTarget {
  key: string;
  title: string;
  kind: 'track' | 'playlist';
  originalUrl?: string;
}

export const trackCoverKey = (id: string) => `track:${id}`;
export const playlistCoverKey = (id: string) => `vk:${id}`;

export type CoverMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function coverMime(bytes: Uint8Array): CoverMime | undefined {
  const matches = (index: number, signature: number[]) => signature.every((value, offset) => value === bytes[index + offset]);
  if (matches(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (matches(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (matches(0, [0x52, 0x49, 0x46, 0x46]) && matches(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return undefined;
}

export function embeddedArtworkMime(bytes: Uint8Array): CoverMime | 'image/gif' | 'image/avif' | undefined {
  const mime = coverMime(bytes);
  if (mime) return mime;
  const signature = String.fromCharCode(...bytes.subarray(0, 12));
  if (/^GIF8[79]a/.test(signature)) return 'image/gif';
  if (/^.{4}ftypavi[fs]$/s.test(signature)) return 'image/avif';
  return undefined;
}

export function withCover(track: Track, artworkUrl?: string): Track {
  return artworkUrl ? { ...track, artworkUrl, backdropUrl: undefined, color: undefined } : track;
}
