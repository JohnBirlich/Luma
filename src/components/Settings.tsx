import { useText } from '../i18n/context';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowUpCircle, AudioLines, Bell, Bug, Check, HardDrive, Headphones, Keyboard, Monitor, Music2, Palette, Play, Plug, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { ACCENTS, accentFor, CROSSFADE_TIMES, DATA_LANGUAGES, EFFECT_TEMPOS, formatCount, SEEK_STEPS, THEMES, WIDGET_BACKGROUNDS, WIDGET_SHORTCUT } from '../shared/customization';
import type { Appearance, CrossfadeTime, DataLanguage, EffectTempo, LibraryLayout, PlaybackPreferences, SeekStep, StartPage, ThemeName, WidgetBackground } from '../shared/customization';
import { describeAudioFormat, describeStream, NETWORK_MODES, STREAM_QUALITIES } from '../shared/audio-quality';
import type { AudioQuality, NetworkMode, StreamQuality } from '../shared/audio-quality';
import { UI_LANGUAGES } from '../shared/ui-language';
import type { UiLanguage } from '../shared/ui-language';
import type { Track } from '../shared/media';
import type { FloatStatus } from '../shared/float-output';
import type { LastFmIssue, LastFmStatus } from '../shared/lastfm';
import type { StreamCacheInfo } from '../shared/stream-cache';
import { localLibrary } from '../data/library';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import { UpdatesPanel } from './UpdatesPanel';
import { useInstalledBuild } from './About';
import { Artwork } from './Artwork';
import { WidgetPreview } from './DesktopWidget';
import { MenuGroup, MenuItem } from './Menu';
import { VolumeControl } from './PlaybackControls';
import type { VolumeProps } from './PlaybackControls';
import { NowPlayingOptions } from './NowPlayingOptions';
import { SceneBackground } from './SceneBackground';
import { DiscordSettings } from './DiscordSettings';
import type { DiscordPreferences } from '../shared/discord-presence';
import { SleepTimer } from './SleepTimer';
import type { SleepMinutes } from '../shared/sleep-timer';
import { VinylRecord } from './VinylRecord';


function ReleaseSettings() {
  const t = useText();
  const info = useInstalledBuild();
  return <SettingCard title={t("Версия Luma")} detail={info ? t("Установлена версия {0}.", info.version) : info === null ? t("Не удалось прочитать версию.") : t("Читаем версию сборки…")}>
    <UpdatesPanel />
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
  const t = useText();
  return (
    <div className="theme-grid" role="group" aria-label={t("Темы плеера")}>
      {(Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][]).map(([id, theme]) => (
        <button key={id} className="theme-option" data-theme-choice={id} type="button" aria-pressed={id === value} onClick={() => change(id)}>
          <span className="theme-option-preview" style={{ '--swatch-side': theme.side, '--swatch-panel': theme.panel, '--swatch-glow': theme.glow, '--swatch-accent': theme.accent } as CSSProperties} aria-hidden="true">
            <span /><span><i /><i /><i /></span><b />
          </span>
          <span className="theme-option-label">{t(theme.name)}{id === value && <Check size={14} aria-hidden="true" />}</span>
        </button>
      ))}
    </div>
  );
}

function ThemePreview({ appearance, track, tint }: { appearance: Appearance; track: Track | null; tint: string }) {
  const t = useText();
  const picture = track?.backdropUrl ?? track?.artworkUrl ?? DEFAULT_ARTWORK_URL;
  return (
    <aside className="settings-preview" aria-label={t("Предпросмотр оформления")}>
      <div className="settings-preview-heading"><p className="overline">{t("Предпросмотр")}</p><span>{t(THEMES[appearance.theme].name)}</span></div>
      <div className="settings-preview-window" aria-hidden="true">
        <div className="settings-preview-chrome"><AudioLines size={13} /><span>Luma Player</span><i /><i /><i /></div>
        <div data-effect={appearance.effect} className={`settings-preview-hero settings-preview-${appearance.hero}`} style={{ '--sample-tone': tint, '--scene-tone': tint } as CSSProperties}>
          <SceneBackground effect={appearance.effect} tone={track ? tint : undefined} strength={appearance.effectStrength} tempo={appearance.effectTempo} animate={appearance.motion} visible={appearance.motion} />
          {appearance.effect === 'off' && picture && appearance.hero !== 'vinyl' && appearance.hero !== 'center' && <img src={picture} alt="" />}
          {appearance.hero === 'center' && <Artwork track={track} className="settings-preview-center-art" />}
          {appearance.hero === 'vinyl' && <VinylRecord className="settings-preview-record" track={track} animate={appearance.motion} />}
          <div><small>{t("СЕЙЧАС ИГРАЕТ")}</small><strong>{track?.title ?? t("Ваша музыка")}</strong><span>{track?.artist ?? 'Luma Player'}</span></div>
        </div>
        <div className="settings-preview-controls"><i /><i /><b><Play size={12} fill="currentColor" /></b><i /><i /></div>
      </div>
      <p>{t("Изменения применяются сразу. Настройки и обложки сохраняются в профиле Luma.")}</p>
    </aside>
  );
}

interface SettingsProps {
  uiLanguage: UiLanguage;
  changeLanguage(value: UiLanguage): void;
  appearance: Appearance;
  effectiveAppearance: Appearance;
  locale: string;
  audioQuality: AudioQuality;
  nativeFloat: boolean;
  floatStatus: FloatStatus;
  changeFloat(value: boolean): void;
  playingStream?: { url: string; cached: boolean };
  metered: boolean;
  connected: boolean;
  autoLyrics: boolean;
  exportLyrics: boolean;
  playback: PlaybackPreferences;
  sleepDeadline?: number;
  changeSleepTimer(minutes?: SleepMinutes): void;
  localFallback: boolean;
  toggleLocalFallback(): void;
  discord: DiscordPreferences;
  changeDiscord(options: DiscordPreferences): void;
  showDemos: boolean;
  libraryReady: boolean;
  previewTrack: Track | null;
  tint: string;
  localCount: number;
  recentCount: number;
  eqEnabled: boolean;
  volumeControls: VolumeProps;
  openEqualizer(): void;
  toggleEffects(): void;
  openLocalLibrary(): void;
  openWidget(): void;
  widgetTint: string;
  openTrackInfo?: () => void;
  changeQuality(quality: AudioQuality): void;
  toggleLyrics(option: 'autoLyrics' | 'exportLyrics'): void;
  openRecent(): void;
  clearRecent(): void;
  openDiagnostics(): void;
  changeAppearance(appearance: Appearance): void;
  changePlayback(playback: PlaybackPreferences): void;
  toggleDemos(): void;
  reset(): void;
  sectionId: SettingsSectionId | undefined;
  selectSection(id?: SettingsSectionId): void;
  returnToTab(): void;
}

const SECTIONS = [
  { id: 'look', label: 'Внешний вид', detail: 'Тема, акцент и анимации', icon: Palette },
  { id: 'now', label: 'Сейчас играет', detail: 'Компоновка, эффекты и яркость фона', icon: Headphones },
  { id: 'sound', label: 'Качество аудио', detail: 'Качество потоков, звук файла и громкость', icon: AudioLines },
  { id: 'playback', label: 'Воспроизведение', detail: 'Аудиоэффекты, переходы и сохранение очереди', icon: SlidersHorizontal },
  { id: 'library', label: 'Медиатека', detail: 'Вид списка треков и демоколлекция', icon: Music2 },
] as const;
const APP_SECTIONS = [
  { id: 'notices', label: 'Уведомления', detail: 'Подсказки в интерфейсе и ошибки', icon: Bell },
  { id: 'integrations', label: 'Интеграции', detail: 'Виджет, тексты песен и музыкальные сервисы', icon: Plug },
  { id: 'storage', label: 'Хранилище', detail: 'Локальная коллекция, история и журнал', icon: HardDrive },
  { id: 'labs', label: 'Экспериментальные настройки', detail: 'Реакция фонов на звук и доступность распознавания', icon: Bug },
  { id: 'keys', label: 'Горячие клавиши', detail: 'Управление плеером с клавиатуры', icon: Keyboard },
  { id: 'updates', label: 'Обновления приложения', detail: 'Версия сборки и переход к релизам', icon: ArrowUpCircle },
] as const;
const allSections = [...SECTIONS, ...APP_SECTIONS];
export type SettingsSectionId = (typeof allSections)[number]['id'];
const shortcuts = [
  ['Пробел / K', 'Воспроизведение и пауза'], ['← / →', 'Перемотка / переключение станций'], ['F / Esc', 'Развернуть трек / выйти из большого плеера'],
  ['L / Esc', 'Караоке / выйти из большого плеера'], ['M', 'Выключить или вернуть звук'], ['Q', 'Очередь в обычном плеере'], ['Ctrl + O', 'Добавить музыку'],
  ['Ctrl + ,', 'Настройки'], ['Ctrl + Shift + L', 'Диагностика'],
  [WIDGET_SHORTCUT.label, 'Открыть или закрыть виджет (в фокусе Luma, Windows)'],
];

export function SettingsPage(props: SettingsProps) {
  const t = useText();
  const { appearance, playback, changeAppearance, changePlayback } = props;
  const section = allSections.find(({ id }) => id === props.sectionId);
  const [confirmClear, setConfirmClear] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const formatId = section?.id === 'sound' && props.previewTrack && !props.previewTrack.format && !props.previewTrack.online && !props.previewTrack.demo ? props.previewTrack.id : undefined;
  const [formatProbe, setFormatProbe] = useState<{ id: string; result: Awaited<ReturnType<typeof localLibrary.audioFormat>> }>();
  useEffect(() => {
    if (!formatId) return;
    let ignore = false;
    void localLibrary.audioFormat(formatId).then((result) => { if (!ignore) setFormatProbe({ id: formatId, result }); }, () => {
      if (!ignore) setFormatProbe({ id: formatId, result: null });
    });
    return () => { ignore = true; };
  }, [formatId]);
  const color = appearance.accent ?? THEMES[appearance.theme].accent;
  const accent = accentFor(appearance);
  useEffect(() => { root.current?.closest('main')?.scrollTo({ top: 0 }); }, [section]);
  const back = () => {
    setConfirmClear(false);
    if (section) props.selectSection();
    else props.returnToTab();
  };
  return (
    <div className="page settings-page" ref={root}>
      <header className="page-header settings-header">
        <button type="button" className="icon-button settings-back" aria-label={section ? t("Назад к настройкам") : t("Вернуться на вкладку")} title={t("Назад")} onClick={back}><ArrowLeft size={19} /></button>
        <div><p className="overline page-kicker"><span />{section ? t("Настройки") : t("Ваш плеер")}</p><h1>{t(section?.label ?? "Настройки")}</h1></div>
        {!section && <button type="button" className="button outline-button settings-reset" aria-label={t("Сбросить настройки")} onClick={props.reset} disabled={!props.libraryReady} title={t("Вернуть настройки по умолчанию")}><RotateCcw size={16} /> <span>{t("Сбросить настройки")}</span></button>}
      </header>
      <p className="settings-intro">{t(section?.detail ?? "Выберите раздел, чтобы настроить Luma под себя.")}</p>
      <div className="settings-layout">
        <div className="settings-stack">
          {!section && <>
            <MenuGroup label={t("Плеер")}>{SECTIONS.map((item) => <MenuItem key={item.id} icon={item.icon} title={t(item.label)} detail={t(item.detail)} select={() => { setConfirmClear(false); props.selectSection(item.id); }} />)}</MenuGroup>
            <MenuGroup label={t("Приложение")}>{APP_SECTIONS.map((item) => <MenuItem key={item.id} icon={item.icon} title={t(item.label)} detail={t(item.detail)} select={() => { setConfirmClear(false); props.selectSection(item.id); }} />)}</MenuGroup>
          </>}
          {section?.id === 'look' && <>
            <SettingCard title={t("Темы")} detail={t("Тема применяется ко всему окну. MacOS меняет компоновку: стеклянная навигация и плавающий плеер.")}>
              <ThemeSelect value={props.effectiveAppearance.theme} change={(theme) => changeAppearance({ ...appearance, theme, autoTheme: false })} />
              <ToggleRow title={t("Автоматическая смена темы")} detail={t("С 08:00 до 20:00 действует дневная тема, в остальное время — вечерняя. Ручной выбор выключает расписание.")} enabled={appearance.autoTheme} change={() => changeAppearance({ ...appearance, autoTheme: !appearance.autoTheme })} />
              {appearance.autoTheme && <>
                <label className="setting-row select-row"><span><strong>{t("Дневная тема")}</strong><small>{t("Сейчас:")}{" "}{t(THEMES[props.effectiveAppearance.theme].name)}.</small></span>
                  <select value={appearance.dayTheme} onChange={(event) => changeAppearance({ ...appearance, dayTheme: event.currentTarget.value as ThemeName })}>
                    {Object.entries(THEMES).map(([id, theme]) => <option key={id} value={id}>{t(theme.name)}</option>)}
                  </select>
                </label>
                <label className="setting-row select-row"><span><strong>{t("Вечерняя тема")}</strong></span>
                  <select value={appearance.theme} onChange={(event) => changeAppearance({ ...appearance, theme: event.currentTarget.value as ThemeName })}>
                    {Object.entries(THEMES).map(([id, theme]) => <option key={id} value={id}>{t(theme.name)}</option>)}
                  </select>
                </label>
              </>}
            </SettingCard>
            <SettingCard title={t("При запуске")}>
              <label className="setting-row select-row"><span><strong>{t("Раздел при запуске")}</strong><small>{t("Откроется при следующем запуске Luma.")}</small></span>
                <select value={playback.startPage} onChange={(event) => changePlayback({ ...playback, startPage: event.currentTarget.value as StartPage })}>
                  <option value="player">{t("Главная")}</option><option value="library">{t("Медиатека")}</option><option value="local">{t("Локальная библиотека")}</option><option value="search">{t("Поиск")}</option>
                </select>
              </label>
              <div className="settings-actions"><button type="button" className="button outline-button" onClick={props.openLocalLibrary}>{t("Открыть локальную библиотеку")}</button></div>
            </SettingCard>
            <SettingCard title={t("Цвет акцента")}>
              <div className="accent-controls" role="group" aria-label={t("Палитра акцентов")}>
                {ACCENTS.map(({ name, color: value }) => <button key={value} type="button" className="accent-swatch" title={t(name)} aria-label={t("Акцент: {0}", t(name))}
                  aria-pressed={appearance.accent === value} onClick={() => changeAppearance({ ...appearance, accent: value })} style={{ '--swatch': value } as CSSProperties}>
                  {appearance.accent === value && <Check size={15} aria-hidden="true" />}
                </button>)}
                <label className="custom-accent"><input type="color" value={color} aria-label={t("Свой цвет акцента")} onChange={(event) => changeAppearance({ ...appearance, accent: event.currentTarget.value })} /><span>{color.toUpperCase()}</span></label>
                {appearance.accent && <button className="text-button" type="button" onClick={() => changeAppearance({ ...appearance, accent: null })}>{t("Цвет темы")}</button>}
              </div>
              {accent !== color && <p className="setting-hint">{t("Акцент скорректирован для читаемости.")}</p>}
              <ToggleRow title={t("Компактная боковая панель")} detail={t(props.effectiveAppearance.theme === "macos" ? "MacOS использует плавающую навигацию." : "Оставить только иконки на широком экране.")} disabled={props.effectiveAppearance.theme === "macos"} enabled={appearance.compactSidebar} change={() => changeAppearance({ ...appearance, compactSidebar: !appearance.compactSidebar })} />
              <ToggleRow title={t("Анимации")} detail={t("Плавные переходы, живые фоны и индикатор звука.")} enabled={appearance.motion} change={() => changeAppearance({ ...appearance, motion: !appearance.motion })} />
            </SettingCard>
            <SettingCard title={t("Прочее")}>
              <ToggleRow title={t("Отключить анимацию при смене вкладки")} detail={t("Не влияет на живые фоны и эффекты в плеере.")} enabled={!appearance.tabMotion} change={() => changeAppearance({ ...appearance, tabMotion: !appearance.tabMotion })} />
              <ToggleRow title={t("Показывать полные числа")} detail={t("Например, 1234 вместо 1.2к в счётчиках медиатеки и очереди.")} enabled={appearance.fullNumbers} change={() => changeAppearance({ ...appearance, fullNumbers: !appearance.fullNumbers })} />
              <ToggleRow title={t("Классический стиль докбара")} detail={t(props.effectiveAppearance.theme === "macos" ? "MacOS использует плавающий плеер." : "Строгая панель управления и классические вкладки на узком экране.")} disabled={props.effectiveAppearance.theme === "macos"} enabled={appearance.classicDock} change={() => changeAppearance({ ...appearance, classicDock: !appearance.classicDock })} />
              <label className="setting-row select-row"><span><strong>{t("Язык интерфейса")}</strong><small>{t("Меню, настройки и кнопки Luma. Теги, тексты песен и названия плейлистов не переводятся.")}</small></span>
                <select value={props.uiLanguage} onChange={(event) => props.changeLanguage(event.currentTarget.value as UiLanguage)}>
                  {Object.entries(UI_LANGUAGES).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
                </select></label>
              <label className="setting-row select-row"><span><strong>{t("Язык данных и регион")}</strong><small>{t("Форматы данных и регион поиска Apple Music.")}</small></span>
                <select value={appearance.dataLanguage} onChange={(event) => changeAppearance({ ...appearance, dataLanguage: event.currentTarget.value as DataLanguage })}>
                  {Object.entries(DATA_LANGUAGES).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
                </select></label>
            </SettingCard>
          </>}
          {section?.id === 'now' && <>
            <SettingCard title={t("Экран «Сейчас играет»")}>
              <NowPlayingOptions appearance={appearance} change={changeAppearance} />
              <ToggleRow title={t("Цвет фона из обложки")} detail={t("Если выключено, фон использует акцент темы.")} enabled={appearance.coverColors} change={() => changeAppearance({ ...appearance, coverColors: !appearance.coverColors })} />
              <ToggleRow title={t("Реакция на музыку")} detail={t("Спектр и свет в некоторых фонах откликаются на локальный трек. При отключении остаётся обычная анимация.")} enabled={appearance.audioReactive} change={() => changeAppearance({ ...appearance, audioReactive: !appearance.audioReactive })} />
              <label className="setting-row select-row"><span><strong>{t("Темп фона")}</strong><small>{t("Скорость анимации, не скорость песни.")}</small></span>
                <select value={appearance.effectTempo} disabled={appearance.effect === 'off'} onChange={(event) => changeAppearance({ ...appearance, effectTempo: event.currentTarget.value as EffectTempo })}>
                  {Object.entries(EFFECT_TEMPOS).map(([id, { label }]) => <option key={id} value={id}>{t(label)}</option>)}
                </select>
              </label>
            </SettingCard>
            <SettingCard title={t("Полноэкранный плеер")}>
              <ToggleRow title={t("Разворачивать на весь монитор")} detail={t("Если выключено, большой плеер открывается внутри окна Luma.")} enabled={appearance.nativeFullscreen} change={() => changeAppearance({ ...appearance, nativeFullscreen: !appearance.nativeFullscreen })} />
              <ToggleRow title={t("Показывать следующие треки")} detail={t("Это же положение переключателя запоминается после выхода из большого плеера.")} enabled={appearance.fullscreenQueue} change={() => changeAppearance({ ...appearance, fullscreenQueue: !appearance.fullscreenQueue })} />
            </SettingCard>
          </>}
          {section?.id === 'sound' && <>
            <SettingCard title={t("Качество воспроизведения")} detail={t("Выбор действует для новых потоков Jamendo. Wikimedia Commons и файлы играют в исходном формате.")}>
              <label className="setting-row select-row"><span><strong>{t("Режим сети")}</strong><small>{props.metered ? t("Используется профиль лимитной сети.") : t("Используется профиль обычной сети.")}{" "}{t("Если устройство не сообщает тип сети, его можно выбрать здесь.")}</small></span>
                <select value={props.audioQuality.network} onChange={(event) => props.changeQuality({ ...props.audioQuality, network: event.currentTarget.value as NetworkMode })}>
                  {Object.entries(NETWORK_MODES).map(([id, title]) => <option value={id} key={id}>{t(title)}</option>)}
                </select></label>
              {([['normal', t("Воспроизведение через Wi-Fi")], ['metered', t("Воспроизведение через сотовую связь")]] as const).map(([id, label]) => <label key={id} className="setting-row select-row">
                <span><strong>{label}</strong><small>{id === 'normal' ? t("Также для проводного подключения.") : t("Также для лимитных сетей.")}</small></span>
                <select value={props.audioQuality[id]} onChange={(event) => props.changeQuality({ ...props.audioQuality, [id]: event.currentTarget.value as StreamQuality })}>
                  {Object.entries(STREAM_QUALITIES).map(([option, title]) => <option value={option} key={option}>{t(title)}</option>)}
                </select></label>)}
            </SettingCard>
            <SettingCard title={t("Текущий трек")} detail={props.previewTrack ? props.previewTrack.title : t("Выберите трек, чтобы посмотреть его формат.")}>
              {props.previewTrack && <p className="setting-body-copy">{props.playingStream ? `${props.playingStream.cached ? `${t("Копия в кэше")} · ` : ''}${describeStream(props.previewTrack, props.playingStream.url, t.language)}`
                : props.previewTrack.online ? t("Поток ещё не запущен.")
                : formatId && formatProbe?.id !== formatId ? t("Читаем сведения о файле…")
                : describeAudioFormat(props.previewTrack.format ?? (formatProbe?.id === formatId ? formatProbe?.result ?? undefined : undefined), props.locale, t.language) || t("Файл воспроизводится без перекодирования. Битрейт не определён.")}</p>}
              <div className="setting-row settings-volume"><span><strong>{t("Громкость плеера")}</strong><small>{t("Меняется и в нижней панели.")}</small></span><VolumeControl {...props.volumeControls} /></div>
            </SettingCard>
            <FloatSettings requested={props.nativeFloat} status={props.floatStatus} change={props.changeFloat} />
          </>}
          {section?.id === 'playback' && <>
            <SettingCard title={t('Таймер сна')}><SleepTimer deadline={props.sleepDeadline} change={props.changeSleepTimer} /></SettingCard>
            <SettingCard title={t("Воспроизведение в Luma")}>
              <ToggleRow title={t("Аудиоэффекты")} detail={t("Применять параметрический эквалайзер к файлам и демотрекам.")} enabled={props.eqEnabled} change={props.toggleEffects} />
              <div className="settings-actions"><button type="button" className="button outline-button" onClick={props.openEqualizer} aria-haspopup="dialog">{t("Настроить эквалайзер")}</button></div>
              <ToggleRow title={t('Резервный локальный файл')} detail={t('Если онлайн-источник не играет, использовать один файл с тем же ISRC, названием, исполнителем и близкой длительностью. Сам плейлист не изменится.')}
                enabled={props.localFallback} change={props.toggleLocalFallback} />
              <ToggleRow title={t("Автозапуск")} detail={t("Начать воспроизведение локального трека при запуске Luma. Онлайн-потоки автоматически не запускаются.")} enabled={playback.autoPlay} change={() => changePlayback({ ...playback, autoPlay: !playback.autoPlay })} />
              <ToggleRow title={t("Следующий трек автоматически")} detail={t("Если выключено, плеер остановится в конце. Повтор одного трека действует отдельно.")} enabled={playback.autoNext} change={() => changePlayback({ ...playback, autoNext: !playback.autoNext })} />
              <label className="setting-row select-row"><span><strong>{t("Кроссфейд")}</strong><small>{t("Плавный переход при автосмене между двумя файлами. Для онлайн-потоков и повтора одного трека не применяется.")}</small></span>
                <select value={playback.crossfade} disabled={!playback.autoNext} onChange={(event) => changePlayback({ ...playback, crossfade: Number(event.currentTarget.value) as CrossfadeTime })}>
                  {CROSSFADE_TIMES.map((seconds) => <option key={seconds} value={seconds}>{seconds ? t("{0} с", seconds) : t("Выключен")}</option>)}
                </select></label>
              <label className="setting-row select-row"><span><strong>{t("Шаг перемотки")}</strong><small>{t("Для горячих клавиш ← и →.")}</small></span>
                <select value={playback.seekStep} onChange={(event) => changePlayback({ ...playback, seekStep: Number(event.currentTarget.value) as SeekStep })}>
                  {SEEK_STEPS.map((value) => <option key={value} value={value}>{value}{" "}{t("с")}</option>)}
                </select>
              </label>
            </SettingCard>
            <SettingCard title={t("Сохранять между перезапусками")} detail={t("Настройки независимы и не меняют текущую очередь.")}>
              <ToggleRow title={t("Очередь воспроизведения")} detail={t("Сохранять порядок и выбранный трек. Позиция в треке не сохраняется.")} enabled={playback.rememberQueue} change={() => changePlayback({ ...playback, rememberQueue: !playback.rememberQueue })} />
              <ToggleRow title={t("Режим повтора")} detail={t("Сохранять повтор трека или всей очереди.")} enabled={playback.rememberRepeat} change={() => changePlayback({ ...playback, rememberRepeat: !playback.rememberRepeat })} />
              <ToggleRow title={t("Режим перемешивания")} detail={t("Помнить перемешивание даже при отключённом сохранении очереди.")} enabled={playback.rememberShuffle} change={() => changePlayback({ ...playback, rememberShuffle: !playback.rememberShuffle })} />
            </SettingCard>
            <div className="settings-footer-note"><Settings2 size={16} /><span>{t("Эти параметры действуют в плеере Luma.")}</span></div>
          </>}
          {section?.id === 'library' && <SettingCard title={t("Коллекция Luma")}>
            <label className="setting-row select-row"><span><strong>{t("Вид медиатеки")}</strong><small>{t("Списком или плиткой с крупными обложками.")}</small></span>
              <select value={appearance.libraryLayout} onChange={(event) => changeAppearance({ ...appearance, libraryLayout: event.currentTarget.value as LibraryLayout })}>
                <option value="list">{t("Списком")}</option><option value="grid">{t("Плиткой")}</option>
              </select>
            </label>
            <ToggleRow title={t("Встроенные демотреки")} detail={t("Показывать демотреки в локальной медиатеке.")} enabled={props.showDemos} change={props.toggleDemos} disabled={!props.libraryReady} />
          </SettingCard>}
          {section?.id === 'notices' && <SettingCard title={t("Подсказки Luma")}>
            <ToggleRow title={t("Показывать уведомления об успехе")} detail={t("Сообщения об импорте, очереди и сохранении. Ошибки видны всегда.")} enabled={playback.successNotices} change={() => changePlayback({ ...playback, successNotices: !playback.successNotices })} />
          </SettingCard>}
          {section?.id === 'integrations' && <>
            <SettingCard title="Discord Rich Presence"><DiscordSettings options={props.discord} change={props.changeDiscord} /></SettingCard>
            <SettingCard title={t("Виджеты рабочего стола")} detail={t("Компактный плеер поверх окон Windows. Продолжает то же воспроизведение; полноразмерное окно можно вернуть кнопкой или Esc.")}>
              <label className="setting-row select-row"><span><strong>{t("Фон")}</strong><small>{t("Применяется к компактному плееру.")}</small></span>
                <select value={appearance.widgetBackground} onChange={(event) => changeAppearance({ ...appearance, widgetBackground: event.currentTarget.value as WidgetBackground })}>
                  {Object.entries(WIDGET_BACKGROUNDS).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
                </select></label>
              <WidgetPreview macos={props.effectiveAppearance.theme === 'macos'} track={props.previewTrack}
                tint={props.widgetTint} background={appearance.widgetBackground} />
              <div className="settings-actions">
                {window.luma ? <button className="button outline-button" type="button" onClick={props.openWidget} title={WIDGET_SHORTCUT.label} aria-keyshortcuts={WIDGET_SHORTCUT.aria}><Monitor size={16} />{" "}{t("Открыть виджет Luma")}</button> : <span className="setting-status">{t("В приложении Windows")}</span>}
              </div>
            </SettingCard>
            <SettingCard title={t("Системная медиапанель")}>
              <ToggleRow title={t("Передавать данные трека системе")} detail={t("Название, исполнитель и обложка для медиапанели. Медиаклавиши работают отдельно.")} enabled={playback.publishTrack} change={() => changePlayback({ ...playback, publishTrack: !playback.publishTrack })} />
            </SettingCard>
            <SettingCard title={t("Сервисы")}>
              <LastFmSettings connected={props.connected} />
              <Service title={t("Тексты песен")} status="LRCLIB">
                <p>{t("Теги и локальные .lrc / .lyrics.txt, LRCLIB и несколько оригинальных изданий из Викитеки. Для полного каталога Musixmatch нужен отдельный договор.")}</p>
                <ToggleRow title={t("Автопоиск текстов")} detail={t("Искать для играющего трека на главной и в караоке. LRCLIB получит название, исполнителя, альбом и длительность, если они известны.")} enabled={props.autoLyrics} change={() => props.toggleLyrics('autoLyrics')} />
                {window.luma && <ToggleRow title={t("Сохранять текст с новым MP3")} detail={t("Для личной копии MP3: синхронный текст в соседний .lrc, обычный — в тег MP3. Если найдены оба, сохраняются оба. Существующие файлы не меняются.")} enabled={props.exportLyrics} change={() => props.toggleLyrics('exportLyrics')} />}
              </Service>
              <Service title="iTunes" status={t("Только метаданные")}>
                <p>{t("Название и теги можно найти в редакторе трека. Условия iTunes Search API не дают права использовать рекламные изображения как постоянные обложки Luma.")}</p>
                {props.openTrackInfo && <div className="settings-actions"><button className="button outline-button" type="button" onClick={props.openTrackInfo}>{t("Данные текущего трека")}</button></div>}
              </Service>
            </SettingCard>
          </>}
          {section?.id === 'storage' && <>
            <StreamCacheSettings />
            <SettingCard title={t("Локальный профиль")} detail={t("Настройки, обложки и история остаются на устройстве; на Windows исходные аудиофайлы не копируются при добавлении.")}>
              <dl className="settings-storage"><div><dt>{t("Треков с устройства")}</dt><dd>{formatCount(props.localCount, appearance.fullNumbers, t.language)}</dd></div><div><dt>{t("Недавних треков")}</dt><dd>{formatCount(props.recentCount, appearance.fullNumbers, t.language)}</dd></div></dl>
              <ToggleRow title={t("Запоминать прослушанные треки")} detail={t("Хранить локально до 60 последних треков. При отключении новая история не записывается.")} enabled={playback.rememberRecent} change={() => changePlayback({ ...playback, rememberRecent: !playback.rememberRecent })} />
              <div className="settings-actions">
                <button type="button" className="button outline-button" onClick={props.openRecent}>{t("Недавно слушали")}</button>
                <button type="button" className="button outline-button" disabled={!props.recentCount} onClick={() => setConfirmClear((value) => !value)} aria-expanded={confirmClear}>{t("Очистить историю")}</button>
              </div>
              {confirmClear && <div className="settings-confirm"><p>{t("Очистить список прослушанного? Музыка и избранное останутся.")}</p>
                <button type="button" className="text-button" onClick={() => { props.clearRecent(); setConfirmClear(false); }}>{t("Удалить историю")}</button>
                <button type="button" className="text-button" onClick={() => setConfirmClear(false)}>{t("Отмена")}</button>
              </div>}
            </SettingCard>
            <SettingCard title={t("Журнал диагностики")} detail={t("До 300 событий запуска и воспроизведения. Здесь нет названий песен, паролей или путей к файлам.")}>
              <div className="settings-actions"><button type="button" className="button outline-button" onClick={props.openDiagnostics}>{t("Открыть диагностику")}</button></div>
            </SettingCard>
          </>}
          {section?.id === 'labs' && <>
            <SettingCard title={t("Аудиореактивные фоны")} detail={t("Экспериментальный спектр и подсветка для файлов в Luma.")}>
              <ToggleRow title={t("Реакция на музыку")} detail={t("Выключите, если нужен более спокойный фон или меньше нагрузки.")} enabled={appearance.audioReactive} change={() => changeAppearance({ ...appearance, audioReactive: !appearance.audioReactive })} />
            </SettingCard>
            <SettingCard title={t("Поиск записи по звуку")} detail={t("При настроенном доступе к AcoustID появляется кнопка «По звуку» в редакторе данных. Для сравнения передаются только отпечаток и длительность.")}>
              {props.openTrackInfo && <div className="settings-actions"><button className="button outline-button" type="button" onClick={props.openTrackInfo}>{t("Данные текущего трека")}</button></div>}
            </SettingCard>
          </>}
          {section?.id === 'keys' && <SettingCard title={t("Клавиатура")} detail={t("Команды треков действуют при локальном воспроизведении.")}>
            <dl className="settings-shortcuts">{shortcuts.map(([key, label]) => <div key={key}><dt><kbd>{t(key)}</kbd></dt><dd>{t(label)}</dd></div>)}</dl>
          </SettingCard>}
          {section?.id === 'updates' && <ReleaseSettings />}
        </div>
        {(!section || section.id === 'look' || section.id === 'now') && <ThemePreview appearance={props.effectiveAppearance} track={props.previewTrack} tint={props.tint} />}
      </div>
    </div>
  );
}

function Service({ title, status, children }: { title: string; status: string; children: ReactNode }) {
  return <section className="settings-service" aria-label={title}>
    <header><h3>{title}</h3><span className="setting-status">{status}</span></header>
    {children}
  </section>;
}

function FloatSettings({ requested, status, change }: { requested: boolean; status: FloatStatus; change(value: boolean): void }) {
  const t = useText();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void window.luma?.floatOutput?.available().then((value) => { if (live) setAvailable(value); }, () => {});
    return () => { live = false; };
  }, []);
  const labels: Record<FloatStatus, string> = {
    system: requested ? 'Ждём воспроизведения файла' : 'Системный вывод',
    starting: 'Проверяем формат устройства…',
    running: 'WASAPI Exclusive · IEEE Float32',
    unsupported: 'Устройство занято или не приняло Float32. Используется системный вывод.',
    failed: 'Сбой Float-вывода. Проверьте устройство или выключите этот режим.',
    'no-device': 'Системный выход не найден. Подключите устройство и попробуйте снова.',
    missing: 'Float-вывод недоступен в этом окружении.',
  };
  return <SettingCard title={t("Float-вывод")} detail={t("Для локальных файлов: выделенный WASAPI Exclusive в стерео IEEE Float32, только если драйвер принимает точный формат. Не меняет разрядность исходника и не гарантирует bit-perfect.")}>
    <ToggleRow title={t("Попробовать Float-вывод")} detail={t("Устройство может быть временно занято Luma. При несовместимости звук остаётся на системном выходе. Онлайн-потоки не затрагиваются.")}
      enabled={requested && available} disabled={!available} change={() => change(!requested)} />
    <p className="setting-body-copy" role="status">{t(labels[available ? status : 'missing'])}</p>
  </SettingCard>;
}

const LASTFM_ISSUES: Record<LastFmIssue, string> = {
  authorize: 'Подтвердите доступ в браузере, затем завершите подключение.',
  offline: 'Нет связи с API Last.fm. Проверьте сеть и попробуйте ещё раз.',
  service: 'API Last.fm временно недоступен. Ключи менять не нужно — попробуйте позже.',
  rate: 'Last.fm ограничил частоту запросов. Подождите и попробуйте снова.',
  rejected: 'Last.fm не принял запрос. Попробуйте снова или сообщите код в поддержку.',
  ignored: 'Last.fm получил запрос, но не засчитал это прослушивание.',
  expired: 'Сессия Last.fm отозвана. Подключите аккаунт снова.',
  tokenExpired: 'Ссылка для входа устарела. Откройте новую и снова разрешите доступ.',
  credentials: 'Введите API Key и Shared Secret: по 32 шестнадцатеричных символа из одной записи Last.fm.',
  key: 'Last.fm не принял API Key. Сверьте его со страницей API Accounts.',
  signature: 'Last.fm не принял подпись. Сверьте Shared Secret и API Key из одной записи.',
  suspended: 'Last.fm приостановил этот ключ. Проверьте статус в Last.fm API Accounts.',
  storage: 'Не удалось обновить защищённое хранилище Last.fm.',
  browser: 'Не удалось открыть Last.fm в браузере. Проверьте браузер по умолчанию.',
};

function LastFmSettings({ connected }: { connected: boolean }) {
  const t = useText();
  const bridge = window.luma?.lastfm;
  const [status, setStatus] = useState<LastFmStatus>();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let current = true;
    void bridge.status().then((value) => { if (current) setStatus(value); }, () => {});
    const unsubscribe = bridge.onChange(setStatus);
    return () => { current = false; unsubscribe(); };
  }, [bridge]);
  function run(action: () => Promise<LastFmStatus>, success?: () => void) {
    setBusy(true);
    void action().then((value) => {
      setStatus(value);
      if (!value.issue) success?.();
    }, () => setStatus((value) => value && { ...value, issue: 'offline', apiCode: undefined })).finally(() => setBusy(false));
  }
  const showFields = status && (!status.configured || editing);
  return <Service title="Last.fm" status={status?.user ?? (bridge ? t('Не подключён') : t('В приложении Windows'))}>
    <p>{t('Скробблинг выключен до вашего согласия. При включении Last.fm получит название, исполнителя, альбом, длительность и время начала трека. Демотреки не отправляются.')}</p>
    {bridge && showFields && <form className="lastfm-form" autoComplete="off" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const key = String(data.get('api-key') ?? ''), secret = String(data.get('shared-secret') ?? '');
      form.reset();
      run(() => bridge.configure(key, secret), () => setEditing(false));
    }}>
      <p>{t('Вставьте ключ и секрет своего API-аккаунта. Пароль Last.fm и Callback URL не нужны.')}</p>
      <div className="lastfm-fields">
        <label>API Key<input name="api-key" type="password" required maxLength={128} autoComplete="new-password" spellCheck={false} disabled={busy} /></label>
        <label>Shared Secret<input name="shared-secret" type="password" required maxLength={128} autoComplete="new-password" spellCheck={false} disabled={busy} /></label>
      </div>
      <div className="settings-actions">
        <button type="submit" className="button primary-button" disabled={busy}>{t(status.persistent ? 'Сохранить ключи' : 'Применить до закрытия Luma')}</button>
        {!status.configured && <button className="button outline-button" type="button" disabled={busy || !connected} onClick={() => run(bridge.begin)}>{t('Создать API-аккаунт')}</button>}
        {editing && <button className="text-button" type="button" disabled={busy} onClick={() => setEditing(false)}>{t('Отмена')}</button>}
      </div>
    </form>}
    {status?.configuration === 'local' && <p>{t(status.persistent ? 'Ключи сохранены в защищённом хранилище этого устройства.' : 'Защищённое хранилище недоступно. Ключи и сессия останутся только до закрытия Luma.')}</p>}
    {status?.configuration === 'environment' && <p>{t('Ключи получены из переменных запуска. Их можно сохранить прямо в Luma.')}</p>}
    {status?.user && <>
      {!status.persistent && status.configuration !== 'local' && <p>{t('Системное хранилище недоступно. Сессия останется только до закрытия Luma.')}</p>}
      <ToggleRow title={t('Отправлять прослушивания в Last.fm')} detail={t('Не менее половины трека или 4 минут. Перемотка не считается.')} enabled={status.enabled} disabled={busy} change={() => bridge && run(() => bridge.enable(!status.enabled))} />
    </>}
    {bridge && status?.configured && !editing && <div className="settings-actions">
      {status.user ? <button className="button outline-button" type="button" disabled={busy} onClick={() => run(bridge.disconnect)}>{t('Отключить Last.fm')}</button> : <>
        <button className="button outline-button" type="button" disabled={busy || !connected} onClick={() => run(bridge.begin)}>
          {t(status.waiting ? 'Открыть вход заново' : 'Подключить Last.fm')}
        </button>
        {status.waiting && <button className="button primary-button" type="button" disabled={busy || !connected} onClick={() => run(bridge.finish)}>{t('Завершить подключение')}</button>}
      </>}
      <button className="text-button" type="button" disabled={busy} onClick={() => setEditing(true)}>{t('Изменить ключи')}</button>
      {status.configuration === 'local' && <button className="text-button" type="button" disabled={busy} onClick={() => run(bridge.forgetCredentials)}>{t('Удалить ключи и отключить')}</button>}
    </div>}
    {!connected && bridge && <p>{t('Для подключения и отправки прослушиваний нужна сеть.')}</p>}
    {status?.waiting && !status.issue && <p role="status">{t('Разрешите Luma доступ на сайте Last.fm и вернитесь сюда.')}</p>}
    {status?.issue && <p className="lastfm-issue" role="status">{t(LASTFM_ISSUES[status.issue])}{status.apiCode && <> <b>{t('Код Last.fm: {0}', status.apiCode)}</b></>}</p>}
  </Service>;
}

function StreamCacheSettings() {
  const t = useText();
  const bridge = window.luma?.streamCache;
  const [info, setInfo] = useState<StreamCacheInfo>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let current = true;
    void bridge.info().then((value) => { if (current) setInfo(value); }, () => {});
    return () => { current = false; };
  }, [bridge]);
  return <SettingCard title={t("Кэш потоков")} detail={t("В поиске выберите «В кэш» у разрешённого MP3 из Wikimedia Commons. Копия играет без сети из «Медиатека → Из интернета». Автоматических загрузок нет.")}>
    <p className="setting-body-copy">{t("До 128 МБ на 14 дней. Старые копии удаляются первыми; закладки и исходные файлы остаются.")}</p>
    {bridge && <div className="settings-actions">
      <span className="setting-status">{info ? t("{0} · {1} МБ", info.count, Math.round(info.bytes / 1024 / 1024 * 10) / 10) : t("Читаем размер…")}</span>
      <button className="button outline-button" type="button" disabled={busy || !info?.count} onClick={() => {
        setBusy(true); setFailed(false);
        void bridge.clear().then(setInfo, () => setFailed(true)).finally(() => setBusy(false));
      }}>{t("Очистить кэш")}</button>
    </div>}
    {!bridge && <span className="setting-status">{t("В приложении Windows")}</span>}
    {failed && <p role="status">{t("Не удалось полностью очистить кэш. Остановите воспроизведение и повторите.")}</p>}
  </SettingCard>;
}
