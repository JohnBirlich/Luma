import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { AudioLines, ChevronDown, Heart, Palette, SlidersHorizontal } from 'lucide-react';
import type { ReadSpectrum } from '../player/useAudio';
import type { Appearance } from '../shared/customization';
import type { Track } from '../shared/media';
import { Artwork } from './Artwork';
import { SeekTimeline, TransportControls, VolumeControl } from './PlaybackControls';
import type { PlaybackProps } from './PlaybackControls';
import { SceneBackground } from './SceneBackground';
import { VinylRecord } from './VinylRecord';

interface FullscreenPlayerProps extends PlaybackProps {
  track: Track;
  tint: string;
  appearance: Appearance;
  favorite: boolean;
  readSpectrum: ReadSpectrum;
  sceneVisible: boolean;
  stage: RefObject<HTMLDivElement | null>;
  close(): void;
  toggleFavorite(id: string): void;
  openAppearance(): void;
  openEqualizer(): void;
}

export function FullscreenPlayer(props: FullscreenPlayerProps) {
  const { track, tint, appearance, playing, favorite, close } = props;
  const { hero, effect, effectStrength, motion } = appearance;
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={ref} className="immersive-player" aria-labelledby="immersive-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <div ref={props.stage} className={`immersive-stage immersive-${hero}`} style={{ '--immersive-tone': tint } as CSSProperties}>
      {appearance.coverColors && <Artwork track={track} className="immersive-backdrop" imageUrl={track.backdropUrl} />}
      <SceneBackground effect={effect} strength={effectStrength} animate={motion && playing && props.sceneVisible} sample={props.readSpectrum} />
      <div aria-hidden="true" className="immersive-scrim" />
      <header className="immersive-header">
        <button type="button" className="icon-button immersive-collapse" onClick={close} title="Свернуть (Esc)" aria-label="Свернуть полноэкранный плеер"><ChevronDown size={24} /></button>
        <div><p className="overline">Сейчас играет</p><strong>{track.demo ? 'Демотреки Luma' : 'Локальная медиатека'}</strong></div>
        <div className="immersive-brand" aria-hidden="true"><AudioLines size={19} /><span>Luma Player</span></div>
      </header>
      <div className="immersive-main">
        <div className="immersive-art">
          {hero === 'vinyl' ? <VinylRecord track={track} animate={motion && playing && props.sceneVisible} /> : <Artwork track={track} />}
        </div>
        <div className="immersive-content">
          <div className="immersive-meta">
            <div><h1 id="immersive-title" title={track.title}>{track.title}</h1><p title={track.artist}>{track.artist}</p><small title={track.album}>{track.album}</small></div>
            <button type="button" className="icon-button immersive-favorite" aria-pressed={favorite} onClick={() => props.toggleFavorite(track.id)}
              aria-label={favorite ? 'Убрать из избранного' : 'В избранное'} title={favorite ? 'Убрать из избранного' : 'В избранное'}><Heart size={23} fill={favorite ? 'currentColor' : 'none'} /></button>
          </div>
          <SeekTimeline {...props} />
          <TransportControls {...props} />
          <div className="immersive-tools">
            <button type="button" className="icon-button" onClick={props.openAppearance} aria-label="Оформление полноэкранного плеера" title="Оформление" aria-haspopup="dialog"><Palette size={20} /></button>
            <button type="button" className="icon-button" onClick={props.openEqualizer} aria-label="Эквалайзер" title="Эквалайзер" aria-haspopup="dialog"><SlidersHorizontal size={20} /></button>
            <VolumeControl {...props} />
          </div>
        </div>
      </div>
    </div>
  </dialog>;
}
