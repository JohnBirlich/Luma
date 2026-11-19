import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, AudioLines, Check, Headphones, Music2, Palette, Play, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { ACCENTS, accentFor, SEEK_STEPS, THEMES } from '../shared/customization';
import type { Appearance, LibraryLayout, PlaybackPreferences, SeekStep, StartPage, ThemeName } from '../shared/customization';
import type { Track } from '../shared/media';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import { Artwork } from './Artwork';
import { MenuGroup, MenuItem } from './Menu';
import { NowPlayingOptions } from './NowPlayingOptions';
import { SceneBackground } from './SceneBackground';
import { VinylRecord } from './VinylRecord';


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
  const picture = track?.backdropUrl ?? track?.artworkUrl ?? DEFAULT_ARTWORK_URL;
  return (
    <aside className="settings-preview" aria-label="Предпросмотр оформления">
      <div className="settings-preview-heading"><p className="overline">Предпросмотр</p><span>{THEMES[appearance.theme].name}</span></div>
      <div className="settings-preview-window" aria-hidden="true">
        <div className="settings-preview-chrome"><AudioLines size={13} /><span>Luma Player</span><i /><i /><i /></div>
        <div className={`settings-preview-hero settings-preview-${appearance.hero}${appearance.effect !== 'off' ? ' settings-preview-has-effect' : ''}`} style={{ '--sample-tone': tint, '--scene-tone': tint } as CSSProperties}>
          <SceneBackground effect={appearance.effect} strength={appearance.effectStrength} />
          {picture && appearance.hero !== 'vinyl' && appearance.hero !== 'center' && <img src={picture} alt="" />}
          {appearance.hero === 'center' && <Artwork track={track} className="settings-preview-center-art" />}
          {appearance.hero === 'vinyl' && <VinylRecord className="settings-preview-record" track={track} animate={appearance.motion} />}
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
  goToMenu(): void;
}

const SECTIONS = [
  { id: 'look', label: 'Внешний вид', detail: 'Тема, акцент и анимации', icon: Palette },
  { id: 'now', label: 'Сейчас играет', detail: 'Компоновка, эффекты и яркость фона', icon: Headphones },
  { id: 'playback', label: 'Воспроизведение', detail: 'Стартовая страница, перемотка и автопереход', icon: SlidersHorizontal },
  { id: 'library', label: 'Медиатека', detail: 'Вид списка треков и демоколлекция', icon: Music2 },
] as const;
type Section = typeof SECTIONS[number];

export function SettingsPage(props: SettingsProps) {
  const { appearance, playback, changeAppearance, changePlayback } = props;
  const [section, setSection] = useState<Section>();
  const root = useRef<HTMLDivElement>(null);
  const color = appearance.accent ?? THEMES[appearance.theme].accent;
  const accent = accentFor(appearance);
  useEffect(() => { root.current?.parentElement?.scrollTo({ top: 0 }); }, [section]);
  const back = () => section ? setSection(undefined) : props.goToMenu();
  return (
    <div className="page settings-page" ref={root}>
      <header className="page-header settings-header">
        <button type="button" className="icon-button settings-back" aria-label={section ? 'Назад к настройкам' : 'Назад в меню'} title="Назад" onClick={back}><ArrowLeft size={19} /></button>
        <div><p className="overline page-kicker"><span />{section ? 'Настройки' : 'Ваш плеер'}</p><h1>{section?.label ?? 'Настройки'}</h1></div>
        {!section && <button type="button" className="button outline-button settings-reset" aria-label="Сбросить настройки" onClick={props.reset} disabled={!props.libraryReady} title="Вернуть настройки по умолчанию"><RotateCcw size={16} /> <span>Сбросить настройки</span></button>}
      </header>
      <p className="settings-intro">{section?.detail ?? 'Выберите раздел, чтобы настроить Luma под себя.'}</p>
      <div className="settings-layout">
        <div className="settings-stack">
          {!section && <MenuGroup label="Разделы настроек">
            {SECTIONS.map((item) => <MenuItem key={item.id} icon={item.icon} title={item.label} detail={item.detail} select={() => setSection(item)} />)}
          </MenuGroup>}
          {section?.id === 'look' && <>
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
              <ToggleRow title="Компактная боковая панель" detail="Оставить только иконки на широком экране." enabled={appearance.compactSidebar} change={() => changeAppearance({ ...appearance, compactSidebar: !appearance.compactSidebar })} />
              <ToggleRow title="Анимации" detail="Плавные переходы, живые фоны и индикатор звука." enabled={appearance.motion} change={() => changeAppearance({ ...appearance, motion: !appearance.motion })} />
            </SettingCard>
          </>}
          {section?.id === 'now' && <SettingCard title="Экран «Сейчас играет»">
            <NowPlayingOptions appearance={appearance} change={changeAppearance} />
            <ToggleRow title="Цвет фона из обложки" detail="Если выключено, фон использует акцент темы." enabled={appearance.coverColors} change={() => changeAppearance({ ...appearance, coverColors: !appearance.coverColors })} />
          </SettingCard>}
          {section?.id === 'playback' && <>
            <SettingCard title="Запуск приложения">
              <label className="setting-row select-row"><span><strong>Открывать при запуске</strong><small>Сработает при следующем открытии Luma.</small></span>
                <select value={playback.startPage} onChange={(event) => changePlayback({ ...playback, startPage: event.currentTarget.value as StartPage })}>
                  <option value="player">Главная</option><option value="library">Медиатека</option><option value="vk">VK Музыка</option>
                </select>
              </label>
            </SettingCard>
            <SettingCard title="Локальное воспроизведение">
              <label className="setting-row select-row"><span><strong>Шаг перемотки</strong><small>Для горячих клавиш ← и →.</small></span>
                <select value={playback.seekStep} onChange={(event) => changePlayback({ ...playback, seekStep: Number(event.currentTarget.value) as SeekStep })}>
                  {SEEK_STEPS.map((value) => <option key={value} value={value}>{value} с</option>)}
                </select>
              </label>
              <ToggleRow title="Следующий трек автоматически" detail="Если выключено, плеер остановится в конце. Повтор одного трека действует отдельно." enabled={playback.autoNext} change={() => changePlayback({ ...playback, autoNext: !playback.autoNext })} />
            </SettingCard>
            <div className="settings-footer-note"><Settings2 size={16} /><span>Звук VK настраивается в официальном виджете. Очередь и эквалайзер Luma работают с локальной музыкой.</span></div>
          </>}
          {section?.id === 'library' && <SettingCard title="Коллекция Luma">
            <label className="setting-row select-row"><span><strong>Вид медиатеки</strong><small>Списком или плиткой с крупными обложками.</small></span>
              <select value={appearance.libraryLayout} onChange={(event) => changeAppearance({ ...appearance, libraryLayout: event.currentTarget.value as LibraryLayout })}>
                <option value="list">Списком</option><option value="grid">Плиткой</option>
              </select>
            </label>
            <ToggleRow title="Встроенные демотреки" detail="Показывать демотреки в локальной медиатеке." enabled={props.showDemos} change={props.toggleDemos} disabled={!props.libraryReady} />
          </SettingCard>}
        </div>
        {(!section || section.id === 'look' || section.id === 'now') && <ThemePreview appearance={appearance} track={props.previewTrack} tint={props.tint} />}
      </div>
    </div>
  );
}
