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
  getTracks(): Promise<Track[]>;
  chooseTracks(): Promise<ImportResult>;
  importDroppedFiles(files: File[]): Promise<ImportResult>;
  removeTrack(id: string): Promise<Track[]>;
  openVkLink(url: string): Promise<void>;
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
    title: tags?.title?.trim() || filename.replace(/\.[^.]+$/, '') || filename,
    artist: tags?.artist?.trim() || tags?.albumartist?.trim() || 'Неизвестный исполнитель',
    album: tags?.album?.trim() || 'Без альбома',
    duration: duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : 0,
  };
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
};

export function usableArtwork<T extends { format: string; data: Uint8Array; type?: string }>(pictures?: T[]) {
  const valid = pictures?.filter(({ format, data }) =>
    Object.hasOwn(IMAGE_EXTENSIONS, format.toLowerCase()) && data.length > 0 && data.length <= 5 * 1024 * 1024);
  const image = valid?.find(({ type }) => type?.toLowerCase() === 'cover (front)') ?? valid?.[0];
  return image ? { image, extension: IMAGE_EXTENSIONS[image.format.toLowerCase()] } : undefined;
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
