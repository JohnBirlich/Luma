import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowUpCircle, AudioLines, Bell, Check, HardDrive, Headphones, Keyboard, Music2, Palette, Play, Plug, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { ACCENTS, accentFor, EFFECT_TEMPOS, SEEK_STEPS, THEMES } from '../shared/customization';
import type { Appearance, EffectTempo, LibraryLayout, PlaybackPreferences, SeekStep, StartPage, ThemeName } from '../shared/customization';
import type { Track } from '../shared/media';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import { ReleaseLink, useInstalledBuild } from './About';
import { Artwork } from './Artwork';
import { MenuGroup, MenuItem } from './Menu';
import { VolumeControl } from './PlaybackControls';
import type { VolumeProps } from './PlaybackControls';
import { VkBrowserLink } from './VkMusic';
import { NowPlayingOptions } from './NowPlayingOptions';
import { SceneBackground } from './SceneBackground';
import { VinylRecord } from './VinylRecord';


function ReleaseSettings() {
  const info = useInstalledBuild();
  return <SettingCard title="Версия Luma" detail={info ? `Установлена версия ${info.version}.` : info === null ? 'Не удалось прочитать версию.' : 'Читаем версию сборки…'}>
    <p className="setting-body-copy">На GitHub доступны примечания к версиям, установщик и portable. Загрузка и установка запускаются вручную.</p>
    <div className="settings-actions"><ReleaseLink className="button outline-button" /></div>
  </SettingCard>;
}

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
          <SceneBackground effect={appearance.effect} strength={appearance.effectStrength} tempo={appearance.effectTempo} animate={appearance.motion} />
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
  localCount: number;
  recentCount: number;
  eqEnabled: boolean;
  volumeControls: VolumeProps;
  openEqualizer(): void;
  openRecent(): void;
  clearRecent(): void;
  openDiagnostics(): void;
  changeAppearance(appearance: Appearance): void;
  changePlayback(playback: PlaybackPreferences): void;
  toggleDemos(): void;
  reset(): void;
  goToMenu(): void;
}

const SECTIONS = [
  { id: 'look', label: 'Внешний вид', detail: 'Тема, акцент и анимации', icon: Palette },
  { id: 'now', label: 'Сейчас играет', detail: 'Компоновка, эффекты и яркость фона', icon: Headphones },
  { id: 'sound', label: 'Звук и эквалайзер', detail: 'Громкость, пресеты и оригинальное качество файлов', icon: AudioLines },
  { id: 'playback', label: 'Воспроизведение', detail: 'Стартовая страница, перемотка и автопереход', icon: SlidersHorizontal },
  { id: 'library', label: 'Медиатека', detail: 'Вид списка треков и демоколлекция', icon: Music2 },
] as const;
const APP_SECTIONS = [
  { id: 'notices', label: 'Уведомления', detail: 'Подсказки в интерфейсе и ошибки', icon: Bell },
  { id: 'integrations', label: 'Интеграции', detail: 'Системная медиапанель и VK', icon: Plug },
  { id: 'storage', label: 'Хранилище', detail: 'Локальная коллекция, история и журнал', icon: HardDrive },
  { id: 'keys', label: 'Горячие клавиши', detail: 'Управление плеером с клавиатуры', icon: Keyboard },
  { id: 'updates', label: 'Обновления приложения', detail: 'Версия сборки и переход к релизам', icon: ArrowUpCircle },
] as const;
type Section = typeof SECTIONS[number] | typeof APP_SECTIONS[number];
const shortcuts = [
  ['Пробел / K', 'Воспроизведение и пауза'], ['← / →', 'Перемотка'], ['F / Esc', 'Развернуть трек / выйти из большого плеера'],
  ['M', 'Выключить или вернуть звук'], ['Q', 'Очередь в обычном плеере'], ['Ctrl + O', 'Добавить музыку'],
  ['Ctrl + ,', 'Настройки'], ['Ctrl + Shift + L', 'Диагностика'],
];

export function SettingsPage(props: SettingsProps) {
  const { appearance, playback, changeAppearance, changePlayback } = props;
  const [section, setSection] = useState<Section>();
  const [confirmClear, setConfirmClear] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const color = appearance.accent ?? THEMES[appearance.theme].accent;
  const accent = accentFor(appearance);
  useEffect(() => { root.current?.parentElement?.scrollTo({ top: 0 }); }, [section]);
  const back = () => {
    setConfirmClear(false);
    if (section) setSection(undefined);
    else props.goToMenu();
  };
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
          {!section && <>
            <MenuGroup label="Плеер">{SECTIONS.map((item) => <MenuItem key={item.id} icon={item.icon} title={item.label} detail={item.detail} select={() => setSection(item)} />)}</MenuGroup>
            <MenuGroup label="Приложение">{APP_SECTIONS.map((item) => <MenuItem key={item.id} icon={item.icon} title={item.label} detail={item.detail} select={() => setSection(item)} />)}</MenuGroup>
          </>}
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
          {section?.id === 'now' && <>
            <SettingCard title="Экран «Сейчас играет»">
              <NowPlayingOptions appearance={appearance} change={changeAppearance} />
              <ToggleRow title="Цвет фона из обложки" detail="Если выключено, фон использует акцент темы." enabled={appearance.coverColors} change={() => changeAppearance({ ...appearance, coverColors: !appearance.coverColors })} />
              <ToggleRow title="Реакция на музыку" detail="Фон откликается на частоты локального трека. При отключении остаётся обычная анимация." enabled={appearance.audioReactive} change={() => changeAppearance({ ...appearance, audioReactive: !appearance.audioReactive })} />
              <label className="setting-row select-row"><span><strong>Темп фона</strong><small>Скорость анимации, не скорость песни.</small></span>
                <select value={appearance.effectTempo} disabled={appearance.effect === 'off'} onChange={(event) => changeAppearance({ ...appearance, effectTempo: event.currentTarget.value as EffectTempo })}>
                  {Object.entries(EFFECT_TEMPOS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            </SettingCard>
            <SettingCard title="Полноэкранный плеер">
              <ToggleRow title="Разворачивать на весь монитор" detail="Если выключено, большой плеер открывается внутри окна Luma." enabled={appearance.nativeFullscreen} change={() => changeAppearance({ ...appearance, nativeFullscreen: !appearance.nativeFullscreen })} />
              <ToggleRow title="Показывать следующие треки" detail="Открывать очередь «Далее» вместе с большим плеером." enabled={appearance.fullscreenQueue} change={() => changeAppearance({ ...appearance, fullscreenQueue: !appearance.fullscreenQueue })} />
            </SettingCard>
          </>}
          {section?.id === 'sound' && <SettingCard title="Локальный звук" detail="Luma читает оригинальные файлы и не перекодирует их. Для онлайн-потоков доступны громкость и транспорт, но не эквалайзер.">
            <div className="setting-row settings-volume"><span><strong>Громкость плеера</strong><small>Меняется и в нижней панели.</small></span><VolumeControl {...props.volumeControls} /></div>
            <div className="setting-row"><span><strong>Эквалайзер</strong><small>{props.eqEnabled ? 'Включён' : 'Выключен'} · пять полос, пресеты и предусиление.</small></span>
              <button type="button" className="button outline-button" onClick={props.openEqualizer} aria-haspopup="dialog">Настроить</button>
            </div>
          </SettingCard>}
          {section?.id === 'playback' && <>
            <SettingCard title="Запуск приложения">
              <label className="setting-row select-row"><span><strong>Открывать при запуске</strong><small>Сработает при следующем открытии Luma.</small></span>
                <select value={playback.startPage} onChange={(event) => changePlayback({ ...playback, startPage: event.currentTarget.value as StartPage })}>
                  <option value="player">Главная</option><option value="library">Медиатека</option><option value="vk">VK Музыка</option>
                </select>
              </label>
            </SettingCard>
            <SettingCard title="Воспроизведение в Luma">
              <label className="setting-row select-row"><span><strong>Шаг перемотки</strong><small>Для горячих клавиш ← и →.</small></span>
                <select value={playback.seekStep} onChange={(event) => changePlayback({ ...playback, seekStep: Number(event.currentTarget.value) as SeekStep })}>
                  {SEEK_STEPS.map((value) => <option key={value} value={value}>{value} с</option>)}
                </select>
              </label>
              <ToggleRow title="Следующий трек автоматически" detail="Если выключено, плеер остановится в конце. Повтор одного трека действует отдельно." enabled={playback.autoNext} change={() => changePlayback({ ...playback, autoNext: !playback.autoNext })} />
            </SettingCard>
            <div className="settings-footer-note"><Settings2 size={16} /><span>Звук VK настраивается в официальном виджете. Очередь Luma работает с файлами и онлайн-записями; эквалайзер — с файлами.</span></div>
          </>}
          {section?.id === 'library' && <SettingCard title="Коллекция Luma">
            <label className="setting-row select-row"><span><strong>Вид медиатеки</strong><small>Списком или плиткой с крупными обложками.</small></span>
              <select value={appearance.libraryLayout} onChange={(event) => changeAppearance({ ...appearance, libraryLayout: event.currentTarget.value as LibraryLayout })}>
                <option value="list">Списком</option><option value="grid">Плиткой</option>
              </select>
            </label>
            <ToggleRow title="Встроенные демотреки" detail="Показывать демотреки в локальной медиатеке." enabled={props.showDemos} change={props.toggleDemos} disabled={!props.libraryReady} />
          </SettingCard>}
          {section?.id === 'notices' && <SettingCard title="Подсказки Luma">
            <ToggleRow title="Показывать уведомления об успехе" detail="Сообщения об импорте, очереди и сохранении. Ошибки видны всегда." enabled={playback.successNotices} change={() => changePlayback({ ...playback, successNotices: !playback.successNotices })} />
          </SettingCard>}
          {section?.id === 'integrations' && <>
            <SettingCard title="Системная медиапанель">
              <ToggleRow title="Передавать данные трека системе" detail="Название, исполнитель и обложка для медиапанели. Медиаклавиши работают отдельно." enabled={playback.publishTrack} change={() => changePlayback({ ...playback, publishTrack: !playback.publishTrack })} />
            </SettingCard>
            <SettingCard title="VK Музыка" detail="Вход и личная музыка открываются на официальном сайте. Luma не читает пароль или данные аккаунта.">
              <div className="settings-actions"><VkBrowserLink /></div>
            </SettingCard>
          </>}
          {section?.id === 'storage' && <>
            <SettingCard title="Локальный профиль" detail="Настройки, обложки и история остаются на устройстве; на Windows исходные аудиофайлы не копируются при добавлении.">
              <dl className="settings-storage"><div><dt>Треков с устройства</dt><dd>{props.localCount}</dd></div><div><dt>Недавних треков</dt><dd>{props.recentCount}</dd></div></dl>
              <ToggleRow title="Запоминать прослушанные треки" detail="Хранить локально до 60 последних треков. При отключении новая история не записывается." enabled={playback.rememberRecent} change={() => changePlayback({ ...playback, rememberRecent: !playback.rememberRecent })} />
              <div className="settings-actions">
                <button type="button" className="button outline-button" onClick={props.openRecent}>Недавно слушали</button>
                <button type="button" className="button outline-button" disabled={!props.recentCount} onClick={() => setConfirmClear((value) => !value)} aria-expanded={confirmClear}>Очистить историю</button>
              </div>
              {confirmClear && <div className="settings-confirm"><p>Очистить список прослушанного? Музыка и избранное останутся.</p>
                <button type="button" className="text-button" onClick={() => { props.clearRecent(); setConfirmClear(false); }}>Удалить историю</button>
                <button type="button" className="text-button" onClick={() => setConfirmClear(false)}>Отмена</button>
              </div>}
            </SettingCard>
            <SettingCard title="Журнал диагностики" detail="До 300 событий запуска и воспроизведения. Здесь нет названий песен, паролей или путей к файлам.">
              <div className="settings-actions"><button type="button" className="button outline-button" onClick={props.openDiagnostics}>Открыть диагностику</button></div>
            </SettingCard>
          </>}
          {section?.id === 'keys' && <SettingCard title="Клавиатура" detail="Команды треков действуют при локальном воспроизведении.">
            <dl className="settings-shortcuts">{shortcuts.map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
          </SettingCard>}
          {section?.id === 'updates' && <ReleaseSettings />}
        </div>
        {(!section || section.id === 'look' || section.id === 'now') && <ThemePreview appearance={appearance} track={props.previewTrack} tint={props.tint} />}
      </div>
    </div>
  );
}
