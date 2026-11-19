import type { AppInfo } from './app-info.js';
import type { DiagnosticsBridge } from './diagnostics.js';
import { embeddedArtworkMime, MAX_COVER_FILE } from './artwork.js';
import { cleanTrackText, readTrackTag } from './russian.js';
import type { VkCoverImage, VkPlaylist } from './vk.js';

export const AUDIO_MIMES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
} as const;

export const AUDIO_EXTENSIONS = Object.keys(AUDIO_MIMES);
export const AUDIO_ACCEPT = AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(',');

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  audioUrl: string;
  artworkUrl?: string;
  backdropUrl?: string;
  color?: string;
  demo?: boolean;
}

export interface ImportResult {
  tracks: Track[];
  added: string[];
  duplicates: number;
  failures: { name: string; message: string }[];
  temporary?: boolean;
  cancelled?: boolean;
}

export interface DesktopBridge {
  getAppInfo(): Promise<AppInfo>;
  openReleases(): Promise<void>;
  getTracks(): Promise<Track[]>;
  chooseTracks(): Promise<ImportResult>;
  importDroppedFiles(files: File[]): Promise<ImportResult>;
  removeTrack(id: string): Promise<Track[]>;
  openVkWebsite(): Promise<void>;
  openVkLink(url: string): Promise<void>;
  getVkCover(playlist: VkPlaylist): Promise<VkCoverImage | null>;
  diagnostics: DiagnosticsBridge;
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximized(callback: (maximized: boolean) => void): () => void;
  };
}

export function audioMime(name: string): string | undefined {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return name.includes('.') && Object.hasOwn(AUDIO_MIMES, extension)
    ? AUDIO_MIMES[extension as keyof typeof AUDIO_MIMES]
    : undefined;
}

export function emptyImport(tracks: Track[]): ImportResult {
  return { tracks, added: [], duplicates: 0, failures: [] };
}

export function trackInfo(
  filename: string,
  tags?: { title?: string; artist?: string; albumartist?: string; album?: string },
  duration?: number,
): Pick<Track, 'title' | 'artist' | 'album' | 'duration'> {
  return {
    title: readTrackTag(tags?.title) || cleanTrackText(filename.replace(/\.[^.]+$/, '')) || cleanTrackText(filename) || 'Без названия',
    artist: readTrackTag(tags?.artist) || readTrackTag(tags?.albumartist) || 'Неизвестный исполнитель',
    album: readTrackTag(tags?.album) || 'Без альбома',
    duration: duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : 0,
  };
}

const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
} as const;

/** A tag's declared MIME is unreliable. Use a supported image by signature, preferably the front cover. */
export function usableArtwork<T extends { format: string; data: Uint8Array; type?: string }>(pictures?: T[]) {
  const candidates = pictures?.flatMap((image) => {
    if (image.data.length > MAX_COVER_FILE) return [];
    const mime = embeddedArtworkMime(image.data);
    return mime ? [{ image, mime, extension: IMAGE_EXTENSIONS[mime] }] : [];
  });
  return candidates?.find(({ image }) => image.type?.toLowerCase() === 'cover (front)') ?? candidates?.[0];
}

export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.floor(Math.max(0, seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}

export function trackCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  return `${count} ${lastTwo >= 11 && lastTwo <= 14 ? 'треков' : last === 1 ? 'трек' : last >= 2 && last <= 4 ? 'трека' : 'треков'}`;
}
