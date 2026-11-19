import { ListMusic, Maximize2 } from 'lucide-react';
import type { Track } from '../shared/media';
import { Artwork } from './Artwork';
import { SeekTimeline, TransportControls, VolumeControl } from './PlaybackControls';
import type { PlaybackProps } from './PlaybackControls';

interface PlayerBarProps extends PlaybackProps {
  track: Track | null;
  queueOpen: boolean;
  classic: boolean;
  goToPlayer(): void;
  openPresentation(): void;
  toggleQueue(): void;
}

export function PlayerBar(props: PlayerBarProps) {
  const { track } = props;
  return (
    <footer className={`player-bar${props.classic ? ' classic-player-bar' : ''}`} aria-label="Управление воспроизведением">
      <button className="playing-mini" type="button" onClick={props.goToPlayer} aria-label="Открыть экран «Сейчас играет»">
        <Artwork track={track} />
        <span><strong>{track?.title ?? 'Нет трека'}</strong><small>{track?.artist ?? 'Добавьте музыку'}</small></span>
      </button>
      <div className="transport"><TransportControls {...props} /><SeekTimeline {...props} /></div>
      <div className="player-side-controls">
        <VolumeControl {...props} />
        <span className="utility-divider" />
        <button type="button" className="icon-button presentation-toggle" aria-haspopup="dialog" disabled={!track} onClick={props.openPresentation}
          title="Во весь экран (F)" aria-label="Развернуть трек во весь экран"><Maximize2 size={18} /></button>
        <button type="button" className="icon-button queue-toggle" onClick={props.toggleQueue} aria-pressed={props.queueOpen} aria-controls="play-queue"
          title={props.queueOpen ? 'Скрыть очередь' : 'Открыть очередь'} aria-label={props.queueOpen ? 'Скрыть очередь' : 'Открыть очередь'}><ListMusic size={20} /></button>
      </div>
    </footer>
  );
}
