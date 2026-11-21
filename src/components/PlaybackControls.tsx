import { useText } from '../i18n/context';
import { Pause, Play, Radio, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, Volume1 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatTime } from '../shared/media';
import type { Repeat as RepeatMode } from '../shared/queue';

export interface TransportProps {
  hasTrack: boolean;
  live?: boolean;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  hasPrevious: boolean;
  hasNext: boolean;
  togglePlay(): void;
  toggleShuffle(): void;
  toggleRepeat(): void;
  previous(): void;
  next(): void;
}

export interface TimelineProps { live?: boolean; elapsed: number; duration: number; seek(seconds: number): void }
export interface VolumeProps { volume: number; toggleMute(): void; setVolume(volume: number): void }
export type PlaybackProps = TransportProps & TimelineProps & VolumeProps;

export function TransportControls({ hasTrack, live, playing, shuffle, repeat, hasPrevious, hasNext, togglePlay, toggleShuffle, toggleRepeat, previous, next }: TransportProps) {
  const t = useText();
  const playLabel = live ? t(playing ? "Остановить эфир" : "Слушать эфир") : t(playing ? "Пауза" : "Воспроизвести");
  const repeatLabel = repeat === 'one' ? t("Повтор: один трек") : repeat === 'all' ? t("Повтор: вся очередь") : t("Повтор выключен");
  const previousLabel = t(live ? 'Предыдущая станция' : 'Предыдущий трек');
  const nextLabel = t(live ? 'Следующая станция' : 'Следующий трек');
  return <div className="transport-controls">
    <button type="button" className="icon-button mode-button" onClick={toggleShuffle} aria-pressed={!live && shuffle}
      title={t("Перемешать очередь")} aria-label={t("Перемешать очередь")} disabled={!hasTrack || live}><Shuffle size={17} /></button>
    <button type="button" className="icon-button step-button" onClick={previous} title={previousLabel} aria-label={previousLabel} disabled={!hasPrevious}><SkipBack size={19} fill="currentColor" /></button>
    <button type="button" className="play-button" onClick={togglePlay} title={live ? playLabel : t(playing ? "Пауза (Пробел)" : "Воспроизвести (Пробел)")} aria-label={playLabel} disabled={!hasTrack}>
      {playing ? <Pause size={18} fill="currentColor" /> : <Play className="play-icon" size={18} fill="currentColor" />}
    </button>
    <button type="button" className="icon-button step-button" onClick={next} title={nextLabel} aria-label={nextLabel} disabled={!hasNext}><SkipForward size={19} fill="currentColor" /></button>
    <button type="button" className="icon-button mode-button" onClick={toggleRepeat} aria-pressed={!live && repeat !== 'off'}
      title={repeatLabel} aria-label={repeatLabel} disabled={!hasTrack || live}>{repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}</button>
  </div>;
}

export function SeekTimeline({ elapsed, duration, seek, live }: TimelineProps) {
  const t = useText();
  if (live) return <div className="live-timeline" title={t('Прямой эфир без перемотки')}><Radio size={14} aria-hidden="true" />{t('Прямой эфир')}</div>;
  return <div className="timeline">
    <span>{formatTime(elapsed)}</span>
    <input type="range" className="range" aria-label={t("Позиция воспроизведения")}
      aria-valuetext={t("{0} из {1}", formatTime(elapsed), formatTime(duration))}
      min={0} max={duration || 1} step={0.1} value={Math.min(elapsed, duration)} disabled={!duration}
      onChange={(event) => seek(event.currentTarget.valueAsNumber)}
      style={{ '--filled': `${duration ? Math.min(elapsed / duration, 1) * 100 : 0}%` } as CSSProperties} />
    <span>{formatTime(duration)}</span>
  </div>;
}

export function VolumeControl({ volume, setVolume, toggleMute }: VolumeProps) {
  const t = useText();
  const percent = Math.round(volume * 100);
  const label = volume ? t("Выключить звук") : t("Включить звук");
  const Volume = volume === 0 ? VolumeX : volume <= 0.45 ? Volume1 : Volume2;
  return <div className="volume">
    <button type="button" className="icon-button" onClick={toggleMute} title={`${label} (M)`} aria-label={label}><Volume size={19} /></button>
    <input type="range" className="range" min={0} max={100} value={percent} aria-label={t("Громкость")} aria-valuetext={`${percent}%`}
      onChange={(event) => setVolume(event.currentTarget.valueAsNumber / 100)} style={{ '--filled': `${percent}%` } as CSSProperties} />
  </div>;
}
