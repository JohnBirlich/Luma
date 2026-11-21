import type { InstallResult, UpdateReport } from './release-updates.js';
import type { DiscordStatus, DiscordTrack } from './discord-presence.js';
import type { SharedPlaylist } from './playlist-share.js';
import type { FloatStart } from './float-output.js';
import type { UiLanguage } from './ui-language.js';
import { formatCount } from './customization.js';
import { readIsrc } from './recording-match.js';
import type { AudioFormat } from './audio-quality.js';
import type { AppInfo } from './app-info.js';
import type { DiagnosticsBridge } from './diagnostics.js';
import { embeddedArtworkMime, MAX_COVER_FILE } from './artwork.js';
import { cleanTrackText, musicSearchKey, readTrackTag } from './russian.js';
import type { DesktopCatalogSource, Mp3ExportResult, OnlineCreditData, OnlineTrack } from './online.js';
import type { StreamCacheInfo } from './stream-cache.js';
import type { LastFmStatus, ListeningEvent } from './lastfm.js';
import type { Lyrics, LyricsQuery } from './lyrics.js';
import type { Fingerprint, MetadataCandidate } from './recognition.js';

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
  genres?: string[];
  isrc?: string;
  format?: AudioFormat;
  embeddedLyrics?: string;
  /** Local basename, used for matching an imported playlist. Never a readable path. */
  fileName?: string;
  audioUrl: string;
  artworkUrl?: string;
  backdropUrl?: string;
  color?: string;
  demo?: boolean;
  online?: OnlineCreditData;
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
  setUiLanguage(value: UiLanguage): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  openReleases(): Promise<void>;
  updates: { check(): Promise<UpdateReport>; install(version: string): Promise<InstallResult> };
  searchCommunity(id: number, query: string, source: DesktopCatalogSource): Promise<OnlineTrack[]>;
  cancelCatalogSearch(id: number): Promise<void>;
  openOnlineLink(url: string): Promise<void>;
  getTracks(): Promise<Track[]>;
  getAudioFormat(id: string): Promise<AudioFormat | null>;
  chooseTracks(): Promise<ImportResult>;
  importDroppedFiles(files: File[]): Promise<ImportResult>;
  removeTrack(id: string): Promise<Track[]>;
  openVkMusic(): Promise<void>;
  saveSharedPlaylist(share: SharedPlaylist): Promise<boolean>;
  discord: {
    status(): Promise<DiscordStatus>;
    update(clientId: string, track: DiscordTrack | null): void;
    onChange(callback: (status: DiscordStatus) => void): () => void;
  };
  musicLinks: {
    take(): Promise<string | undefined>;
    onAvailable(callback: () => void): () => void;
    openBrowser(url: string): Promise<void>;
    copy(url: string): Promise<void>;
  };
  clearLegacyVkSession(): Promise<void>;
  lyrics: { lookup(query: LyricsQuery, refresh?: boolean): Promise<Lyrics | null>; local(id: string): Promise<Lyrics | null>; openEdition(url: string): Promise<void> };
  exportMp3(track: OnlineTrack, saveLyrics: boolean): Promise<Mp3ExportResult>;
  recognition: {
    search(query: string, locale: string): Promise<MetadataCandidate[]>;
    hasAcoustid(): Promise<boolean>;
    identify(fingerprint: Fingerprint): Promise<MetadataCandidate[]>;
    openSource(url: string): Promise<void>;
  };
  floatOutput: {
    available(): Promise<boolean>;
    start(rate: number): Promise<FloatStart>;
    stop(): Promise<void>;
    write(stereo: ArrayBuffer): void;
    onLost(callback: () => void): () => void;
  };
  streamCache: {
    url(track: Track): Promise<string | null>;
    save(track: OnlineTrack): Promise<boolean>;
    info(): Promise<StreamCacheInfo>;
    clear(): Promise<StreamCacheInfo>;
  };
  lastfm: {
    status(): Promise<LastFmStatus>;
    configure(key: string, secret: string): Promise<LastFmStatus>;
    forgetCredentials(): Promise<LastFmStatus>;
    begin(): Promise<LastFmStatus>;
    finish(): Promise<LastFmStatus>;
    enable(enabled: boolean): Promise<LastFmStatus>;
    disconnect(): Promise<LastFmStatus>;
    record(event: ListeningEvent): void;
    onChange(callback: (status: LastFmStatus) => void): () => void;
  };
  diagnostics: DiagnosticsBridge;
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    setFullscreen(fullscreen: boolean): Promise<void>;
    setWidget(enabled: boolean): Promise<boolean>;
    onWidgetShortcut(callback: () => void): () => void;
    onFullscreen(callback: (fullscreen: boolean) => void): () => void;
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

/** Keep actual tags only; do not infer genres from filenames or artist names. */
export function readGenres(input: unknown, clean: (value: string) => string = cleanTrackText): string[] | undefined {
  if (!Array.isArray(input)) return;
  const names = new Map<string, string>();
  for (const value of input.slice(0, 12)) {
    if (typeof value !== 'string') continue;
    const name = clean(value).slice(0, 64);
    const key = musicSearchKey(name);
    if (key && !names.has(key)) names.set(key, name);
  }
  return names.size ? [...names.values()] : undefined;
}

export function trackInfo(
  filename: string,
  tags?: { title?: string; artist?: string; albumartist?: string; album?: string; genre?: string[]; isrc?: string[] | string },
  duration?: number,
): Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'genres' | 'isrc'> {
  const genres = readGenres(tags?.genre, readTrackTag);
  const isrc = readIsrc(tags?.isrc);
  return {
    ...(genres && { genres }), ...(isrc && { isrc }),
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

export function trackCount(count: number, full = true, language: UiLanguage = 'ru'): string {
  if (language === 'en') return `${formatCount(count, full, language)} ${count === 1 ? 'track' : 'tracks'}`;
  const lastTwo = count % 100;
  const last = count % 10;
  const many = (!full && count >= 1000) || (lastTwo >= 11 && lastTwo <= 14);
  return `${formatCount(count, full)} ${many ? 'треков' : last === 1 ? 'трек' : last >= 2 && last <= 4 ? 'трека' : 'треков'}`;
}
