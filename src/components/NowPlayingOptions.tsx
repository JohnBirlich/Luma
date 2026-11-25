import { APP_NAME } from '../shared/app-info';
import { useText } from '../i18n/context';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Activity, AudioLines, Check, CircleSlash, Diamond, CloudRain, Disc3, Focus, Grid2X2, Image, LayoutTemplate, Orbit, Palette, Wind, Music2, Droplets, Sparkles, Sunset, Hexagon, Triangle, Waves, Sun, Telescope, X } from 'lucide-react';
import type { TrackDisplay } from '../shared/media';
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
  { id: 'tunnel', label: 'Тоннель', description: 'Световые грани уходят в глубину', icon: Hexagon },
  { id: 'aurora', label: 'Сияние', description: 'Зелёные и лиловые шторы северного сияния', icon: Sparkles },
  { id: 'waves', label: 'Волны', description: 'Морской прибой в сумерках', icon: Waves },
  { id: 'stars', label: 'Звёзды', description: 'Звёздная пыль и мягкий параллакс', icon: Sparkles },
  { id: 'spectrum', label: 'Спектр', description: 'Длинные линии в ритме трека', icon: AudioLines },
  { id: 'columns', label: 'Кристаллы', description: 'Гранёные кристаллы растут в такт частотам', icon: Diamond },
  { id: 'orbits', label: 'Орбиты', description: 'Планета, кольца и спутники', icon: Orbit },
  { id: 'prism', label: 'Призма', description: 'Вращающаяся пирамида с цветными лучами', icon: Triangle },
  { id: 'pulse', label: 'Импульс', description: 'Кольца в ритме баса', icon: Activity },
  { id: 'nebula', label: 'Туманность', description: 'Глубокая туманность и параллакс звёзд', icon: Wind },
  { id: 'horizon', label: 'Неон', description: 'Линии горизонта и синтвейв', icon: Sunset },
  { id: 'kaleidoscope', label: 'Хромолинии', description: 'Поток переливающихся нитей', icon: Grid2X2 },
  { id: 'fireworks', label: 'Фейерверк', description: 'Частые цветные залпы', icon: Sparkles },
  { id: 'rain', label: 'Дождь', description: 'Капли и круги на мокрой улице', icon: CloudRain },
  { id: 'solar', label: 'Солнечный ветер', description: 'Корональный свет, потоки плазмы и искры', icon: Sun },
  { id: 'meteors', label: 'Метеоры', description: 'Падающие звёзды и следы', icon: Telescope },
  { id: 'notes', label: 'Ноты', description: 'Светящиеся ноты на волнистом стане', icon: Music2 },
  { id: 'liquid', label: 'Жидкое стекло', description: 'Переливы света в стекле', icon: Droplets },
  { id: 'mix-flow', label: 'Переливы Luma', description: 'Переливы микса в цветах обложки', icon: Wind },
] as const;

export interface SceneOptionsProps { appearance: Appearance; change(value: Appearance): void }

export function NowPlayingOptions({ appearance, change }: SceneOptionsProps) {
  const t = useText();
  return <div className="scene-options">
    <div className="scene-option-group">
      <h3>{t("Тип фона")}</h3>
      <div className="scene-layouts" role="group" aria-label={t("Компоновка «Сейчас играет»")}>
        {LAYOUTS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={appearance.hero === id} onClick={() => change({ ...appearance, hero: id })}>
          <Icon size={17} /><span>{t(label)}</span>
        </button>)}
      </div>
    </div>
    <div className="scene-option-group">
      <h3>{t("Фоновый эффект")}</h3>
      <div className="scene-choice-grid" role="group" aria-label={t("Фон «Сейчас играет»")}>
        {EFFECTS.map(({ id, label, description, icon: Icon }) => <button key={id} type="button" aria-pressed={appearance.effect === id} aria-label={t(label)} title={t(description)}
          className="scene-choice" onClick={() => change({ ...appearance, effect: id })}>
          <span className="scene-choice-preview">
            <SceneBackground effect={id} strength={0.82} visible={false} />
            <Icon size={16} aria-hidden="true" />{appearance.effect === id && <Check className="scene-choice-check" size={13} aria-hidden="true" />}
          </span>
          <strong>{t(label)}</strong><small>{t(description)}</small>
        </button>)}
      </div>
    </div>
    <label className="scene-strength"><span>{t("Яркость эффекта")}</span>
      <input className="range" type="range" min="0.25" max="1" step="0.05" value={appearance.effectStrength} disabled={appearance.effect === 'off'}
        aria-valuetext={`${Math.round(appearance.effectStrength * 100)} %`} style={{ '--filled': `${(appearance.effectStrength - 0.25) / 0.75 * 100}%` } as CSSProperties}
        onChange={(event) => change({ ...appearance, effectStrength: event.currentTarget.valueAsNumber })} />
      <output>{Math.round(appearance.effectStrength * 100)} %</output>
    </label>
  </div>;
}

export function NowPlayingDialog({ appearance, change, close, tint, track, playing, sample }: SceneOptionsProps & { close(): void; tint: string; track: TrackDisplay | null; playing: boolean; sample?: ReadSpectrum }) {
  const t = useText();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  function dismiss() { ref.current?.close(); close(); }
  return (
    <dialog ref={ref} className="cover-dialog scene-dialog" aria-labelledby="scene-dialog-title"
      onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => { if (event.currentTarget === event.target) dismiss(); }}>
      <div className="cover-editor">
        <header className="dialog-header">
          <div className="dialog-mark"><Palette size={21} /></div>
          <div><p className="overline">{t("Сейчас играет")}</p><h2 id="scene-dialog-title">{t("Оформление")}</h2></div>
          <button type="button" className="icon-button" aria-label={t("Закрыть оформление")} title={t("Закрыть")} onClick={dismiss}><X size={20} /></button>
        </header>
        <div data-effect={appearance.effect} className={`scene-dialog-preview scene-preview-${appearance.hero}`} style={{ '--preview-tone': tint } as CSSProperties} aria-hidden="true">
          <SceneBackground effect={appearance.effect} tone={track ? tint : undefined} strength={appearance.effectStrength} tempo={appearance.effectTempo} visible={appearance.motion}
            animate={playing} sample={appearance.audioReactive && playing ? sample : undefined} />
          {appearance.hero === 'vinyl' ? <VinylRecord className="scene-preview-record" track={track} animate={appearance.motion && playing} />
            : <Artwork track={track} imageUrl={appearance.effect === 'off' && (appearance.hero === 'blur' || appearance.hero === 'cover') ? track?.backdropUrl : undefined} className="scene-preview-art" />}
          <div className="scene-preview-copy"><p className="overline">{t("Предпросмотр")}</p><strong>{track?.title ?? t("Ваша музыка")}</strong><span>{track?.artist ?? APP_NAME}</span></div>
        </div>
        <NowPlayingOptions appearance={appearance} change={change} />
        <div className="scene-dialog-tuning">
          <label>{t("Темп фона")}{" "}<select aria-label={t("Темп фона")} value={appearance.effectTempo} disabled={appearance.effect === 'off'} onChange={(event) => change({ ...appearance, effectTempo: event.currentTarget.value as EffectTempo })}>
            {Object.entries(EFFECT_TEMPOS).map(([id, { label }]) => <option key={id} value={id}>{t(label)}</option>)}
          </select></label>
          <label><input type="checkbox" checked={appearance.audioReactive} disabled={appearance.effect === 'off'} onChange={(event) => change({ ...appearance, audioReactive: event.currentTarget.checked })} />{" "}{t("Реакция на локальный звук")}</label>
        </div>
        <footer className="dialog-footer cover-footer">
          <span className="scene-dialog-hint">{t("Применяется сразу и сохраняется автоматически.")}</span>
          <button type="button" className="button primary-button" onClick={dismiss}>{t("Готово")}</button>
        </footer>
      </div>
    </dialog>
  );
}
