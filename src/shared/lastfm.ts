import type { Track } from './media.js';
import { cleanTrackText } from './russian.js';

export const LASTFM_GUIDE = 'https://www.last.fm/api/account/create';
export interface LastFmStatus {
  configured: boolean;
  persistent: boolean;
  user?: string;
  enabled: boolean;
  waiting?: boolean;
  issue?: 'authorize' | 'offline' | 'rejected' | 'expired';
}
export interface ListeningEvent {
  kind: 'now' | 'scrobble';
  title: string;
  artist: string;
  album?: string;
  duration: number;
  started: number;
  listened: number;
}

const tag = (value: unknown) => typeof value === 'string' && value.length <= 256 ? cleanTrackText(value).trim() : '';
export const scrobbleAfter = (duration: number) => duration > 30 && duration <= 86400 ? Math.min(duration / 2, 240) : Infinity;

export function readListeningEvent(value: unknown, now: number): ListeningEvent | undefined {
  const row = value as Partial<ListeningEvent> | null;
  const title = tag(row?.title), artist = tag(row?.artist), album = tag(row?.album);
  const duration = row?.duration, listened = row?.listened, started = row?.started, kind = row?.kind;
  if (!title || !artist || title === 'Без названия' || artist === 'Неизвестный исполнитель'
    || typeof started !== 'number' || !Number.isSafeInteger(started) || started < now - 86400 || started > now
    || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > 86400
    || typeof listened !== 'number' || !Number.isFinite(listened) || listened < 0 || listened > now - started + 1
    || (kind !== 'now' && (kind !== 'scrobble' || listened < scrobbleAfter(duration)))) return;
  return { kind, title, artist, album: album || undefined, duration: Math.round(duration), started, listened };
}

/** Time on the actual deck, not the furthest point reached. Invalid gaps never count. */
export class ListeningClock {
  private at?: { position: number; wall: number };
  private listened = 0;
  private submitted = false;
  private constructor(private readonly tags: Pick<ListeningEvent, 'title' | 'artist' | 'album' | 'started'>) {}
  static start(track: Track, started: number) {
    const title = tag(track.title), artist = tag(track.artist), album = tag(track.album);
    if (track.demo || !title || !artist || title === 'Без названия' || artist === 'Неизвестный исполнитель') return;
    return new ListeningClock({ title, artist, album: track.online || album === 'Без альбома' ? undefined : album || undefined, started });
  }
  now(duration: number): ListeningEvent { return { ...this.tags, kind: 'now', duration, listened: 0 }; }
  interrupt() { this.at = undefined; }
  sample(position: number, wall: number, duration: number, rate: number): ListeningEvent | undefined {
    const previous = this.at;
    this.at = { position, wall };
    if (!previous || this.submitted) return;
    const elapsed = wall - previous.wall, advanced = position - previous.position;
    if (Number.isFinite(advanced) && Number.isFinite(elapsed) && elapsed > 0 && elapsed <= 10 && rate > 0
      && advanced > 0 && advanced / rate <= elapsed + .18) this.listened += Math.min(advanced / rate, elapsed);
    if (this.listened >= scrobbleAfter(duration)) {
      this.submitted = true;
      return { ...this.tags, duration, kind: 'scrobble', listened: this.listened };
    }
  }
}
