import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AudioLines, Check, Disc3, Focus, Image, Palette, Play, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { ACCENTS, accentFor, SEEK_STEPS, THEMES } from '../shared/customization';
import type { Appearance, HeroStyle, PlaybackPreferences, SeekStep, StartPage, ThemeName } from '../shared/customization';
import type { Track } from '../shared/media';
import { Artwork } from './Artwork';

const HERO_OPTIONS = [
  { id: 'cover', label: 'Обложка', detail: 'Чёткое изображение', icon: Image },
  { id: 'blur', label: 'Размытие', detail: 'Мягкий свет', icon: Focus },
  { id: 'vinyl', label: 'Винил', detail: 'Обложка на пластинке', icon: Disc3 },
] as const;

function ToggleRow({ title, detail, enabled, change, disabled }: {
  title: string; detail: string; enabled: boolean; change(): void; disabled?: boolean;
}) {
  return (
    <div className="setting-row">
      <div><strong>{title}</strong><small>{detail}</small></div>
      <button type="button" className="settings-switch" role="switch" aria-label={title} aria-checked={enabled} onClick={change} disabled={disabled}><i aria-hidden="true" /></button>
    </div>
  );
}

function SettingCard({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <section className="setting-card" aria-label={title}>
      <header><h2>{title}</h2>{detail && <p>{detail}</p>}</header>
      {children}
    </section>
  );
}

function ThemeSelect({ value, change }: { value: ThemeName; change(theme: ThemeName): void }) {
  return (
    <div className="theme-grid" role="group" aria-label="Темы плеера">
      {(Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][]).map(([id, theme]) => (
        <button key={id} className="theme-option" type="button" aria-pressed={id === value} onClick={() => change(id)}>
          <span className="theme-option-preview" style={{ '--swatch-side': theme.side, '--swatch-panel': theme.panel, '--swatch-glow': theme.glow, '--swatch-accent': theme.accent } as CSSProperties} aria-hidden="true">
            <span /><span><i /><i /><i /></span><b />
          </span>
          <span className="theme-option-label">{theme.name}{id === value && <Check size={14} aria-hidden="true" />}</span>
        </button>
      ))}
    </div>
  );
}

function ThemePreview({ appearance, track, tint }: { appearance: Appearance; track: Track | null; tint: string }) {
  const picture = track?.backdropUrl ?? track?.artworkUrl;
  return (
    <aside className="settings-preview" aria-label="Предпросмотр оформления">
      <div className="settings-preview-heading"><p className="overline">Предпросмотр</p><span>{THEMES[appearance.theme].name}</span></div>
      <div className="settings-preview-window" aria-hidden="true">
        <div className="settings-preview-chrome"><AudioLines size={13} /><span>Luma Player</span><i /><i /><i /></div>
        <div className={`settings-preview-hero settings-preview-${appearance.hero}`} style={{ '--sample-tone': tint } as CSSProperties}>
          {picture && appearance.hero !== 'vinyl' && <img src={picture} alt="" />}
          {appearance.hero === 'vinyl' && <div className="settings-preview-record"><Artwork track={track} /></div>}
          <div><small>СЕЙЧАС ИГРАЕТ</small><strong>{track?.title ?? 'Ваша музыка'}</strong><span>{track?.artist ?? 'Luma Player'}</span></div>
        </div>
        <div className="settings-preview-controls"><i /><i /><b><Play size={12} fill="currentColor" /></b><i /><i /></div>
      </div>
      <p>Изменения применяются сразу. Настройки и обложки сохраняются в профиле Luma.</p>
    </aside>
  );
}

interface SettingsProps {
  appearance: Appearance;
  playback: PlaybackPreferences;
  showDemos: boolean;
  libraryReady: boolean;
  previewTrack: Track | null;
  tint: string;
  changeAppearance(appearance: Appearance): void;
  changePlayback(playback: PlaybackPreferences): void;
  toggleDemos(): void;
  reset(): void;
}

export function SettingsPage(props: SettingsProps) {
  const { appearance, playback, changeAppearance, changePlayback } = props;
  const [tab, setTab] = useState<'look' | 'playback'>('look');
  const color = appearance.accent ?? THEMES[appearance.theme].accent;
  const accent = accentFor(appearance);
  const onHero = (hero: HeroStyle) => changeAppearance({ ...appearance, hero });
  return (
    <div className="page settings-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Ваш плеер</p><h1>Настройки</h1></div>
        <button type="button" className="button outline-button settings-reset" onClick={props.reset} disabled={!props.libraryReady} title="Вернуть настройки по умолчанию"><RotateCcw size={16} /> Сбросить настройки</button>
      </header>
      <p className="settings-intro">Выберите оформление и настройте поведение плеера.</p>
      <div className="settings-nav" role="group" aria-label="Разделы настроек">
        <button type="button" aria-pressed={tab === 'look'} onClick={() => setTab('look')}><Palette size={16} /> Оформление</button>
        <button type="button" aria-pressed={tab === 'playback'} onClick={() => setTab('playback')}><SlidersHorizontal size={16} /> Воспроизведение</button>
      </div>
      <div className="settings-layout">
        <div className="settings-stack">
          {tab === 'look' ? <>
            <SettingCard title="Тема" detail="Меняет фон, панели и цвет элементов управления.">
              <ThemeSelect value={appearance.theme} change={(theme) => changeAppearance({ ...appearance, theme })} />
            </SettingCard>
            <SettingCard title="Цвет акцента">
              <div className="accent-controls" role="group" aria-label="Палитра акцентов">
                {ACCENTS.map(({ name, color: value }) => <button key={value} type="button" className="accent-swatch" title={name} aria-label={`Акцент: ${name}`}
                  aria-pressed={appearance.accent === value} onClick={() => changeAppearance({ ...appearance, accent: value })} style={{ '--swatch': value } as CSSProperties}>
                  {appearance.accent === value && <Check size={15} aria-hidden="true" />}
                </button>)}
                <label className="custom-accent"><input type="color" value={color} aria-label="Свой цвет акцента" onChange={(event) => changeAppearance({ ...appearance, accent: event.currentTarget.value })} /><span>{color.toUpperCase()}</span></label>
                {appearance.accent && <button className="text-button" type="button" onClick={() => changeAppearance({ ...appearance, accent: null })}>Цвет темы</button>}
              </div>
              {accent !== color && <p className="setting-hint">Акцент слегка осветлён, чтобы текст был читаемым.</p>}
            </SettingCard>
            <SettingCard title="Экран «Сейчас играет»">
              <div className="hero-style-grid" role="group" aria-label="Вид экрана Сейчас играет">
                {HERO_OPTIONS.map(({ id, label, detail, icon: Icon }) => <button key={id} type="button" className="hero-style-option" aria-pressed={appearance.hero === id} onClick={() => onHero(id)}>
                  <Icon size={17} /><span><strong>{label}</strong><small>{detail}</small></span>
                </button>)}
              </div>
              <ToggleRow title="Цвет фона из обложки" detail="Если выключено, фон использует акцент темы." enabled={appearance.coverColors} change={() => changeAppearance({ ...appearance, coverColors: !appearance.coverColors })} />
              <ToggleRow title="Анимации" detail="Плавные переходы и анимация индикатора звука." enabled={appearance.motion} change={() => changeAppearance({ ...appearance, motion: !appearance.motion })} />
            </SettingCard>
          </> : <>
            <SettingCard title="Запуск приложения">
              <label className="setting-row select-row"><div><strong>Открывать при запуске</strong><small>Сработает при следующем открытии Luma.</small></div>
                <select value={playback.startPage} onChange={(event) => changePlayback({ ...playback, startPage: event.currentTarget.value as StartPage })}>
                  <option value="player">Сейчас играет</option><option value="library">Моя музыка</option><option value="vk">VK Музыка</option>
                </select>
              </label>
            </SettingCard>
            <SettingCard title="Локальное воспроизведение">
              <label className="setting-row select-row"><div><strong>Шаг перемотки</strong><small>Для горячих клавиш ← и →.</small></div>
                <select value={playback.seekStep} onChange={(event) => changePlayback({ ...playback, seekStep: Number(event.currentTarget.value) as SeekStep })}>
                  {SEEK_STEPS.map((value) => <option key={value} value={value}>{value} с</option>)}
                </select>
              </label>
              <ToggleRow title="Следующий трек автоматически" detail="Если выключено, плеер остановится в конце. Повтор одного трека действует отдельно." enabled={playback.autoNext} change={() => changePlayback({ ...playback, autoNext: !playback.autoNext })} />
              <ToggleRow title="Встроенные демотреки" detail="Показывать демотреки в локальной медиатеке." enabled={props.showDemos} change={props.toggleDemos} disabled={!props.libraryReady} />
            </SettingCard>
            <div className="settings-footer-note"><Settings2 size={16} /><span>Настройки звука VK остаются в официальном виджете. Очередь и эквалайзер Luma работают с локальной музыкой.</span></div>
          </>}
        </div>
        <ThemePreview appearance={appearance} track={props.previewTrack} tint={props.tint} />
      </div>
    </div>
  );
}
