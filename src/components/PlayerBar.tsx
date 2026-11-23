import { useText } from '../i18n/context';
import { ListMusic, Maximize2, MicVocal } from 'lucide-react';
import type { TrackDisplay } from '../shared/media';
import { sessionCatalogId } from '../shared/online';
import { Artwork } from './Artwork';
import { SeekTimeline, TransportControls, VolumeControl } from './PlaybackControls';
import type { PlaybackProps } from './PlaybackControls';

interface PlayerBarProps extends PlaybackProps {
  track: TrackDisplay | null;
  queueOpen: boolean;
  classic: boolean;
  goToPlayer(): void;
  openPresentation(): void;
  openKaraoke(): void;
  toggleQueue(): void;
}

export function PlayerBar(props: PlayerBarProps) {
  const t = useText();
  const { track } = props;
  const vk = props.source === 'vk';
  const artist = vk ? [track?.artist, t('VK Музыка')].filter(Boolean).join(' · ') : track?.artist ?? t('Добавьте музыку');
  return (
    <footer className={`player-bar${props.classic ? ' classic-player-bar' : ''}`} data-playback-source={props.source} aria-label={t("Управление воспроизведением")}>
      <button className="playing-mini" type="button" onClick={props.goToPlayer} aria-label={t("Открыть экран «Сейчас играет»")}>
        <Artwork track={track} />
        <span><strong title={track?.title}>{track?.title ?? t("Нет трека")}</strong><small title={artist}>{artist}</small></span>
      </button>
      <div className="transport"><TransportControls {...props} /><SeekTimeline {...props} /></div>
      <div className="player-side-controls">
        <VolumeControl {...props} />
        {!vk && <><span className="utility-divider" />
          <button type="button" className="icon-button karaoke-toggle" aria-haspopup="dialog" disabled={!track || props.live || sessionCatalogId(track.id)} onClick={props.openKaraoke}
            title={t("Караоке (L)")} aria-label={t("Караоке")}><MicVocal size={18} /></button></>}
        <button type="button" className="icon-button presentation-toggle" aria-haspopup="dialog" disabled={!track} onClick={props.openPresentation}
          title={t("Во весь экран (F)")} aria-label={t("Развернуть трек во весь экран")}><Maximize2 size={18} /></button>
        <button type="button" className="icon-button queue-toggle" onClick={props.toggleQueue} aria-pressed={props.queueOpen} aria-controls="play-queue"
          title={props.queueOpen ? t("Скрыть очередь") : t("Открыть очередь")} aria-label={props.queueOpen ? t("Скрыть очередь") : t("Открыть очередь")}><ListMusic size={20} /></button>
      </div>
    </footer>
  );
}
