import { memo } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, CirclePause, Play } from 'lucide-react';
import { useText } from '../i18n/context';
import { formatTime } from '../shared/media';
import type { Track } from '../shared/media';
import { Artwork } from './Artwork';
import { OnlineCredit } from './OnlineMusic';

export function Shelf({ title, detail, children, action }: { title: string; detail?: string; children?: ReactNode; action?: ReactNode }) {
  return <section className="hub-shelf" aria-label={title}>
    <header className="hub-shelf-head"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</header>
    {children}
  </section>;
}
export function Tile({ title, description, color, onClick, disabled, symbol, image, expanded, className = '', open = false }: {
  title: string; description?: string; color: string; onClick(): void; disabled?: boolean; symbol?: string; image?: Track; expanded?: boolean; className?: string; open?: boolean;
}) {
  return <button type="button" className={`hub-tile tone-${color} ${className}`} disabled={disabled} onClick={onClick}
    aria-label={title} title={description} aria-expanded={expanded}>
    <span className="hub-tile-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span>
    {image && <Artwork track={image} lazy />}{symbol && <span className="hub-tile-symbol" aria-hidden="true">{symbol}</span>}
    <span className="hub-tile-play" aria-hidden="true">{open ? <ChevronRight size={15} /> : <Play size={13} fill="currentColor" />}</span>
  </button>;
}
export const TrackRows = memo(function TrackRows({ tracks, play, currentId, playing, strip = false, credits = false, disabled = false }: {
  tracks: readonly Track[]; play(id: string, toggleCurrent?: boolean): void; currentId: string | null; playing: boolean; strip?: boolean; credits?: boolean; disabled?: boolean;
}) {
  const t = useText();
  return <ul className={`hub-tracks${strip ? ' hub-tracks-strip' : ''}`}>{tracks.map((track) => {
    const active = track.id === currentId, live = active && playing;
    return <li key={track.id} className={credits ? "hub-credit-row" : undefined}><button type="button" disabled={disabled} aria-current={active ? 'true' : undefined} aria-label={t(live ? 'Приостановить: {0}' : 'Слушать: {0}', track.title)}
      className="hub-track" onClick={() => play(track.id, true)}>
      <span className="hub-track-art"><Artwork track={track} lazy /><i>{live ? <CirclePause size={22} /> : <Play size={16} fill="currentColor" />}</i></span>
      <span className="hub-track-copy"><strong title={track.title}>{track.title}</strong><small title={track.artist}>{track.artist}</small></span>
      <time>{formatTime(track.duration)}</time>
    </button>{credits && track.online && <OnlineCredit track={{ online: track.online }} />}</li>;
  })}</ul>;
});
