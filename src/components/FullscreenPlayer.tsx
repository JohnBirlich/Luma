import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { AudioLines, ChevronDown, ListMusic, Palette, SlidersHorizontal } from 'lucide-react';
import type { ReadSpectrum } from '../player/useAudio';
import type { Appearance } from '../shared/customization';
import type { Track } from '../shared/media';
import { OnlineCredit } from './OnlineMusic';
import { Artwork } from './Artwork';
import { FavoriteButton } from './FavoriteButton';
import { SeekTimeline, TransportControls, VolumeControl } from './PlaybackControls';
import type { PlaybackProps } from './PlaybackControls';
import { SceneBackground } from './SceneBackground';
import { VinylRecord } from './VinylRecord';
import { UpcomingTracks } from './UpcomingTracks';

interface FullscreenPlayerProps extends PlaybackProps {
  track: Track;
  tint: string;
  appearance: Appearance;
  favorite: boolean;
  readSpectrum: ReadSpectrum;
  sceneVisible: boolean;
  upcoming: Track[];
  autoNext: boolean;
  playUpcoming(id: string): void;
  stage: RefObject<HTMLDivElement | null>;
  close(): void;
  toggleFavorite(id: string): void;
  toggleQueue(): void;
  openAppearance(): void;
  openEqualizer(): void;
}

export function FullscreenPlayer(props: FullscreenPlayerProps) {
  const { track, tint, appearance, playing, favorite, close } = props;
  const { hero, effect, effectStrength, motion } = appearance;
  const ref = useRef<HTMLDialogElement>(null);
  const queueVisible = appearance.fullscreenQueue;
  function jumpToQueue() {
    const panel = ref.current?.querySelector<HTMLElement>('#immersive-upcoming');
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: 'nearest' });
  }
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={ref} className="immersive-player" aria-labelledby="immersive-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <div ref={props.stage} data-effect={effect} className={`immersive-stage immersive-${hero}`} style={{ '--immersive-tone': tint } as CSSProperties}>
      {appearance.coverColors && <Artwork track={track} className="immersive-backdrop" imageUrl={track.backdropUrl} />}
      <SceneBackground effect={effect} strength={effectStrength} tempo={appearance.effectTempo} animate={motion && playing && props.sceneVisible} sample={appearance.audioReactive && !track.online ? props.readSpectrum : undefined} />
      <div aria-hidden="true" className="immersive-scrim" />
      <header className="immersive-header">
        <button type="button" className="icon-button immersive-collapse" onClick={close} title="Свернуть (Esc)" aria-label="Свернуть полноэкранный плеер"><ChevronDown size={24} /></button>
        <div><p className="overline">Сейчас играет</p><strong>{track.online ? 'Онлайн-трек' : track.demo ? 'Демотреки Luma' : 'Локальная медиатека'}</strong></div>
        <div className="immersive-header-actions">
          <button type="button" className="icon-button immersive-queue-toggle" onClick={props.toggleQueue}
            aria-expanded={queueVisible} aria-controls={queueVisible ? 'immersive-upcoming' : undefined} aria-label={queueVisible ? 'Скрыть следующие треки' : 'Показать следующие треки'}
            title={queueVisible ? 'Скрыть следующие треки' : 'Показать следующие треки'}><ListMusic size={20} /></button>
          <div className="immersive-brand" aria-hidden="true"><AudioLines size={19} /><span>Luma Player</span></div>
        </div>
      </header>
      <div className="immersive-scroll"><div className={`immersive-main${queueVisible ? ' immersive-with-queue' : ''}`}>
        <div className="immersive-art">
          {hero === 'vinyl' ? <VinylRecord track={track} animate={motion && playing && props.sceneVisible} /> : <Artwork track={track} />}
        </div>
        <div className="immersive-content">
          <div className="immersive-meta">
            <div><h1 id="immersive-title" title={track.title}>{track.title}</h1><p title={track.artist}>{track.artist}</p><small title={track.album}>{track.online ? <OnlineCredit track={{ online: track.online }} /> : track.album}</small></div>
            <FavoriteButton track={track} selected={favorite} toggle={props.toggleFavorite} immersive />
          </div>
          <SeekTimeline {...props} />
          <TransportControls {...props} />
          <div className="immersive-tools">
            <button type="button" className="icon-button" onClick={props.openAppearance} aria-label="Оформление полноэкранного плеера" title="Оформление" aria-haspopup="dialog"><Palette size={20} /></button>
            <button type="button" className="icon-button" onClick={props.openEqualizer} aria-label="Эквалайзер" title="Эквалайзер" aria-haspopup="dialog"><SlidersHorizontal size={20} /></button>
            {queueVisible && <button type="button" className="icon-button immersive-queue-jump" aria-label="Перейти к следующим трекам" title="Перейти к следующим трекам" onClick={jumpToQueue}><ListMusic size={20} /></button>}
            <VolumeControl {...props} />
          </div>
        </div>
        {queueVisible && <UpcomingTracks tracks={props.upcoming} repeat={props.repeat} autoNext={props.autoNext} play={props.playUpcoming} />}
      </div></div>
    </div>
  </dialog>;
}
