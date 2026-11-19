import type { CSSProperties } from 'react';
import { AudioLines, Maximize2, Minus, X } from 'lucide-react';
import type { WidgetBackground } from '../shared/customization';
import type { Track } from '../shared/media';
import { Artwork } from './Artwork';
import { SeekTimeline, TransportControls, VolumeControl } from './PlaybackControls';
import type { PlaybackProps } from './PlaybackControls';

export function DesktopWidget({ track, tint, background, restore, controls, pending }: {
  track: Track | null; tint: string; background: WidgetBackground; restore(): void; controls: PlaybackProps; pending: boolean;
}) {
  return <section className="desktop-widget" aria-label="Виджет Luma" data-widget-background={background} style={{ '--widget-tint': tint } as CSSProperties}>
    {background === 'blur' && <Artwork track={track} className="widget-backdrop" />}
    <header className="widget-chrome native-title-bar">
      <span><AudioLines size={16} /> Luma Player</span>
      <div className="widget-window-buttons">
        <button className="icon-button" type="button" aria-label="Свернуть виджет" title="Свернуть виджет" onClick={() => window.luma?.window.minimize()}><Minus size={15} /></button>
        <button className="icon-button" type="button" aria-label="Вернуться в плеер" title="Вернуться в плеер (Esc)" disabled={pending} onClick={restore}><Maximize2 size={15} /></button>
        <button className="icon-button" type="button" aria-label="Закрыть Luma" title="Закрыть Luma" onClick={() => window.luma?.window.close()}><X size={17} /></button>
      </div>
    </header>
    <div className="widget-track"><Artwork track={track} /><div><strong>{track?.title ?? 'Нет трека'}</strong><small>{track?.artist ?? 'Откройте медиатеку'}</small></div><VolumeControl {...controls} /></div>
    <TransportControls {...controls} />
    <SeekTimeline {...controls} />
  </section>;
}
