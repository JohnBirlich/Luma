import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Activity, AudioLines, Check, CircleSlash, CloudRain, Disc3, Focus, Grid2X2, Image, LayoutTemplate, Orbit, Palette, Wind, Sparkles, Sunset, Triangle, Waves, X } from 'lucide-react';
import type { Track } from '../shared/media';
import type { ReadSpectrum } from '../player/useAudio';
import { EFFECT_TEMPOS } from '../shared/customization';
import type { Appearance, EffectTempo } from '../shared/customization';
import { Artwork } from './Artwork';
import { SceneBackground } from './SceneBackground';
import { VinylRecord } from './VinylRecord';

const LAYOUTS = [
  { id: 'cover', label: 'Обложка', icon: Image },
  { id: 'blur', label: 'Размытие', icon: Focus },
  { id: 'vinyl', label: 'Винил', icon: Disc3 },
  { id: 'center', label: 'В центре', icon: LayoutTemplate },
] as const;
const EFFECTS = [
  { id: 'off', label: 'Без эффекта', description: 'Только оформление трека', icon: CircleSlash },
  { id: 'aurora', label: 'Сияние', description: 'Северное сияние и переливы', icon: Sparkles },
  { id: 'waves', label: 'Волны', description: 'Световые линии в такт музыке', icon: Waves },
  { id: 'stars', label: 'Звёзды', description: 'Созвездия и звёздное поле', icon: Sparkles },
  { id: 'spectrum', label: 'Спектр', description: 'Световые полосы частот', icon: AudioLines },
  { id: 'orbits', label: 'Орбиты', description: 'Планета и световые кольца', icon: Orbit },
  { id: 'prism', label: 'Призма', description: 'Переливы цветных лучей', icon: Triangle },
  { id: 'pulse', label: 'Импульс', description: 'Кольца в ритме баса', icon: Activity },
  { id: 'nebula', label: 'Туманность', description: 'Цветное облако и звёздная пыль', icon: Wind },
  { id: 'horizon', label: 'Неон', description: 'Линии горизонта и синтвейв', icon: Sunset },
  { id: 'kaleidoscope', label: 'Калейдоскоп', description: 'Вращение цветных граней', icon: Grid2X2 },
  { id: 'rain', label: 'Дождь', description: 'Световые капли на стекле', icon: CloudRain },
] as const;

export interface SceneOptionsProps { appearance: Appearance; change(value: Appearance): void }

export function NowPlayingOptions({ appearance, change }: SceneOptionsProps) {
  return <div className="scene-options">
    <div className="scene-option-group">
      <h3>Компоновка</h3>
      <div className="scene-layouts" role="group" aria-label="Компоновка «Сейчас играет»">
        {LAYOUTS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={appearance.hero === id} onClick={() => change({ ...appearance, hero: id })}>
          <Icon size={17} /><span>{label}</span>
        </button>)}
      </div>
    </div>
    <div className="scene-option-group">
      <h3>Фоновый эффект</h3>
      <div className="scene-choice-grid" role="group" aria-label="Фон «Сейчас играет»">
        {EFFECTS.map(({ id, label, description, icon: Icon }) => <button key={id} type="button" aria-pressed={appearance.effect === id} aria-label={label} title={description}
          className="scene-choice" onClick={() => change({ ...appearance, effect: id })}>
          <span className="scene-choice-preview">
            <SceneBackground effect={id} strength={0.82} />
            <Icon size={16} aria-hidden="true" />{appearance.effect === id && <Check className="scene-choice-check" size={13} aria-hidden="true" />}
          </span>
          <strong>{label}</strong><small>{description}</small>
        </button>)}
      </div>
    </div>
    <label className="scene-strength"><span>Яркость эффекта</span>
      <input className="range" type="range" min="0.25" max="1" step="0.05" value={appearance.effectStrength} disabled={appearance.effect === 'off'}
        aria-valuetext={`${Math.round(appearance.effectStrength * 100)} %`} style={{ '--filled': `${(appearance.effectStrength - 0.25) / 0.75 * 100}%` } as CSSProperties}
        onChange={(event) => change({ ...appearance, effectStrength: event.currentTarget.valueAsNumber })} />
      <output>{Math.round(appearance.effectStrength * 100)} %</output>
    </label>
  </div>;
}

export function NowPlayingDialog({ appearance, change, close, tint, track, playing, sample }: SceneOptionsProps & { close(): void; tint: string; track: Track | null; playing: boolean; sample?: ReadSpectrum }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  function dismiss() { ref.current?.close(); close(); }
  return (
    <dialog ref={ref} className="cover-dialog scene-dialog" aria-labelledby="scene-dialog-title"
      onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => { if (event.currentTarget === event.target) dismiss(); }}>
      <div className="cover-editor">
        <header className="dialog-header">
          <div className="dialog-mark"><Palette size={21} /></div>
          <div><p className="overline">Сейчас играет</p><h2 id="scene-dialog-title">Оформление</h2></div>
          <button type="button" className="icon-button" aria-label="Закрыть оформление" title="Закрыть" onClick={dismiss}><X size={20} /></button>
        </header>
        <div className={`scene-dialog-preview scene-preview-${appearance.hero}`} style={{ '--preview-tone': tint } as CSSProperties} aria-hidden="true">
          <SceneBackground effect={appearance.effect} strength={appearance.effectStrength} tempo={appearance.effectTempo} animate={appearance.motion} sample={appearance.audioReactive && playing ? sample : undefined} />
          {appearance.hero === 'vinyl' ? <VinylRecord className="scene-preview-record" track={track} animate={appearance.motion && playing} />
            : <Artwork track={track} imageUrl={appearance.hero === 'blur' || appearance.hero === 'cover' ? track?.backdropUrl : undefined} className="scene-preview-art" />}
          <div className="scene-preview-copy"><p className="overline">Предпросмотр</p><strong>{track?.title ?? 'Ваша музыка'}</strong><span>{track?.artist ?? 'Luma Player'}</span></div>
        </div>
        <NowPlayingOptions appearance={appearance} change={change} />
        <div className="scene-dialog-tuning">
          <label>Темп фона <select aria-label="Темп фона" value={appearance.effectTempo} disabled={appearance.effect === 'off'} onChange={(event) => change({ ...appearance, effectTempo: event.currentTarget.value as EffectTempo })}>
            {Object.entries(EFFECT_TEMPOS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label><input type="checkbox" checked={appearance.audioReactive} disabled={appearance.effect === 'off'} onChange={(event) => change({ ...appearance, audioReactive: event.currentTarget.checked })} /> Реакция на локальный звук</label>
        </div>
        <footer className="dialog-footer cover-footer">
          <span className="scene-dialog-hint">Применяется сразу и сохраняется автоматически.</span>
          <button type="button" className="button primary-button" onClick={dismiss}>Готово</button>
        </footer>
      </div>
    </dialog>
  );
}
