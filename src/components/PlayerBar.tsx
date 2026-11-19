import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, Volume1 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatTime } from '../shared/media';
import type { Track } from '../shared/media';
import type { Repeat as RepeatMode } from '../shared/queue';
import { Artwork } from './Artwork';

interface PlayerBarProps {
  track: Track | null;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  elapsed: number;
  duration: number;
  volume: number;
  hasNext: boolean;
  queueOpen: boolean;
  goToPlayer(): void;
  togglePlay(): void;
  toggleShuffle(): void;
  toggleRepeat(): void;
  previous(): void;
  next(): void;
  toggleMute(): void;
  setVolume(volume: number): void;
  seek(seconds: number): void;
  toggleQueue(): void;
}

export function PlayerBar(props: PlayerBarProps) {
  const { track, playing, shuffle, repeat, elapsed, duration, volume } = props;
  const repeatLabel = repeat === 'one' ? 'Повтор: один трек' : repeat === 'all' ? 'Повтор: вся очередь' : 'Повтор выключен';
  const volumePercent = Math.round(volume * 100);
  const VolumeIcon = volume === 0 ? VolumeX : volume <= 0.45 ? Volume1 : Volume2;
  return (
    <footer className="player-bar" aria-label="Управление воспроизведением">
      <button className="playing-mini" type="button" onClick={props.goToPlayer} aria-label="Открыть экран «Сейчас играет»">
        <Artwork track={track} />
        <span><strong>{track?.title ?? 'Нет трека'}</strong><small>{track?.artist ?? 'Добавьте музыку'}</small></span>
      </button>
      <div className="transport">
        <div className="transport-controls">
          <button type="button" className="icon-button mode-button" onClick={props.toggleShuffle} aria-pressed={shuffle}
            title="Перемешать очередь" aria-label="Перемешать очередь" disabled={!track}><Shuffle size={17} /></button>
          <button type="button" className="icon-button step-button" onClick={props.previous} title="Предыдущий трек" aria-label="Предыдущий трек" disabled={!track}><SkipBack size={19} fill="currentColor" /></button>
          <button type="button" className="play-button" onClick={props.togglePlay} title={playing ? 'Пауза (Пробел)' : 'Воспроизвести (Пробел)'} aria-label={playing ? 'Пауза' : 'Воспроизвести'} disabled={!track}>
            {playing ? <Pause size={18} fill="currentColor" /> : <Play className="play-icon" size={18} fill="currentColor" />}
          </button>
          <button type="button" className="icon-button step-button" onClick={props.next} title="Следующий трек" aria-label="Следующий трек" disabled={!props.hasNext}><SkipForward size={19} fill="currentColor" /></button>
          <button type="button" className="icon-button mode-button" onClick={props.toggleRepeat} aria-pressed={repeat !== 'off'}
            title={repeatLabel} aria-label={repeatLabel} disabled={!track}>{repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}</button>
        </div>
        <div className="timeline">
          <span>{formatTime(elapsed)}</span>
          <input type="range" className="range" aria-label="Позиция воспроизведения"
            aria-valuetext={`${formatTime(elapsed)} из ${formatTime(duration)}`}
            min={0} max={duration || 1} step={0.1} value={Math.min(elapsed, duration)} disabled={!duration}
            onChange={(event) => props.seek(event.currentTarget.valueAsNumber)}
            style={{ '--filled': `${duration ? Math.min(elapsed / duration, 1) * 100 : 0}%` } as CSSProperties} />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="player-side-controls">
        <div className="volume">
          <button type="button" className="icon-button" onClick={props.toggleMute} title={volume ? 'Выключить звук (M)' : 'Включить звук (M)'} aria-label={volume ? 'Выключить звук' : 'Включить звук'}><VolumeIcon size={19} /></button>
          <input type="range" className="range" min={0} max={100} value={volumePercent} aria-label="Громкость" aria-valuetext={`${volumePercent}%`}
            onChange={(event) => props.setVolume(event.currentTarget.valueAsNumber / 100)} style={{ '--filled': `${volumePercent}%` } as CSSProperties} />
        </div>
        <span className="utility-divider" />
        <button type="button" className="icon-button queue-toggle" onClick={props.toggleQueue} aria-pressed={props.queueOpen} aria-controls="play-queue"
          title={props.queueOpen ? 'Скрыть очередь' : 'Открыть очередь'} aria-label={props.queueOpen ? 'Скрыть очередь' : 'Открыть очередь'}><ListMusic size={20} /></button>
      </div>
    </footer>
  );
}
