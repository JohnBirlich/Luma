import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, Volume1 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatTime } from '../shared/media';
import type { Repeat as RepeatMode } from '../shared/queue';

export interface TransportProps {
  hasTrack: boolean;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  hasNext: boolean;
  togglePlay(): void;
  toggleShuffle(): void;
  toggleRepeat(): void;
  previous(): void;
  next(): void;
}

export interface TimelineProps { elapsed: number; duration: number; seek(seconds: number): void }
export interface VolumeProps { volume: number; toggleMute(): void; setVolume(volume: number): void }
export type PlaybackProps = TransportProps & TimelineProps & VolumeProps;

export function TransportControls({ hasTrack, playing, shuffle, repeat, hasNext, togglePlay, toggleShuffle, toggleRepeat, previous, next }: TransportProps) {
  const repeatLabel = repeat === 'one' ? 'Повтор: один трек' : repeat === 'all' ? 'Повтор: вся очередь' : 'Повтор выключен';
  return <div className="transport-controls">
    <button type="button" className="icon-button mode-button" onClick={toggleShuffle} aria-pressed={shuffle}
      title="Перемешать очередь" aria-label="Перемешать очередь" disabled={!hasTrack}><Shuffle size={17} /></button>
    <button type="button" className="icon-button step-button" onClick={previous} title="Предыдущий трек" aria-label="Предыдущий трек" disabled={!hasTrack}><SkipBack size={19} fill="currentColor" /></button>
    <button type="button" className="play-button" onClick={togglePlay} title={playing ? 'Пауза (Пробел)' : 'Воспроизвести (Пробел)'} aria-label={playing ? 'Пауза' : 'Воспроизвести'} disabled={!hasTrack}>
      {playing ? <Pause size={18} fill="currentColor" /> : <Play className="play-icon" size={18} fill="currentColor" />}
    </button>
    <button type="button" className="icon-button step-button" onClick={next} title="Следующий трек" aria-label="Следующий трек" disabled={!hasNext}><SkipForward size={19} fill="currentColor" /></button>
    <button type="button" className="icon-button mode-button" onClick={toggleRepeat} aria-pressed={repeat !== 'off'}
      title={repeatLabel} aria-label={repeatLabel} disabled={!hasTrack}>{repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}</button>
  </div>;
}

export function SeekTimeline({ elapsed, duration, seek }: TimelineProps) {
  return <div className="timeline">
    <span>{formatTime(elapsed)}</span>
    <input type="range" className="range" aria-label="Позиция воспроизведения"
      aria-valuetext={`${formatTime(elapsed)} из ${formatTime(duration)}`}
      min={0} max={duration || 1} step={0.1} value={Math.min(elapsed, duration)} disabled={!duration}
      onChange={(event) => seek(event.currentTarget.valueAsNumber)}
      style={{ '--filled': `${duration ? Math.min(elapsed / duration, 1) * 100 : 0}%` } as CSSProperties} />
    <span>{formatTime(duration)}</span>
  </div>;
}

export function VolumeControl({ volume, setVolume, toggleMute }: VolumeProps) {
  const percent = Math.round(volume * 100);
  const label = volume ? 'Выключить звук' : 'Включить звук';
  const Volume = volume === 0 ? VolumeX : volume <= 0.45 ? Volume1 : Volume2;
  return <div className="volume">
    <button type="button" className="icon-button" onClick={toggleMute} title={`${label} (M)`} aria-label={label}><Volume size={19} /></button>
    <input type="range" className="range" min={0} max={100} value={percent} aria-label="Громкость" aria-valuetext={`${percent}%`}
      onChange={(event) => setVolume(event.currentTarget.valueAsNumber / 100)} style={{ '--filled': `${percent}%` } as CSSProperties} />
  </div>;
}
