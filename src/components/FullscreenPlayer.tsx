import { useText } from '../i18n/context';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { AudioLines, ChevronDown, ListMusic, MicVocal, Palette, SlidersHorizontal } from 'lucide-react';
import type { TrackLyrics } from '../player/useTrackLyrics';
import type { ReadSpectrum } from '../player/useAudio';
import type { Appearance } from '../shared/customization';
import type { KaraokeStyle } from '../shared/karaoke-style';
import type { Track } from '../shared/media';
import { OnlineCredit } from './OnlineMusic';
import { sessionCatalogId } from '../shared/online';
import { LyricsPanel } from './LyricsPanel';
import './karaoke.css';
import { Artwork } from './Artwork';
import { DislikeButton, FavoriteButton } from './FavoriteButton';
import { SeekTimeline, TransportControls, VolumeControl } from './PlaybackControls';
import type { PlaybackProps } from './PlaybackControls';
import { SceneBackground } from './SceneBackground';
import { VinylRecord } from './VinylRecord';
import { UpcomingTracks } from './UpcomingTracks';

interface FullscreenPlayerProps extends PlaybackProps {
  track: Track;
  karaoke: boolean;
  karaokeStyle: KaraokeStyle;
  changeKaraokeStyle(style: KaraokeStyle): void;
  lyrics: TrackLyrics;
  clock?: () => number;
  toggleKaraoke(): void;
  tint: string;
  appearance: Appearance;
  favorite: boolean;
  disliked: boolean;
  toggleDislike(id: string): void;
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
  const t = useText();
  const { track, tint, appearance, playing, favorite, close, karaoke } = props;
  const { hero, effect: scene, effectStrength, motion } = appearance;
  const ambient = karaoke || appearance.theme === 'macos';
  const artworkBackdrop = track.backdropUrl ?? track.artworkUrl;
  const ref = useRef<HTMLDialogElement>(null);
  const [karaokeQueue, setKaraokeQueue] = useState(false);
  const [karaokeTools, setKaraokeTools] = useState<HTMLDivElement | null>(null);
  const queueVisible = karaoke ? karaokeQueue : appearance.fullscreenQueue;
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
    <div ref={props.stage} data-effect={scene} data-ambient={ambient || undefined} className={`immersive-stage ${karaoke ? 'karaoke-stage' : `immersive-${hero}`}`} style={{ '--immersive-tone': tint } as CSSProperties}>
      {!ambient && scene === 'off' && artworkBackdrop && (hero === 'cover' || appearance.coverColors) &&
        <Artwork track={track} className="immersive-backdrop" imageUrl={artworkBackdrop} />}
      <SceneBackground effect={scene} tone={tint} strength={effectStrength * (karaoke ? .62 : 1)} tempo={appearance.effectTempo}
        animate={playing} visible={motion && props.sceneVisible} sample={playing && appearance.audioReactive && !track.online ? props.readSpectrum : undefined} />
      {(!ambient || scene !== 'off') && <div aria-hidden="true" className="immersive-scrim" />}
      <header className="immersive-header">
        <button type="button" className="icon-button immersive-collapse" onClick={close} title={t("Свернуть (Esc)")} aria-label={t("Свернуть полноэкранный плеер")}><ChevronDown size={24} /></button>
        <div><p className="overline">{t(karaoke ? "Караоке" : "Сейчас играет")}</p><strong>{props.live ? t("Прямой эфир") : track.online ? t("Онлайн-трек") : track.demo ? t("Демотреки Luma") : t("Локальная медиатека")}</strong></div>
        <div className="immersive-header-actions">
          <button type="button" className="icon-button immersive-karaoke-toggle" onClick={props.toggleKaraoke} disabled={!karaoke && (props.live || sessionCatalogId(track.id))}
            aria-pressed={karaoke} aria-label={t('Караоке')} title={t(karaoke ? 'Вернуться к обложке' : 'Караоке (L)')}><MicVocal size={20} /></button>
          <button type="button" className="icon-button immersive-queue-toggle" onClick={karaoke ? () => setKaraokeQueue(!karaokeQueue) : props.toggleQueue}
            aria-expanded={queueVisible} aria-controls={queueVisible ? 'immersive-upcoming' : undefined} aria-label={queueVisible ? t("Скрыть следующие треки") : t("Показать следующие треки")}
            title={queueVisible ? t("Скрыть следующие треки") : t("Показать следующие треки")}><ListMusic size={20} /></button>
          {karaoke ? <div ref={setKaraokeTools} /> : <div className="immersive-brand" aria-hidden="true"><AudioLines size={19} /><span>Luma Player</span></div>}
        </div>
      </header>
      <div className="immersive-scroll">{karaoke ? <div className={`karaoke-grid${queueVisible ? ' karaoke-with-queue' : ''}`}>
        <div className="karaoke-card">
          <div className="karaoke-deck">
            <div className="karaoke-track"><Artwork track={track} />
              <div className="karaoke-meta"><h1 id="immersive-title" title={track.title}>{track.title}</h1><p title={track.artist}>{track.artist}</p>
                {track.online && <OnlineCredit track={{ online: track.online }} />}</div>
            </div>
            <div className="immersive-content karaoke-controls"><SeekTimeline {...props} /><TransportControls {...props} />
              <div className="immersive-tools karaoke-tools">
                <button type="button" className="icon-button" onClick={props.openEqualizer} aria-label={t('Эквалайзер')} title={t('Эквалайзер')} aria-haspopup="dialog"><SlidersHorizontal size={19} /></button>
                <FavoriteButton track={track} selected={favorite} toggle={props.toggleFavorite} immersive />
                {queueVisible && <button type="button" className="icon-button immersive-queue-jump" aria-label={t('Перейти к следующим трекам')} onClick={jumpToQueue}><ListMusic size={20} /></button>}
                <VolumeControl {...props} />
              </div>
            </div>
          </div>
          <LyricsPanel key={track.id} state={props.lyrics} elapsed={props.elapsed} clock={props.clock} seek={props.seek} karaoke={{ style: props.karaokeStyle, change: props.changeKaraokeStyle, tools: karaokeTools }} demo={track.demo} />
        </div>
        {queueVisible && <UpcomingTracks tracks={props.upcoming} repeat={props.repeat} autoNext={props.autoNext} fullNumbers={appearance.fullNumbers} play={props.playUpcoming} />}
      </div> : <div className={`immersive-main${queueVisible ? ' immersive-with-queue' : ''}`}>
        <div className="immersive-art">
          {hero === 'vinyl' ? <VinylRecord track={track} animate={motion && playing && props.sceneVisible} /> : <Artwork track={track} />}
        </div>
        <div className="immersive-content">
          <div className="immersive-meta">
            <div><h1 id="immersive-title" title={track.title}>{track.title}</h1><p title={track.artist}>{track.artist}</p><small title={track.album}>{track.online ? <OnlineCredit track={{ online: track.online }} /> : track.album}</small></div>
            <div className="immersive-feedback">
              <FavoriteButton track={track} selected={favorite} toggle={props.toggleFavorite} immersive />
              {!props.live && <DislikeButton track={track} selected={props.disliked} toggle={props.toggleDislike} immersive />}
            </div>
          </div>
          <SeekTimeline {...props} />
          <TransportControls {...props} />
          <div className="immersive-tools">
            <button type="button" className="icon-button" onClick={props.openAppearance} aria-label={t("Оформление полноэкранного плеера")} title={t("Оформление")} aria-haspopup="dialog"><Palette size={20} /></button>
            <button type="button" className="icon-button" onClick={props.openEqualizer} aria-label={t("Эквалайзер")} title={t("Эквалайзер")} aria-haspopup="dialog"><SlidersHorizontal size={20} /></button>
            {queueVisible && <button type="button" className="icon-button immersive-queue-jump" aria-label={t("Перейти к следующим трекам")} title={t("Перейти к следующим трекам")} onClick={jumpToQueue}><ListMusic size={20} /></button>}
            <VolumeControl {...props} />
          </div>
        </div>
        {queueVisible && <UpcomingTracks tracks={props.upcoming} repeat={props.repeat} autoNext={props.autoNext} fullNumbers={appearance.fullNumbers} play={props.playUpcoming} />}
      </div>}</div>
    </div>
  </dialog>;
}
