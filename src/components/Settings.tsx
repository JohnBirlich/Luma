import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowUpCircle, AudioLines, Bell, Bug, Check, HardDrive, Headphones, Keyboard, Monitor, Music2, Palette, Play, Plug, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { ACCENTS, accentFor, CROSSFADE_TIMES, DATA_LANGUAGES, EFFECT_TEMPOS, formatCount, SEEK_STEPS, THEMES, WIDGET_BACKGROUNDS } from '../shared/customization';
import type { Appearance, CrossfadeTime, DataLanguage, EffectTempo, LibraryLayout, PlaybackPreferences, SeekStep, StartPage, ThemeName, WidgetBackground } from '../shared/customization';
import { describeAudioFormat, describeStream, NETWORK_MODES, STREAM_QUALITIES } from '../shared/audio-quality';
import type { AudioQuality, NetworkMode, StreamQuality } from '../shared/audio-quality';
import type { Track } from '../shared/media';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import { ReleaseLink, useInstalledBuild } from './About';
import { Artwork } from './Artwork';
import { MenuGroup, MenuItem } from './Menu';
import { VolumeControl } from './PlaybackControls';
import type { VolumeProps } from './PlaybackControls';
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
  effectiveAppearance: Appearance;
  locale: string;
  audioQuality: AudioQuality;
  playingStream?: string;
  metered: boolean;
  connected: boolean;
  autoLyrics: boolean;
  exportLyrics: boolean;
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
  toggleEffects(): void;
  openLocalLibrary(): void;
  openWidget(): void;
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
  goToMenu(): void;
  openVk(): void;
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
              <ToggleRow title="Автоматическая смена темы" detail="Дневная тема с 08:00 до 20:00 по времени устройства. В остальное время — основная тема." enabled={appearance.autoTheme} change={() => changeAppearance({ ...appearance, autoTheme: !appearance.autoTheme })} />
              {appearance.autoTheme && <label className="setting-row select-row"><span><strong>Дневная тема</strong><small>Сейчас: {THEMES[props.effectiveAppearance.theme].name}.</small></span>
                <select value={appearance.dayTheme} onChange={(event) => changeAppearance({ ...appearance, dayTheme: event.currentTarget.value as ThemeName })}>
                  {Object.entries(THEMES).map(([id, theme]) => <option key={id} value={id}>{theme.name}</option>)}
                </select></label>}
              {appearance.autoTheme && <p className="setting-hint">Основная (вечерняя) тема</p>}
              <ThemeSelect value={appearance.theme} change={(theme) => changeAppearance({ ...appearance, theme })} />
            </SettingCard>
            <SettingCard title="При запуске">
              <label className="setting-row select-row"><span><strong>Раздел при запуске</strong><small>Откроется при следующем запуске Luma.</small></span>
                <select value={playback.startPage} onChange={(event) => changePlayback({ ...playback, startPage: event.currentTarget.value as StartPage })}>
                  <option value="player">Главная</option><option value="library">Медиатека</option><option value="local">Локальная библиотека</option><option value="search">Поиск</option><option value="vk">Плейлисты VK</option>
                </select>
              </label>
              <div className="settings-actions"><button type="button" className="button outline-button" onClick={props.openLocalLibrary}>Открыть локальную библиотеку</button></div>
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
            <SettingCard title="Прочее">
              <ToggleRow title="Отключить анимацию при смене вкладки" detail="Не влияет на живые фоны и эффекты в плеере." enabled={!appearance.tabMotion} change={() => changeAppearance({ ...appearance, tabMotion: !appearance.tabMotion })} />
              <ToggleRow title="Показывать полные числа" detail="Например, 1234 вместо 1.2к в счётчиках медиатеки и очереди." enabled={appearance.fullNumbers} change={() => changeAppearance({ ...appearance, fullNumbers: !appearance.fullNumbers })} />
              <ToggleRow title="Классический стиль докбара" detail="Строгая панель управления и классические вкладки на узком экране." enabled={appearance.classicDock} change={() => changeAppearance({ ...appearance, classicDock: !appearance.classicDock })} />
              <label className="setting-row select-row"><span><strong>Язык и регион</strong><small>Форматы данных и регион поиска Apple Music. Интерфейс Luma пока на русском.</small></span>
                <select value={appearance.dataLanguage} onChange={(event) => changeAppearance({ ...appearance, dataLanguage: event.currentTarget.value as DataLanguage })}>
                  {Object.entries(DATA_LANGUAGES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select></label>
            </SettingCard>
          </>}
          {section?.id === 'now' && <>
            <SettingCard title="Экран «Сейчас играет»">
              <NowPlayingOptions appearance={appearance} change={changeAppearance} />
              <ToggleRow title="Цвет фона из обложки" detail="Если выключено, фон использует акцент темы." enabled={appearance.coverColors} change={() => changeAppearance({ ...appearance, coverColors: !appearance.coverColors })} />
              <ToggleRow title="Реакция на музыку" detail="Спектр и свет в некоторых фонах откликаются на локальный трек. При отключении остаётся обычная анимация." enabled={appearance.audioReactive} change={() => changeAppearance({ ...appearance, audioReactive: !appearance.audioReactive })} />
              <label className="setting-row select-row"><span><strong>Темп фона</strong><small>Скорость анимации, не скорость песни.</small></span>
                <select value={appearance.effectTempo} disabled={appearance.effect === 'off'} onChange={(event) => changeAppearance({ ...appearance, effectTempo: event.currentTarget.value as EffectTempo })}>
                  {Object.entries(EFFECT_TEMPOS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            </SettingCard>
            <SettingCard title="Полноэкранный плеер">
              <ToggleRow title="Разворачивать на весь монитор" detail="Если выключено, большой плеер открывается внутри окна Luma." enabled={appearance.nativeFullscreen} change={() => changeAppearance({ ...appearance, nativeFullscreen: !appearance.nativeFullscreen })} />
              <ToggleRow title="Показывать следующие треки" detail="Это же положение переключателя запоминается после выхода из большого плеера." enabled={appearance.fullscreenQueue} change={() => changeAppearance({ ...appearance, fullscreenQueue: !appearance.fullscreenQueue })} />
            </SettingCard>
          </>}
          {section?.id === 'sound' && <>
            <SettingCard title="Качество воспроизведения" detail="Выбор действует для новых потоков Jamendo. Wikimedia Commons и файлы играют в исходном формате.">
              <label className="setting-row select-row"><span><strong>Режим сети</strong><small>{props.metered ? 'Используется профиль лимитной сети.' : 'Используется профиль обычной сети.'} Если устройство не сообщает тип сети, его можно выбрать здесь.</small></span>
                <select value={props.audioQuality.network} onChange={(event) => props.changeQuality({ ...props.audioQuality, network: event.currentTarget.value as NetworkMode })}>
                  {Object.entries(NETWORK_MODES).map(([id, title]) => <option value={id} key={id}>{title}</option>)}
                </select></label>
              {([['normal', 'Воспроизведение через Wi-Fi'], ['metered', 'Воспроизведение через сотовую связь']] as const).map(([id, label]) => <label key={id} className="setting-row select-row">
                <span><strong>{label}</strong><small>{id === 'normal' ? 'Также для проводного подключения.' : 'Также для лимитных сетей.'}</small></span>
                <select value={props.audioQuality[id]} onChange={(event) => props.changeQuality({ ...props.audioQuality, [id]: event.currentTarget.value as StreamQuality })}>
                  {Object.entries(STREAM_QUALITIES).map(([option, title]) => <option value={option} key={option}>{title}</option>)}
                </select></label>)}
              <div className="setting-row"><div><strong>Кеширование / загрузка</strong><small>Загрузка сохраняет оригинальный MP3 из Wikimedia Commons, если он доступен. Luma не перекодирует файлы и не сохраняет поток для офлайн-прослушивания.</small></div><span className="setting-status">Оригинал</span></div>
            </SettingCard>
            <SettingCard title="Текущий трек" detail={props.previewTrack ? props.previewTrack.title : 'Выберите трек, чтобы посмотреть его формат.'}>
              {props.previewTrack && <p className="setting-body-copy">{props.playingStream ? describeStream(props.previewTrack, props.playingStream)
                : props.previewTrack.online ? 'Поток ещё не запущен.'
                : describeAudioFormat(props.previewTrack.format, props.locale) || 'Файл воспроизводится без перекодирования. Битрейт не определён.'}</p>}
              <div className="setting-row settings-volume"><span><strong>Громкость плеера</strong><small>Меняется и в нижней панели.</small></span><VolumeControl {...props.volumeControls} /></div>
            </SettingCard>
            <SettingCard title="Float-вывод" detail="24/32-битный вывод зависит от драйвера и звукового устройства. Эта сборка не выбирает аппаратный формат и не выдаёт внутреннюю обработку Electron за Float-вывод.">
              <span className="setting-status">Не поддерживается в этой сборке</span>
            </SettingCard>
          </>}
          {section?.id === 'playback' && <>
            <SettingCard title="Воспроизведение в Luma">
              <ToggleRow title="Аудиоэффекты" detail="Применять эквалайзер и предусиление к локальным файлам." enabled={props.eqEnabled} change={props.toggleEffects} />
              <div className="settings-actions"><button type="button" className="button outline-button" onClick={props.openEqualizer} aria-haspopup="dialog">Настроить эквалайзер</button></div>
              <ToggleRow title="Автозапуск" detail="Начать воспроизведение локального трека при запуске Luma. Потоки и VK автоматически не запускаются." enabled={playback.autoPlay} change={() => changePlayback({ ...playback, autoPlay: !playback.autoPlay })} />
              <ToggleRow title="Следующий трек автоматически" detail="Если выключено, плеер остановится в конце. Повтор одного трека действует отдельно." enabled={playback.autoNext} change={() => changePlayback({ ...playback, autoNext: !playback.autoNext })} />
              <label className="setting-row select-row"><span><strong>Кроссфейд</strong><small>Плавный переход при автосмене между двумя файлами. Для онлайн-потоков и повтора одного трека не применяется.</small></span>
                <select value={playback.crossfade} disabled={!playback.autoNext} onChange={(event) => changePlayback({ ...playback, crossfade: Number(event.currentTarget.value) as CrossfadeTime })}>
                  {CROSSFADE_TIMES.map((seconds) => <option key={seconds} value={seconds}>{seconds ? `${seconds} с` : 'Выключен'}</option>)}
                </select></label>
              <label className="setting-row select-row"><span><strong>Шаг перемотки</strong><small>Для горячих клавиш ← и →.</small></span>
                <select value={playback.seekStep} onChange={(event) => changePlayback({ ...playback, seekStep: Number(event.currentTarget.value) as SeekStep })}>
                  {SEEK_STEPS.map((value) => <option key={value} value={value}>{value} с</option>)}
                </select>
              </label>
            </SettingCard>
            <SettingCard title="Сохранять между перезапусками" detail="Настройки независимы и не меняют текущую очередь.">
              <ToggleRow title="Очередь воспроизведения" detail="Сохранять порядок и выбранный трек. Позиция в треке не сохраняется." enabled={playback.rememberQueue} change={() => changePlayback({ ...playback, rememberQueue: !playback.rememberQueue })} />
              <ToggleRow title="Режим повтора" detail="Сохранять повтор трека или всей очереди." enabled={playback.rememberRepeat} change={() => changePlayback({ ...playback, rememberRepeat: !playback.rememberRepeat })} />
              <ToggleRow title="Режим перемешивания" detail="Помнить перемешивание даже при отключённом сохранении очереди." enabled={playback.rememberShuffle} change={() => changePlayback({ ...playback, rememberShuffle: !playback.rememberShuffle })} />
            </SettingCard>
            <div className="settings-footer-note"><Settings2 size={16} /><span>Эти параметры действуют в плеере Luma. Сайт и публичный виджет VK управляют звуком отдельно.</span></div>
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
            <SettingCard title="Виджеты рабочего стола" detail="Компактный плеер поверх окон Windows. Продолжает то же воспроизведение; полноразмерное окно можно вернуть кнопкой или Esc.">
              <label className="setting-row select-row"><span><strong>Фон</strong><small>Применяется к компактному плееру.</small></span>
                <select value={appearance.widgetBackground} onChange={(event) => changeAppearance({ ...appearance, widgetBackground: event.currentTarget.value as WidgetBackground })}>
                  {Object.entries(WIDGET_BACKGROUNDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select></label>
              <div className="settings-actions">
                {window.luma ? <button className="button outline-button" type="button" onClick={props.openWidget}><Monitor size={16} /> Открыть виджет Luma</button> : <span className="setting-status">В приложении Windows</span>}
              </div>
            </SettingCard>
            <SettingCard title="Системная медиапанель">
              <ToggleRow title="Передавать данные трека системе" detail="Название, исполнитель и обложка для медиапанели. Медиаклавиши работают отдельно." enabled={playback.publishTrack} change={() => changePlayback({ ...playback, publishTrack: !playback.publishTrack })} />
            </SettingCard>
            <SettingCard title="Сервисы">
              <VkAccountSettings connected={props.connected} openVk={props.openVk} />
              <Service title="Last.fm" status="Не подключён">
                <p>Для входа и скробблинга нужны ключ и секрет зарегистрированного приложения Last.fm. Эта сборка не отправляет данные в Last.fm.</p>
              </Service>
              <Service title="Тексты песен" status="LRCLIB">
                <p>Доступен LRCLIB. Для следующих источников — Musixmatch, Genius и VK — пока нет подключённого доступа к текстам.</p>
                <ToggleRow title="Автопоиск текстов" detail="Искать для играющего трека на главной. LRCLIB получит название, исполнителя, альбом и длительность, если они известны." enabled={props.autoLyrics} change={() => props.toggleLyrics('autoLyrics')} />
                {window.luma && <ToggleRow title="Сохранять текст с новым MP3" detail="При сохранении разрешённого MP3: синхронный текст в соседний .lrc, обычный — в тег MP3. Существующие файлы не меняются." enabled={props.exportLyrics} change={() => props.toggleLyrics('exportLyrics')} />}
              </Service>
              <Service title="iTunes" status="Поиск данных">
                <p>Поиск названия и тегов в каталоге Apple Music запускается вручную. Сервис независим, доступность не гарантируется. Автозамены обложек VK и записи тегов в исходный файл нет.</p>
                {props.openTrackInfo && <div className="settings-actions"><button className="button outline-button" type="button" onClick={props.openTrackInfo}>Данные текущего трека</button></div>}
              </Service>
              <Service title="VK Recommendations" status="Нет доступа">
                <p>Luma не передаёт данные о треках в VK Recommendations. «Похожее на прослушанное» и «Недавно слушали» в Luma строятся локально и не требуют входа.</p>
              </Service>
            </SettingCard>
          </>}
          {section?.id === 'storage' && <>
            <SettingCard title="Локальный профиль" detail="Настройки, обложки и история остаются на устройстве; на Windows исходные аудиофайлы не копируются при добавлении.">
              <dl className="settings-storage"><div><dt>Треков с устройства</dt><dd>{formatCount(props.localCount, appearance.fullNumbers)}</dd></div><div><dt>Недавних треков</dt><dd>{formatCount(props.recentCount, appearance.fullNumbers)}</dd></div></dl>
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
          {section?.id === 'labs' && <>
            <SettingCard title="Аудиореактивные фоны" detail="Экспериментальный спектр и подсветка для файлов в Luma.">
              <ToggleRow title="Реакция на музыку" detail="Выключите, если нужен более спокойный фон или меньше нагрузки." enabled={appearance.audioReactive} change={() => changeAppearance({ ...appearance, audioReactive: !appearance.audioReactive })} />
            </SettingCard>
            <SettingCard title="Поиск записи по звуку" detail="При настроенном доступе к AcoustID появляется кнопка «По звуку» в редакторе данных. Для сравнения передаются только отпечаток и длительность.">
              {props.openTrackInfo && <div className="settings-actions"><button className="button outline-button" type="button" onClick={props.openTrackInfo}>Данные текущего трека</button></div>}
            </SettingCard>
          </>}
          {section?.id === 'keys' && <SettingCard title="Клавиатура" detail="Команды треков действуют при локальном воспроизведении.">
            <dl className="settings-shortcuts">{shortcuts.map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
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

function VkAccountSettings({ connected, openVk }: { connected: boolean; openVk(): void }) {
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState('');
  return <Service title="VK Music" status="Официальный сайт">
    <p><strong>Статус аккаунта:</strong> проверьте на странице VK. Luma не читает данные входа и не может подтвердить ваш аккаунт.</p>
    <p>Плеер сайта и публичный виджет не используют аудио API Luma. Треки из VK Микса, радио, «Для вас» и «Открытий» нельзя переносить в очередь Luma.</p>
    {window.luma && <div className="settings-actions">
      <button className="button outline-button" type="button" disabled={resetting || !connected} onClick={openVk}>Войти в VK в Luma</button>
      <button className="button outline-button" type="button" disabled={resetting} onClick={() => {
        setResetting(true); setNotice('');
        void window.luma?.vk.reset().then((done) => { if (done) setNotice('Данные входа в Luma очищены.'); }, () => setNotice('Не удалось очистить данные входа VK.')).finally(() => setResetting(false));
      }}>{resetting ? 'Сбрасываем…' : 'Сбросить данные аккаунта'}</button>
    </div>}
    {notice && <p className="setting-hint" role="status">{notice}</p>}
    {!window.luma && <p className="setting-hint">Вход доступен только на странице VK в настольном приложении.</p>}
  </Service>;
}
