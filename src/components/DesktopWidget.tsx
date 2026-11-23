import { useText } from '../i18n/context';
import type { CSSProperties, ReactNode } from 'react';
import { AudioLines, Maximize2, Minus, Play, Radio, Repeat, Shuffle, SkipBack, SkipForward, Volume2, X } from 'lucide-react';
import type { Appearance } from '../shared/customization';
import type { Track } from '../shared/media';
import { Artwork } from './Artwork';
import { SceneBackground } from './SceneBackground';
import type { ReadSpectrum } from '../player/useAudio';
import { SeekTimeline, TransportControls, VolumeControl } from './PlaybackControls';
import type { PlaybackProps } from './PlaybackControls';

type WidgetLook = { track: Track | null; tint: string; appearance: Appearance; macos: boolean };
type WidgetMotion = { playing?: boolean; sample?: ReadSpectrum };
const macLights = ['close', 'minimize', 'restore'] as const;

/** The widget and preview share their material, scene and layout. */
function WidgetSurface({ track, tint, appearance, macos, label, preview = false, playing, sample, children }: WidgetLook & WidgetMotion & {
  label: string; preview?: boolean; children: ReactNode;
}) {
  const { widgetBackground: background, effect, effectStrength, effectTempo, motion, audioReactive } = appearance;
  return <section className={`desktop-widget${preview ? ' widget-sample' : ''}`} aria-label={label} data-widget-layout={macos ? 'macos' : undefined}
    data-widget-background={background} data-effect={effect === 'off' ? undefined : effect} style={{ '--widget-tint': tint } as CSSProperties}>
    {(background === 'blur' || background === 'album') && <Artwork track={track} imageUrl={track?.backdropUrl} className="widget-backdrop" />}
    <SceneBackground effect={effect} tone={track ? tint : undefined} strength={effectStrength} tempo={effectTempo} visible={motion}
      animate={playing} sample={audioReactive && !track?.online && playing ? sample : undefined} />
    {children}
  </section>;
}

function WidgetChrome({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  return <header className={`widget-chrome${preview ? '' : ' native-title-bar'}`} aria-hidden={preview || undefined}>
    <span><AudioLines size={16} aria-hidden="true" /> Luma Player</span>
    <div className="widget-window-buttons">{children}</div>
  </header>;
}

function WidgetTrack({ track, title, subtitle, children }: { track: Track | null; title: string; subtitle: string; children: ReactNode }) {
  return <div className="widget-track">
    <Artwork track={track} />
    <div className="widget-copy"><strong title={title}>{title}</strong><small title={subtitle}>{subtitle}</small></div>
    {children}
  </div>;
}

export function WidgetPreview(look: WidgetLook) {
  const t = useText();
  const { track, macos } = look;
  return <WidgetSurface {...look} label={t('Предпросмотр фона виджета')} preview>
    {macos && <WidgetChrome preview>{macLights.map((action) => <i key={action} data-widget-window={action} />)}</WidgetChrome>}
    <WidgetTrack track={track} title={track?.title ?? t('Ваша музыка')} subtitle={track?.artist ?? t('Предпросмотр виджета Luma')}>
      {macos ? <div className="volume" aria-hidden="true"><Volume2 size={17} /><i className="widget-sample-meter" /></div> : <Play size={16} aria-hidden="true" />}
    </WidgetTrack>
    {macos && <>
      <div className="transport-controls" aria-hidden="true">
        <span className="icon-button mode-button"><Shuffle size={15} /></span>
        <span className="icon-button step-button"><SkipBack size={18} fill="currentColor" /></span>
        <span className="play-button"><Play size={18} fill="currentColor" /></span>
        <span className="icon-button step-button"><SkipForward size={18} fill="currentColor" /></span>
        <span className="icon-button mode-button"><Repeat size={15} /></span>
      </div>
      {track?.online?.source === 'broadcast' ? <div className="live-timeline" aria-hidden="true"><Radio size={14} />{t('Прямой эфир')}</div>
        : <div className="timeline" aria-hidden="true"><span>0:28</span><i className="widget-sample-meter" /><span>3:12</span></div>}
    </>}
  </WidgetSurface>;
}

export function DesktopWidget({ restore, controls, pending, ...look }: WidgetLook & WidgetMotion & {
  restore(): void; controls: PlaybackProps; pending: boolean;
}) {
  const t = useText();
  const { track, macos } = look;
  const close = t('Закрыть Luma'), minimize = t('Свернуть виджет'), open = t('Вернуться в плеер');
  const actions = {
    close: { icon: X, label: close, action: () => window.luma?.window.close() },
    minimize: { icon: Minus, label: minimize, action: () => window.luma?.window.minimize() },
    restore: { icon: Maximize2, label: open, action: restore },
  };
  const order = macos ? macLights : ['minimize', 'restore', 'close'] as const;
  return <WidgetSurface {...look} label={t('Виджет Luma')}>
    <WidgetChrome>{order.map((id) => {
      const { icon: Icon, label, action } = actions[id];
      return <button key={id} data-widget-window={id} className="icon-button" type="button" aria-label={label}
        title={id === 'restore' ? t('Вернуться в плеер (Esc)') : label} disabled={id === 'restore' && pending} onClick={action}>
        <Icon size={16} aria-hidden="true" />
      </button>;
    })}</WidgetChrome>
    <WidgetTrack track={track} title={track?.title ?? t('Нет трека')} subtitle={track?.artist ?? t('Откройте медиатеку')}>
      <VolumeControl {...controls} />
    </WidgetTrack>
    <TransportControls {...controls} />
    <SeekTimeline {...controls} />
  </WidgetSurface>;
}
