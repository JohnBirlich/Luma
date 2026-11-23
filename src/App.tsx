import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { UiText } from './i18n/context';
import type { Text } from './i18n/text';
import { textFor } from './i18n/text';
import { CircleAlert, CircleCheck, FileAudio, X } from 'lucide-react';
import { GlassNavigation, Sidebar, TitleBar } from './components/Chrome';
import type { Page } from './components/Chrome';
import { LibraryPage, NowPlayingCard } from './components/Collection';
import { CoverEditor } from './components/CoverEditor';
import { DesktopWidget } from './components/DesktopWidget';
import { DiagnosticsPage } from './components/Diagnostics';
import { Equalizer } from './components/Equalizer';
import { FullscreenPlayer } from './components/FullscreenPlayer';
import type { PlaybackProps } from './components/PlaybackControls';
import { LyricsPanel } from './components/LyricsPanel';
import { MixesPage } from './components/Mixes';
import { OnlineCredit } from './components/OnlineMusic';
import type { HomeTab } from './components/HomePage';
import type { OnlineAction } from './components/OnlineMusic';
import { MusicLinkDialog } from './components/MusicLinkDialog';
import { MenuPage } from './components/Menu';
import { NowPlayingDialog } from './components/NowPlayingOptions';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { SettingsPage } from './components/Settings';
import type { SettingsSectionId } from './components/Settings';
import { TrackDetailsEditor } from './components/TrackDetailsEditor';
import { useCoverArt } from './data/cover-art';
import { demoTracks } from './data/demos';
import { connectionState, recordDiagnostic, subscribeConnection } from './data/diagnostics';
import { saveSharedPlaylist } from './data/playlist-share';
import { musicLaunchUrl, readMusicLink } from './shared/music-links';
import { vkMusicSearchUrl, vkSiteEntry } from './shared/vk-site';
import { VK_MUSIC_URL } from './shared/vk';
import { localLibrary } from './data/library';
import { useTrackDetails } from './data/track-details';
import type { TrackDetails } from './data/track-details';
import { useMediaSession } from './player/mediaSession';
import { activeOnlineRefs, catalogQueueRefs, readPreferences, readFavorites, rememberTrack, savePreferences } from './player/preferences';
import { useSleepTimer } from './player/useSleepTimer';
import { verifiedLocalReplacement } from './shared/recording-match';
import { useAudio } from './player/useAudio';
import { usePresentation } from './player/usePresentation';
import { useTrackLyrics } from './player/useTrackLyrics';
import { usePalette } from './player/usePalette';
import { trackCoverKey, withCover } from './shared/artwork';
import type { CoverTarget } from './shared/artwork';
import { defaultAppearance, defaultPlayback, scheduledTheme, shouldAdvanceAfterEnd, themeVariables } from './shared/customization';
import type { Appearance, LibraryLayout } from './shared/customization';
import { clamp } from './shared/equalizer';
import { defaultAudioQuality, isMetered } from './shared/audio-quality';
import { dataLocale } from './shared/app-info';
import { AUDIO_ACCEPT, trackCount } from './shared/media';
import { adjacentStationId, stationTracks, STATION_IDS, tuneStation } from './shared/radio';
import { radioBrowserTrack } from './shared/radio-browser';
import type { RadioBrowserStation } from './shared/radio-browser';
import { MAX_PLAYLISTS, playlistTitle, playlistTrackIds } from './shared/luma-playlists';
import { rememberSearch } from './shared/search-history';
import { MAX_ONLINE_TRACKS, readOnlineTrack, sessionCatalogId } from './shared/online';
import type { OnlineTrack } from './shared/online';
import type { ImportResult, Track } from './shared/media';
import { adjacentId, appendToQueue, moveUpcoming, reconcileQueue, removeFromQueue, replaceCurrent, startQueue, toggleShuffle, upcomingIds } from './shared/queue';
import type { QueueState } from './shared/queue';

type NoticeText = string | ((t: Text) => string);
interface Notice { message: NoticeText; detail?: NoticeText; error?: boolean }
const noticeText = (t: Text, message: NoticeText) => typeof message === 'function' ? message(t) : t(message);
const demoIds = demoTracks.map((track) => track.id);
const noop = () => undefined;
const noMediaActions = {};
const PlaylistImport = lazy(() => import('./components/PlaylistImport').then(({ PlaylistImport }) => ({ default: PlaylistImport })));
const HomePage = lazy(() => import('./components/HomePage').then(({ HomePage }) => ({ default: HomePage })));
const noTransition = { seconds: 0, next: (): Track | undefined => undefined, advance: (_id: string) => undefined as void };
const connection = (navigator as Navigator & { connection?: EventTarget & { type?: string; saveData?: boolean } }).connection;
function dataSaving() { return isMetered('auto', connection); }
function subscribeNetwork(listener: () => void) {
  connection?.addEventListener('change', listener);
  return () => connection?.removeEventListener('change', listener);
}
export default function App() {
  const [boot] = useState(readPreferences);
  const [preferences, setPreferences] = useState(boot);
  const t = useMemo(() => textFor(preferences.uiLanguage), [preferences.uiLanguage]);
  useEffect(() => {
    document.documentElement.lang = preferences.uiLanguage;
    void window.luma?.setUiLanguage?.(preferences.uiLanguage).catch(() => {});
  }, [preferences.uiLanguage]);
  const [queue, setQueue] = useState(() => boot.queue ?? startQueue(boot.showDemos ? demoIds : [], undefined, boot.resumeRepeat));
  const queueRef = useRef(queue);
  const commit = useCallback((next: QueueState) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [discoveredStation, setDiscoveredStation] = useState<Track>();
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState<Page>(boot.playback.startPage === 'local' ? 'library' : boot.playback.startPage);
  const [homeTab, setHomeTab] = useState<HomeTab>('home');
  const [homeQuery, setHomeQuery] = useState('');
  const [vkUrl, setVkUrl] = useState<string>();
  const closeVk = useCallback(() => {
    setVkUrl(undefined);
    setHomeTab((tab) => tab === 'vk' ? 'home' : tab);
  }, []);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>();
  const settingsFrom = useRef<{ page: Exclude<Page, 'settings'>; top: number }>({ page: 'player', top: 0 });
  const returningTop = useRef(0);
  const basePage = page === 'settings' ? settingsFrom.current.page : page;
  const [libraryScope, setLibraryScope] = useState<'all' | 'offline'>(boot.playback.startPage === 'local' ? 'offline' : 'all');
  const [widget, setWidget] = useState(false);
  const [widgetPending, setWidgetPending] = useState(false);
  const switchingWidget = useRef(false);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [importPlaylist, setImportPlaylist] = useState(false);
  const [musicDialog, setMusicDialog] = useState<{ url?: string }>();
  const lastHandoff = useRef<typeof musicDialog>(undefined);
  const [coverTarget, setCoverTarget] = useState<CoverTarget>();
  const { urls: covers, update: updateCover } = useCoverArt();
  const [detailsId, setDetailsId] = useState<string>();
  const { details, update: updateDetails } = useTrackDetails();
  const [queueOpen, setQueueOpen] = useState(() => window.matchMedia('(min-width: 1080px)').matches);
  const [dropActive, setDropActive] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ended = useRef<() => void>(noop);
  const recover = useRef<(track: Track) => boolean>(() => false);
  const transition = useRef<{ seconds: number; next(track: Track): Track | undefined; advance(id: string): void }>(noTransition);
  const bootPlayback = useRef(false);
  const dropDepth = useRef(0);
  const scrollArea = useRef<HTMLElement>(null);

  const { appearance, playback, onlineTracks, onlineRefs, audioQuality } = preferences;
  const rememberQuery = useCallback((query: string) => setPreferences((data) => {
    const searchHistory = rememberSearch(data.searchHistory, query);
    return searchHistory === data.searchHistory ? data : { ...data, searchHistory };
  }), []);
  const clearSearchHistory = useCallback(() => setPreferences((data) => ({ ...data, searchHistory: [] })), []);

  const [systemLocale, setSystemLocale] = useState(() => dataLocale(navigator.language));
  useEffect(() => {
    void window.luma?.getAppInfo().then(({ systemLocale }) => setSystemLocale(dataLocale(systemLocale, navigator.language)), () => {});
    const change = () => setSystemLocale(dataLocale(navigator.language));
    window.addEventListener('languagechange', change);
    return () => window.removeEventListener('languagechange', change);
  }, []);
  const locale = appearance.dataLanguage === 'system' ? systemLocale : appearance.dataLanguage;
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    if (!appearance.autoTheme) return;
    const refresh = () => setHour(new Date().getHours());
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [appearance.autoTheme]);
  const effectiveAppearance = useMemo(() => ({ ...appearance, theme: scheduledTheme(appearance, hour) }), [appearance, hour]);
  const glass = effectiveAppearance.theme === 'macos';
  const metered = useSyncExternalStore(subscribeNetwork, dataSaving);
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const theme = useMemo(() => themeVariables(effectiveAppearance), [effectiveAppearance]);
  const savedOnline = useMemo(() => new Set(onlineTracks.map(({ id }) => id)), [onlineTracks]);
  const originals = useMemo(() => [...localTracks, ...(preferences.showDemos ? demoTracks : []), ...onlineTracks,
    ...onlineRefs.filter(({ id }) => !savedOnline.has(id))], [localTracks, onlineTracks, onlineRefs, savedOnline, preferences.showDemos]);
  const tracks = useMemo(() => originals.map((track) => {
    const override = details.get(track.id);
    return withCover(override ? { ...track, ...override } : track, covers.get(trackCoverKey(track.id)));
  }), [originals, covers, details]);
  const stationIds = useMemo(() => new Set(preferences.stationIds), [preferences.stationIds]);
  const collection = useMemo(() => tracks.filter(({ online, id }) => !online || savedOnline.has(id)), [tracks, savedOnline]);
  const byId = useMemo(() => new Map([...tracks, ...stationTracks, ...(discoveredStation ? [discoveredStation] : [])].map((track) => [track.id, track])), [tracks, discoveredStation]);
  const favoriteIds = useMemo(() => new Set(preferences.favorites), [preferences.favorites]);
  const dislikedIds = useMemo(() => new Set(preferences.disliked), [preferences.disliked]);
  const favorites = useMemo(() => tracks.filter(({ id }) => favoriteIds.has(id)), [tracks, favoriteIds]);
  const recent = useMemo(() => preferences.recent.flatMap((id) => byId.get(id) ?? []), [byId, preferences.recent]);
  const current = byId.get(queue.currentId ?? '') ?? null;
  const live = current?.online?.source === 'broadcast';
  const detailsTrack = detailsId ? byId.get(detailsId) : undefined;
  const modalOpen = Boolean(coverTarget || detailsTrack || showEqualizer || showAppearance || importPlaylist || (!widget && musicDialog));
  const { kind: presentationKind, show: showStage, close: closePresentation, stage: presentationStage } = usePresentation(appearance.nativeFullscreen);
  const presentationOpen = presentationKind !== null;
  const homeVisible = page === 'player' && !widget && !modalOpen && !presentationOpen;
  const vkAvailable = !!window.luma?.vkSite && homeVisible && !widgetPending && !homeQuery.trim() && connected && !dropActive
    && !(queueOpen && window.matchMedia('(max-width: 1079px)').matches);
  const vkOpen = vkAvailable && !!vkUrl && homeTab === 'vk';
  useLayoutEffect(() => { if (vkUrl && !vkOpen) closeVk(); }, [closeVk, vkOpen, vkUrl]);
  useEffect(() => {
    if (!vkUrl) return;
    const hide = () => { if (document.hidden) closeVk(); };
    document.addEventListener('visibilitychange', hide);
    hide();
    return () => document.removeEventListener('visibilitychange', hide);
  }, [closeVk, vkUrl]);
  const canUseLyrics = !!current && !live && !sessionCatalogId(current.id);
  const karaokeOpen = presentationKind === 'karaoke' && canUseLyrics;
  const showPresentation = useCallback(() => showStage('player'), [showStage]);
  const showKaraoke = useCallback(() => { if (canUseLyrics) showStage('karaoke'); }, [showStage, canUseLyrics]);
  const trackStarted = useCallback((id: string) => setPreferences((data) => {
    if (!data.playback.rememberRecent) return data;
    const recent = rememberTrack(data.recent, id);
    return recent === data.recent ? data : { ...data, recent };
  }), []);
  const player = useAudio(preferences.volume, preferences.equalizer, audioQuality, preferences.nativeFloat, ended, trackStarted, transition, recover);
  const { load, isPlaying, position, play, pause, toggle, seek } = player;
  const sleepExpired = useCallback(() => setNotice({ message: 'Таймер сна поставил музыку на паузу' }), []);
  const { deadline: sleepDeadline, change: changeSleepTimer, expire: expireSleep } = useSleepTimer(pause, sleepExpired);
  useLayoutEffect(() => {
    recover.current = (failed) => {
      const state = queueRef.current;
      if (!preferences.localFallback || state.currentId !== failed.id || expireSleep()) return false;
      const replacement = verifiedLocalReplacement(failed, collection.filter(({ id }) => !dislikedIds.has(id)));
      if (!replacement) return false;
      const next = replaceCurrent(state, failed.id, replacement.id);
      if (next === state) return false;
      commit(next);
      load(replacement, true);
      setNotice({ message: 'Включён резервный локальный файл', detail: (t) => t('Онлайн-источник недоступен. Играет «{0}» с этого устройства.', replacement.title) });
      return true;
    };
  }, [collection, commit, dislikedIds, expireSleep, load, preferences.localFallback]);
  const { discord } = preferences;
  const discordTitle = player.playing && !live && !sessionCatalogId(current?.id) ? current?.title : undefined;
  const discordArtist = discordTitle ? current?.artist : undefined;
  useEffect(() => {
    window.luma?.discord?.update(discord.enabled ? discord.clientId : '', discord.enabled && discordTitle && discordArtist
      ? { title: discordTitle, artist: discordArtist } : null);
  }, [discord, discordTitle, discordArtist]);
  const lyrics = useTrackLyrics(canUseLyrics ? current : null, { enabled: !widget && (karaokeOpen || (!presentationOpen && page === 'player' && homeTab === 'home' && !homeQuery.trim())),
    auto: preferences.autoLyrics, connected, playing: player.playing, duration: player.duration });
  const changeWidget = useCallback(async (enabled: boolean) => {
    if (!window.luma || switchingWidget.current || presentationOpen) return;
    switchingWidget.current = true;
    setWidgetPending(true);
    try { setWidget(await window.luma.window.setWidget(enabled)); }
    catch { setNotice({ message: "Не удалось переключить режим виджета.", error: true }); }
    finally { switchingWidget.current = false; setWidgetPending(false); }
  }, [presentationOpen]);
  useEffect(() => {
    const links = window.luma?.musicLinks;
    if (!links) return;
    let subscribed = true;
    const receive = () => void links.take().then((url) => {
      if (subscribed && url) setMusicDialog({ url });
    }).catch(() => {});
    const unsubscribe = links.onAvailable(receive);
    receive();
    return () => { subscribed = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!musicDialog?.url || widgetPending || musicDialog === lastHandoff.current) return;
    lastHandoff.current = musicDialog;
    if (presentationOpen) closePresentation();
    if (widget) void changeWidget(false);
  }, [changeWidget, closePresentation, musicDialog, presentationOpen, widget, widgetPending]);
  useEffect(() => window.luma?.window.onWidgetShortcut(() => {
    if (!modalOpen) void changeWidget(!widget);
  }), [changeWidget, modalOpen, widget]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1080px)');
    const resized = () => {
      if (!desktop.matches && !widget && !switchingWidget.current && !presentationOpen) setQueueOpen(false);
    };
    desktop.addEventListener('change', resized);
    return () => desktop.removeEventListener('change', resized);
  }, [widget, presentationOpen]);
  const sampledTone = usePalette(current);
  const tint = appearance.coverColors ? sampledTone : theme['--accent'];
  const transportPlaying = player.playing || !!player.loading;
  const playbackError = player.error;
  const queued = useMemo(() => queue.order.flatMap((id) => byId.get(id) ?? []), [queue.order, byId]);
  const upcoming = useMemo(() => upcomingIds(queue).flatMap((id) => byId.get(id) ?? []), [queue, byId]);
  const visibleNotice = notice && (notice.error || playback.successNotices) ? notice : undefined;
  const noticeDetail = visibleNotice?.detail && noticeText(t, visibleNotice.detail);

  useEffect(() => {
    let ignored = false;
    const start = performance.now();
    recordDiagnostic('library.opening');
    void localLibrary.list().then((allLocal) => {
      if (ignored) return;
      recordDiagnostic('library.opened', { tracks: allLocal.length, ms: performance.now() - start });
      setLocalTracks(allLocal);
      const ids = [...allLocal.map(({ id }) => id), ...(boot.showDemos ? demoIds : []), ...boot.onlineTracks.map(({ id }) => id)];
      const available = new Set([...ids, ...stationTracks.map(({ id }) => id), ...boot.onlineRefs.map(({ id }) => id)]);
      const state = queueRef.current;
      const restored = reconcileQueue(state, available);
      const initial = (!boot.queue && ids.length && !isPlaying()) || (!restored.order.length && state.order.length)
        ? startQueue(ids, ids[0], state.repeat) : restored;
      commit(boot.resumeShuffle && !initial.beforeShuffle && initial.order.length ? toggleShuffle(initial) : initial);
    }).catch(() => {
      if (!ignored) {
        recordDiagnostic('library.failed', { ms: performance.now() - start });
        setNotice({ message: "Не удалось открыть локальную медиатеку.", error: true });
      }
    }).finally(() => { if (!ignored) setReady(true); });
    return () => { ignored = true; };
  }, [boot, commit, isPlaying]);

  useEffect(() => { if (ready) savePreferences(preferences, queue); }, [ready, preferences, queue]);
  useEffect(() => { load(current); }, [load, current]);
  useEffect(() => {
    if (!ready || bootPlayback.current) return;
    bootPlayback.current = true;
    if (boot.playback.autoPlay && current && !current.online && !isPlaying()) play();
  }, [ready, boot, current, isPlaying, play]);
  useEffect(() => { if (presentationOpen && !current) closePresentation(); }, [presentationOpen, current, closePresentation]);
  useLayoutEffect(() => {
    scrollArea.current?.scrollTo({ top: returningTop.current });
    returningTop.current = 0;
  }, [page, libraryScope]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), notice.error ? 8500 : 4800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const playTrack = useCallback((id: string, toggleCurrent = false) => {
    const track = byId.get(id);
    if (!track) return;
    const state = queueRef.current;
    if (toggleCurrent && id === state.currentId) { toggle(); return; }
    if (track.online?.source === 'broadcast') {
      if (!connected) return;
      commit(tuneStation(state, id));
    } else commit({ ...appendToQueue(state, [id]), currentId: id });
    load(track, true);
  }, [byId, commit, connected, load, toggle]);

  const tuneDiscoveredStation = useCallback((station: RadioBrowserStation) => {
    if (!ready || busy.current) return;
    const track = radioBrowserTrack(station);
    if (!track) return;
    const state = queueRef.current;
    if (state.currentId === track.id) { toggle(); return; }
    if (!connected) return;
    const previous = discoveredStation?.id;
    // Keep only one dynamic radio reference in the session, even after a new search.
    const queue = previous && previous !== state.currentId && previous !== track.id ? removeFromQueue(state, previous) : state;
    setDiscoveredStation(track);
    commit(tuneStation(queue, track.id));
    load(track, true);
    void window.luma?.radioBrowser?.click(track.id).catch(() => {});
  }, [ready, connected, discoveredStation, commit, load, toggle]);

  const next = useCallback((finished = false) => {
    const state = queueRef.current;
    const station = adjacentStationId(state.currentId, 1);
    if (station) { if (!finished) playTrack(station); return; }
    const id = adjacentId(state, 1, finished);
    if (!id) return;
    if (id === state.currentId) seek(0);
    playTrack(id);
  }, [playTrack, seek]);
  const previous = useCallback(() => {
    const state = queueRef.current;
    const station = adjacentStationId(state.currentId, -1);
    if (station) { playTrack(station); return; }
    const id = adjacentId(state, -1);
    if (!id || position() > 3) seek(0);
    else playTrack(id);
  }, [playTrack, position, seek]);
  useEffect(() => {
    ended.current = () => {
      if (!expireSleep() && shouldAdvanceAfterEnd(playback, queueRef.current.repeat)) next(true);
    };
  }, [expireSleep, next, playback]);
  const cancelTransitions = player.cancelTransitions;
  useEffect(() => {
    if (!playback.autoNext || !playback.crossfade) {
      transition.current = noTransition;
      cancelTransitions();
      return;
    }
    transition.current = {
      seconds: playback.crossfade,
      next(track) {
        const state = queueRef.current;
        if (state.currentId !== track.id || expireSleep()) return;
        return byId.get(adjacentId(state, 1, true) ?? '');
      },
      advance(id) { commit({ ...queueRef.current, currentId: id }); },
    };
  }, [byId, cancelTransitions, commit, expireSleep, playback.autoNext, playback.crossfade]);
  const mediaActions = useMemo(() => ({
    play, pause, ...(!live || connected ? { nexttrack: () => next(), previoustrack: previous } : {}),
    stop: () => { pause(); seek(0); },
    ...(!live && {
      seekto: ({ seekTime }: MediaSessionActionDetails) => { if (seekTime !== undefined) seek(seekTime); },
      seekforward: ({ seekOffset }: MediaSessionActionDetails) => seek(seekOffset ?? playback.seekStep, true),
      seekbackward: ({ seekOffset }: MediaSessionActionDetails) => seek(-(seekOffset ?? playback.seekStep), true),
    }),
  }), [next, previous, play, pause, seek, live, connected, playback.seekStep]);
  useMediaSession(vkOpen ? null : current, player.playing, player.elapsed, player.duration, vkOpen ? noMediaActions : mediaActions, playback.publishTrack);

  const setVolume = useCallback((value: number) => {
    const volume = clamp(value, 0, 1);
    setPreferences((data) => ({ ...data, volume, lastVolume: volume > 0 ? volume : data.lastVolume }));
  }, []);
  const mute = useCallback(() => setPreferences((data) => ({ ...data, volume: data.volume > 0 ? 0 : data.lastVolume })), []);

  const importMusic = useCallback(async (operation: () => Promise<ImportResult>) => {
    if (!ready || busy.current) return;
    busy.current = true;
    setWorking(true);
    const start = performance.now();
    recordDiagnostic('library.import');
    try {
      const result = await operation();
      if (result.cancelled) { recordDiagnostic('library.cancelled'); return; }
      const snapshot = { ms: performance.now() - start, added: result.added.length, duplicates: result.duplicates, failed: result.failures.length };
      recordDiagnostic(result.failures.length && !result.added.length ? 'library.importFailed' : result.temporary || result.failures.length ? 'library.partial' : 'library.imported', snapshot);
      setLocalTracks(result.tracks);
      const state = queueRef.current;
      if (result.added.length) {
        const firstImport = localTracks.length === 0 && state.currentId?.startsWith('demo-') && !isPlaying() && !position() && state.order.every((id) => demoIds.includes(id));
        const initial = firstImport ? startQueue(result.added, result.added[0], state.repeat) : undefined;
        commit(initial ? state.beforeShuffle ? toggleShuffle(initial) : initial : appendToQueue(state, result.added));
      }
      const explainImport = (t: Text) => {
        const notes: string[] = [];
        if (result.duplicates) notes.push(t("Уже в медиатеке: {0}.", result.duplicates));
        if (result.failures.length) notes.push(`${result.failures[0].name}: ${t(result.failures[0].message)}${result.failures.length > 1 ? t(" Ещё ошибок: {0}.", result.failures.length - 1) : ''}`);
        if (result.temporary) notes.push(t("Браузер не сохранил часть файлов: они доступны до закрытия вкладки."));
        return notes.join(' ');
      };
      setNotice({
        message: (t) => result.added.length ? t("Добавлено: {0}", trackCount(result.added.length, appearance.fullNumbers, t.language)) : result.failures.length ? t("Не удалось добавить файлы") : t("Новых треков нет"),
        detail: explainImport, error: result.failures.length > 0 || result.temporary,
      });
    } catch {
      recordDiagnostic('library.importFailed', { ms: performance.now() - start });
      setNotice({ message: "Не удалось добавить музыку.", detail: "Проверьте доступ к файлам и повторите попытку.", error: true });
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }, [ready, localTracks.length, isPlaying, position, commit, appearance.fullNumbers]);

  const choose = useCallback(() => {
    if (!ready || busy.current) return;
    if (localLibrary.choose) void importMusic(localLibrary.choose);
    else fileInput.current?.click();
  }, [ready, importMusic]);
  function handleFiles(files: File[]) {
    if (files.length) void importMusic(() => localLibrary.add(files));
  }
  function filesDragged(event: DragEvent): boolean { return event.dataTransfer.types.includes('Files'); }

  const exitSettings = useCallback(() => {
    returningTop.current = settingsFrom.current.top;
    setPage(settingsFrom.current.page);
  }, []);
  const openSettings = useCallback(() => {
    if (page === 'settings') { exitSettings(); return; }
    settingsFrom.current = { page, top: scrollArea.current?.scrollTop ?? 0 };
    if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false);
    setPage('settings');
  }, [page, exitSettings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || modalOpen) return;
      if (widget && event.key === 'Escape') { event.preventDefault(); if (!event.repeat) void changeWidget(false); return; }
      if (widget && !event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'KeyF') return;
      if (widget && (event.ctrlKey || event.metaKey)) return;
      if (!presentationOpen && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === 'KeyL') {
        event.preventDefault();
        if (!event.repeat) { setPage('diagnostics'); if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false); }
        return;
      }
      if (!presentationOpen && (event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'Comma') {
        event.preventDefault();
        if (!event.repeat) openSettings();
        return;
      }
      if (!presentationOpen && (event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyO') {
        event.preventDefault();
        if (!event.repeat) choose();
        return;
      }
      if (vkOpen) return; // VK has its own transport controls.
      if (!event.altKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyF' && current
        && !(event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]'))) {
        event.preventDefault();
        if (!event.repeat) (presentationOpen ? closePresentation : showPresentation)();
        return;
      }
      if (!presentationOpen && event.key === 'Escape' && queueOpen && window.matchMedia('(max-width: 1079px)').matches) { setQueueOpen(false); return; }
      if (event.altKey || event.metaKey || event.ctrlKey || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable], button, a'))) return;
      if (event.code === 'KeyL' && current && !widget) {
        event.preventDefault();
        if (!event.repeat) (presentationKind === 'karaoke' ? closePresentation : showKaraoke)();
      } else if (event.code === 'Space' || event.code === 'KeyK') { event.preventDefault(); if (!event.repeat) toggle(); }
      else if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
        event.preventDefault();
        const forward = event.code === 'ArrowRight';
        if (live) {
          if (!event.repeat) (forward ? next : previous)();
        } else seek(forward ? playback.seekStep : -playback.seekStep, true);
      } else if (event.code === 'KeyM' && !event.repeat) mute();
      else if (!presentationOpen && event.code === 'KeyQ' && !event.repeat) setQueueOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choose, mute, seek, toggle, next, previous, live, modalOpen, presentationOpen, presentationKind, showPresentation, showKaraoke, closePresentation, current, queueOpen, widget, changeWidget, openSettings, playback.seekStep, vkOpen]);

  function addToQueue(id: string) {
    const state = queueRef.current;
    if (!byId.has(id)) return;
    if (state.order.includes(id)) { setNotice({ message: "Трек уже в очереди" }); return; }
    commit(appendToQueue(state, [id]));
    setNotice({ message: "Трек добавлен в очередь" });
  }
  function removeQueued(id: string) {
    const state = queueRef.current;
    const updated = removeFromQueue(state, id);
    commit(updated);
    if (state.currentId !== updated.currentId) load(byId.get(updated.currentId ?? '') ?? null, isPlaying());
  }
  async function removeLocal(id: string) {
    if (!ready || busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      setLocalTracks(await localLibrary.remove(id));
      removeQueued(id);
      void updateCover(trackCoverKey(id));
      updateDetails(id);
      setPreferences((data) => ({ ...data, favorites: data.favorites.filter((favorite) => favorite !== id), disliked: data.disliked.filter((item) => item !== id), recent: data.recent.filter((recentId) => recentId !== id) }));
      setNotice({ message: "Трек убран из медиатеки", detail: "Исходный файл не удалён." });
    } catch {
      setNotice({ message: "Не удалось убрать трек из медиатеки.", error: true });
    } finally { busy.current = false; setWorking(false); }
  }
  const chooseOnline = useCallback((track: OnlineTrack, action: OnlineAction) => {
    if (!ready || (sessionCatalogId(track.id) && action !== 'play' && action !== 'queue')) return;
    const state = queueRef.current;
    if (action === 'cache') {
      if (!window.luma?.streamCache || busy.current) return;
      if (!savedOnline.has(track.id) && onlineTracks.length >= MAX_ONLINE_TRACKS) {
        setNotice({ message: "Коллекция онлайн-ссылок заполнена", error: true });
        return;
      }
      busy.current = true; setWorking(true); setNotice(undefined);
      void window.luma.streamCache.save(track).catch(() => false).then((saved) => {
        if (!saved) { setNotice({ message: "Не удалось сохранить в кэш", detail: "Проверьте сеть. Кэш принимает только подходящие MP3 до 32 МБ.", error: true }); return; }
        setPreferences((data) => data.onlineTracks.some(({ id }) => id === track.id) ? data : {
          ...data, onlineTracks: [...data.onlineTracks, track], onlineRefs: data.onlineRefs.filter(({ id }) => id !== track.id),
        });
        setNotice({ message: "Копия в кэше", detail: "Запись доступна в «Медиатека → Из интернета»." });
      }).finally(() => { busy.current = false; setWorking(false); });
      return;
    }
    if (action === 'export') {
      if (!window.luma || busy.current) return;
      busy.current = true;
      setWorking(true);
      setNotice(undefined);
      void window.luma.exportMp3(track, preferences.exportLyrics).then((result) => {
        if (result.saved) {
          const notes: string[] = [];
          if (result.lyrics) {
            const { synced, plain } = result.lyrics;
            if (synced === 'saved') notes.push("Синхронный текст сохранён в .lrc.");
            if (plain === 'saved') notes.push("Обычный текст добавлен в тег MP3.");
            if (synced === 'existing') notes.push("Существующий .lrc не изменён.");
            if (plain === 'existing') notes.push("Исходный текст в теге MP3 сохранён.");
            if (synced === 'failed' || plain === 'failed') notes.push("Не удалось записать часть текстов.");
            if (!synced && !plain) notes.push("Подходящий текст не найден.");
          }
          if (!result.credit) notes.push("Не удалось сохранить файл с источником и лицензией.");
          setNotice({ message: "Копия MP3 сохранена", detail: notes.length ? (t) => notes.map((key) => t(key)).join(' ') : undefined, error: !result.credit });
        }
      }, (error: unknown) => {
        const detail = error instanceof Error && /Файл уже существует/.test(error.message) ? "Файл уже существует. Выберите новое имя." : "Запись может быть недоступна для скачивания. Проверьте сеть и путь сохранения.";
        setNotice({ message: "Не удалось сохранить MP3", detail, error: true });
      }).finally(() => { busy.current = false; setWorking(false); });
      return;
    }
    if (action === 'save') {
      if (savedOnline.has(track.id)) { setNotice({ message: "Запись уже сохранена" }); return; }
      if (onlineTracks.length >= MAX_ONLINE_TRACKS) {
        setNotice({ message: "Коллекция онлайн-ссылок заполнена", detail: "Уберите одну из сохранённых записей и попробуйте снова.", error: true });
        return;
      }
      setPreferences((data) => ({ ...data, onlineTracks: [...data.onlineTracks, track], onlineRefs: data.onlineRefs.filter(({ id }) => id !== track.id) }));
      setNotice({ message: "Ссылка сохранена в «Из интернета»" });
      return;
    }
    const existing = byId.get(track.id);
    if (!existing) {
      const refs = activeOnlineRefs({ ...preferences, queue: state });
      if (refs.length >= MAX_ONLINE_TRACKS) {
        setNotice({ message: "Слишком много онлайн-треков в очереди и истории", detail: "Удалите часть ссылок или очистите историю.", error: true });
        return;
      }
      setPreferences((data) => ({ ...data, onlineRefs: [...refs, track] }));
    }
    if (action === 'play') {
      commit({ ...appendToQueue(state, [track.id]), currentId: track.id });
      load(existing ?? track, true);
    } else if (state.order.includes(track.id)) setNotice({ message: "Трек уже в очереди" });
    else { commit(appendToQueue(state, [track.id])); setNotice({ message: "Онлайн-трек добавлен в очередь" }); }
  }, [ready, preferences, onlineTracks.length, savedOnline, byId, commit, load]);
  function removeTrack(id: string) {
    if (!byId.get(id)?.online) { void removeLocal(id); return; }
    removeQueued(id);
    void updateCover(trackCoverKey(id));
    setPreferences((data) => ({ ...data, onlineTracks: data.onlineTracks.filter((track) => track.id !== id), onlineRefs: data.onlineRefs.filter((track) => track.id !== id),
      favorites: data.favorites.filter((item) => item !== id), recent: data.recent.filter((item) => item !== id) }));
    setNotice({ message: "Онлайн-ссылка убрана из медиатеки" });
  }
  function toggleDemos() {
    const state = queueRef.current;
    const showing = !preferences.showDemos;
    const updated = showing ? appendToQueue(state, demoIds) : demoIds.reduce(removeFromQueue, state);
    setPreferences((data) => ({ ...data, showDemos: showing }));
    commit(updated);
    if (state.currentId !== updated.currentId) load((byId.get(updated.currentId ?? '') ?? demoTracks.find(({ id }) => id === updated.currentId)) ?? null);
  }
  function resetCustomization() {
    if (!preferences.showDemos) toggleDemos();
    changeSleepTimer();
    setPreferences((data) => ({ ...data, appearance: defaultAppearance, playback: defaultPlayback, audioQuality: defaultAudioQuality, nativeFloat: false, autoLyrics: false, exportLyrics: false, localFallback: false, discord: { ...data.discord, enabled: false } }));
    setNotice({ message: "Оформление и параметры воспроизведения сброшены" });
  }
  function editTrackDetails(id: string) {
    dropDepth.current = 0;
    setDropActive(false);
    setDetailsId(id);
  }
  function saveDetails(value?: TrackDetails) {
    if (!detailsTrack) return;
    const saved = updateDetails(detailsTrack.id, value);
    setNotice(saved ? { message: value ? "Данные трека сохранены" : "Исходные данные возвращены" } : {
      message: "Данные изменены только для этой сессии",
      detail: "Не удалось сохранить их в профиле Luma.", error: true,
    });
  }
  function editTrackCover(id: string) {
    if (sessionCatalogId(id)) return;
    const track = originals.find((item) => item.id === id);
    if (track) setCoverTarget({ key: trackCoverKey(id), title: byId.get(id)?.title ?? track.title, kind: 'track', originalUrl: track.artworkUrl });
  }
  async function saveCover(image?: Blob) {
    if (!coverTarget) return;
    const saved = await updateCover(coverTarget.key, image);
    setNotice(saved ? { message: image ? "Обложка сохранена" : "Исходная обложка возвращена" } : {
      message: "Обложка изменена только для этой сессии",
      detail: "Не удалось сохранить её в профиле Luma.",
      error: true,
    });
  }
  const playAll = useCallback((items: Track[], start?: string) => {
    const first = items.find(({ id }) => id === start) ?? items[0];
    if (!first) return;
    const { repeat, beforeShuffle } = queueRef.current;
    const initial = startQueue(items.map(({ id }) => id), first.id, repeat);
    commit(beforeShuffle ? toggleShuffle(initial) : initial);
    load(first, true);
  }, [commit, load]);
  const playCatalog = useCallback((items: Track[], start?: string) => {
    if (!ready || busy.current) return false;
    const playable = items.filter((item) => connected || !item.online);
    const first = playable.find(({ id }) => id === start) ?? playable[0];
    if (!first) return false;
    const { repeat, beforeShuffle } = queueRef.current;
    const initial = startQueue(playable.map(({ id }) => id), first.id, repeat);
    const next = beforeShuffle ? toggleShuffle(initial) : initial;
    const onlineRefs = catalogQueueRefs(preferences, next, playable.flatMap((item) => {
      const online = !byId.has(item.id) && item.online && readOnlineTrack(item);
      return online ? [online] : [];
    }));
    if (onlineRefs.length > MAX_ONLINE_TRACKS) {
      setNotice({ message: 'Слишком много онлайн-треков в очереди и истории', detail: 'Удалите часть ссылок или очистите историю.', error: true });
      return false;
    }
    setPreferences((data) => ({ ...data, onlineRefs }));
    commit(next);
    load(byId.get(first.id) ?? first, true);
    return true;
  }, [ready, connected, preferences, byId, commit, load]);
  const sharePlaylist = (title: string, tracks: readonly Track[]) => {
    void saveSharedPlaylist(title, tracks).then((saved) => {
      if (saved) setNotice({ message: 'Файл обмена готов', detail: 'В нём только данные о записях, без аудио. Откройте его через «Импорт плейлиста → Luma».' });
    }).catch(() => setNotice({ message: 'Не удалось сохранить файл обмена.', error: true }));
  };
  const shareTrack = (track: Track) => {
    if (track.demo || sessionCatalogId(track.id) || track.online?.source === 'broadcast') return;
    const link = track.id.startsWith('ov-') && readOnlineTrack(track)
      ? readMusicLink(`https://openverse.org/audio/${track.id.slice(3)}/`) : undefined;
    if (!link) { sharePlaylist(track.title, [track]); return; }
    const copy = window.luma?.musicLinks ? window.luma.musicLinks.copy(link.url) : navigator.clipboard?.writeText(musicLaunchUrl(link));
    if (!copy) { sharePlaylist(track.title, [track]); return; }
    void copy.then(() => setNotice({ message: 'Ссылка для Luma скопирована', detail: 'Её можно открыть в установленной Luma или вставить в окно «Открыть музыкальную ссылку».' }),
      () => sharePlaylist(track.title, [track]));
  };
  const seedFavorites = (tracks: readonly Track[]) => {
    const ids = new Set(readFavorites(tracks.map(({ id }) => id)));
    if (!ids.size) return;
    setPreferences((data) => ({ ...data, favorites: readFavorites([...data.favorites, ...ids]), disliked: data.disliked.filter((id) => !ids.has(id)) }));
    setNotice({ message: 'Треки добавлены в «Любимое Luma»', detail: 'Лайки на внешних сервисах не изменены.' });
  };
  function savePlaylist(title: string, items: readonly Track[], existingId?: string) {
    const name = playlistTitle(title);
    if (!ready || !name || !items.length || (!existingId && preferences.playlists.length >= MAX_PLAYLISTS)) return false;
    if (existingId && !preferences.playlists.some(({ id }) => id === existingId)) return false;
    const trackIds = playlistTrackIds(items.map(({ id }) => id));
    if (!trackIds.length) return false;
    const playlist = { id: existingId ?? `list-${crypto.randomUUID()}`, title: name, trackIds };
    const playlists = existingId ? preferences.playlists.map((item) => item.id === existingId ? playlist : item) : [playlist, ...preferences.playlists];
    const keep = new Set(trackIds);
    const onlineRefs = catalogQueueRefs({ ...preferences, playlists }, queueRef.current, items.flatMap((item) => {
      const record = keep.has(item.id) && item.online && readOnlineTrack(item);
      return record ? [record] : [];
    }));
    if (onlineRefs.length > MAX_ONLINE_TRACKS) return false;
    setPreferences((data) => ({ ...data, playlists, onlineRefs }));
    return true;
  }
  function removePlaylist(id: string) {
    setPreferences((data) => {
      const next = { ...data, playlists: data.playlists.filter((item) => item.id !== id) };
      return { ...next, onlineRefs: activeOnlineRefs({ ...next, queue: queueRef.current }) };
    });
  }
  function queueMix(items: Track[]) {
    const state = queueRef.current;
    const updated = appendToQueue(state, items.map(({ id }) => id));
    commit(updated);
    setNotice({ message: updated === state ? "Все треки микса уже в очереди" : (t) => t("Добавлено: {0}", trackCount(updated.order.length - state.order.length, appearance.fullNumbers, t.language)) });
  }
  const navigate = useCallback((target: Page, scope: 'all' | 'offline' = 'all') => {
    if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false);
    if (target === 'library') setLibraryScope(scope);
    if (target === 'player') { setHomeTab('home'); setHomeQuery(''); }
    setPage(target);
  }, []);
  const goToLibrary = useCallback(() => navigate('library'), [navigate]);
  const openMixes = useCallback(() => navigate('mixes'), [navigate]);
  const openVk = useCallback((url: string) => {
    if (!window.luma?.vkSite || !connected || document.hidden || !vkSiteEntry(url)) return;
    pause(); // VK owns its queue. Keep the position and contents of the local queue.
    if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false);
    setPage('player');
    setHomeTab('vk');
    setHomeQuery('');
    setVkUrl(url);
  }, [connected, pause]);
  const selectHomeTab = useCallback((tab: HomeTab) => {
    if (tab === 'vk' && vkOpen) return;
    setHomeTab(tab); setHomeQuery('');
    scrollArea.current?.scrollTo({ top: 0 });
    if (tab === 'vk') openVk(VK_MUSIC_URL);
  }, [openVk, vkOpen]);
  const openRadio = useCallback(() => {
    navigate('player');
    selectHomeTab('radio');
  }, [navigate, selectHomeTab]);
  const searchVk = useCallback((query: string) => {
    const url = vkMusicSearchUrl(query);
    if (url) openVk(url);
  }, [openVk]);
  const radioActive = page === 'player' && homeTab === 'radio' && !homeQuery.trim();
  const openEqualizer = () => setShowEqualizer(true);
  const toggleQueue = () => setQueueOpen((open) => !open);
  const changeAppearance = (appearance: Appearance) => setPreferences((data) => ({ ...data, appearance }));
  const toggleCompact = () => setPreferences((data) => ({ ...data, appearance: { ...data.appearance, compactSidebar: !data.appearance.compactSidebar } }));
  const saveStation = useCallback((id: string) => {
    if (STATION_IDS.has(id)) setPreferences((data) => ({ ...data,
      stationIds: data.stationIds.includes(id) ? data.stationIds.filter((key) => key !== id) : [id, ...data.stationIds],
    }));
  }, []);
  const toggleFavorite = useCallback((id: string) => {
    if (sessionCatalogId(id)) return;
    if (STATION_IDS.has(id)) { saveStation(id); return; }
    setPreferences((data) => ({
      ...data, favorites: data.favorites.includes(id) ? data.favorites.filter((favorite) => favorite !== id) : [...data.favorites, id],
      disliked: data.disliked.filter((item) => item !== id),
    }));
  }, [saveStation]);
  const toggleDislike = useCallback((id: string) => setPreferences((data) => sessionCatalogId(id) ? data : ({
    ...data, disliked: data.disliked.includes(id) ? data.disliked.filter((item) => item !== id) : [...data.disliked, id],
    favorites: data.favorites.filter((item) => item !== id),
  })), []);
  const backToMenu = useCallback(() => setPage('menu'), []);
  const changeAutoCatalogSearch = useCallback((autoCatalogSearch: boolean) => setPreferences((data) => ({ ...data, autoCatalogSearch })), []);
  const changeLibraryLayout = (libraryLayout: LibraryLayout) => setPreferences((data) => ({ ...data, appearance: { ...data.appearance, libraryLayout } }));
  const closeQueue = () => setQueueOpen(false);
  const localControls: PlaybackProps = {
    hasTrack: Boolean(current), live, playing: transportPlaying, elapsed: player.elapsed, duration: player.duration,
    shuffle: queue.beforeShuffle !== null, repeat: queue.repeat, volume: preferences.volume,
    hasPrevious: live ? connected && !!adjacentStationId(queue.currentId, -1) : !!current,
    hasNext: live ? connected && !!adjacentStationId(queue.currentId, 1) : !!adjacentId(queue, 1),
    togglePlay: toggle, toggleShuffle: () => commit(toggleShuffle(queueRef.current)), toggleRepeat: () => {
      const state = queueRef.current;
      commit({ ...state, repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' });
    }, previous, next: () => next(), toggleMute: mute, setVolume, seek,
  };

  return (
    <UiText.Provider value={t}><div data-theme={effectiveAppearance.theme} data-layout={glass ? 'glass' : undefined} data-presentation={presentationOpen ? 'open' : undefined} data-sidebar={!glass ? appearance.compactSidebar ? 'compact' : 'expanded' : undefined} className={`app-shell${widget ? ' widget-mode' : queueOpen ? ' queue-visible' : ''}${!glass && appearance.classicDock ? ' classic-dock' : ''}${appearance.tabMotion ? ' tab-motion' : ''}${appearance.motion ? '' : ' motion-off'}${appearance.coverColors ? '' : ' cover-colors-off'}`} style={theme as CSSProperties}
      onDragEnter={(event) => {
        if (modalOpen || presentationOpen || widget || !filesDragged(event)) return;
        event.preventDefault();
        dropDepth.current++;
        setDropActive(true);
      }}
      onDragOver={(event) => { if (!modalOpen && !presentationOpen && !widget && filesDragged(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDragLeave={(event) => {
        if (modalOpen || presentationOpen || widget || !filesDragged(event)) return;
        dropDepth.current = Math.max(0, dropDepth.current - 1);
        if (!dropDepth.current) setDropActive(false);
      }}
      onDrop={(event) => {
        if (modalOpen || presentationOpen || widget || !filesDragged(event)) return;
        event.preventDefault();
        dropDepth.current = 0;
        setDropActive(false);
        handleFiles(Array.from(event.dataTransfer.files));
      }}>
      {!widget && <TitleBar glass={glass} openSettings={openSettings} settingsActive={page === 'settings'} addMusic={choose} busy={working || !ready} openRadio={openRadio} radioActive={radioActive} />}
      {!widget && (glass ? <GlassNavigation page={page} navigate={navigate} openEqualizer={openEqualizer} eqEnabled={preferences.equalizer.enabled} openRadio={openRadio} radioActive={radioActive} /> : <Sidebar page={page} navigate={navigate} openRadio={openRadio} radioActive={radioActive} addMusic={choose} busy={working || !ready} count={collection.length} favoriteCount={favorites.length}
        fullNumbers={appearance.fullNumbers} queued={queued.length} queueOpen={queueOpen} toggleQueue={toggleQueue} openEqualizer={openEqualizer} eqEnabled={preferences.equalizer.enabled}
        compact={appearance.compactSidebar} toggleCompact={toggleCompact} />)}
      <main className="main-pane" ref={scrollArea}>
        <div key={basePage} className="page-body" hidden={widget || page === 'settings'}>
        {basePage === 'player' ? <Suspense fallback={<p className="page" role="status">{t('Загружаем…')}</p>}>
          <HomePage tracks={collection} recent={recent} favorites={favoriteIds} disliked={dislikedIds} saved={savedOnline}
            tab={homeTab} query={homeQuery} setQuery={setHomeQuery} selectTab={selectHomeTab}
            autoCatalogSearch={preferences.autoCatalogSearch} changeAutoCatalogSearch={changeAutoCatalogSearch}
            searchHistory={preferences.searchHistory} rememberSearch={rememberQuery} clearSearchHistory={clearSearchHistory}
            currentId={queue.currentId} playing={transportPlaying} connected={connected} motion={appearance.motion} visible={homeVisible}
            vkUrl={vkOpen ? vkUrl : undefined} closeVk={closeVk} searchVk={window.luma?.vkSite ? searchVk : undefined}
            busy={working || !ready} play={playTrack} playMix={playAll} playCatalog={playCatalog} chooseOnline={chooseOnline} stationIds={stationIds} saveStation={saveStation} tuneDiscoveredStation={tuneDiscoveredStation} loading={!!player.loading}
            playlists={preferences.playlists} playlistTracks={byId} savePlaylist={savePlaylist} removePlaylist={removePlaylist} openPlaylistImport={() => setImportPlaylist(true)}
            openLibrary={goToLibrary} addMusic={choose} openMusicLink={() => setMusicDialog({})}
            sharePlaylist={sharePlaylist} seedFavorites={seedFavorites} openFavorites={() => navigate('favorites')}
            nowPlaying={<NowPlayingCard track={current} tint={tint} appearance={effectiveAppearance} disliked={dislikedIds} toggleDislike={toggleDislike}
              playing={player.playing} loading={!!player.loading} position={queue.order.indexOf(current?.id ?? '') + 1}
              count={queue.order.length} toggle={toggle} shareTrack={shareTrack}
              favorite={!!current && (live ? stationIds : favoriteIds).has(current.id)} toggleFavorite={toggleFavorite} openAppearance={() => setShowAppearance(true)}
              openPresentation={showPresentation} openKaraoke={showKaraoke} sleepActive={sleepDeadline !== undefined} openSleepTimer={() => { setSettingsSection('playback'); openSettings(); }} sceneVisible={page === 'player' && !widget && !presentationOpen && !modalOpen}
              readSpectrum={player.readSpectrum} editCover={editTrackCover} editDetails={editTrackDetails} addMusic={choose} />}
            lyrics={current && canUseLyrics && !presentationOpen && page === 'player' && (!current.demo || lyrics.attached)
              ? <LyricsPanel key={current.id} state={lyrics} elapsed={player.elapsed} seek={seek} clock={player.playing ? position : undefined} demo={current.demo} /> : undefined} />
          </Suspense> :
          basePage === 'diagnostics' ? <DiagnosticsPage back={backToMenu} locale={locale} /> :
          basePage === 'menu' ? <MenuPage localCount={localTracks.length} fullNumbers={appearance.fullNumbers}
            openSettings={openSettings} openLibrary={goToLibrary} openFavorites={() => navigate('favorites')} openRecent={() => navigate('recent')} openMixes={openMixes} openDiagnostics={() => navigate('diagnostics')} openEqualizer={openEqualizer} /> :
          basePage === 'mixes' ? <MixesPage tracks={collection} currentId={queue.currentId} playing={player.playing} favorites={favoriteIds} favoriteTracks={favorites} disliked={dislikedIds} recent={recent} fullNumbers={appearance.fullNumbers}
            playAll={playAll} addMix={queueMix} goToLibrary={goToLibrary} /> :
          <LibraryPage key={`${basePage}:${libraryScope}`} initialScope={basePage === 'library' ? libraryScope : 'all'} fullNumbers={appearance.fullNumbers} tracks={basePage === 'favorites' ? favorites : basePage === 'recent' ? recent : collection} currentId={queue.currentId} playing={player.playing} showDemos={preferences.showDemos} busy={working || !ready}
            visible={page === basePage && !widget && !modalOpen && !presentationOpen}
            autoCatalogSearch={preferences.autoCatalogSearch} changeAutoCatalogSearch={changeAutoCatalogSearch}
            searchHistory={preferences.searchHistory} rememberSearch={rememberQuery} clearSearchHistory={clearSearchHistory}
            mode={basePage === 'favorites' || basePage === 'search' || basePage === 'recent' ? basePage : 'library'} favorites={favoriteIds} disliked={dislikedIds} toggleDislike={toggleDislike} toggleFavorite={toggleFavorite} goToLibrary={goToLibrary} openMixes={() => navigate('mixes')} openRecent={() => navigate('recent')} openFavorites={() => navigate('favorites')}
            chooseOnline={chooseOnline} searchVk={window.luma?.vkSite ? searchVk : undefined} openSearch={() => navigate('search')} layout={appearance.libraryLayout} changeLayout={changeLibraryLayout} openHome={() => navigate('player')} addMusic={choose} toggleDemos={toggleDemos} play={(id) => playTrack(id, true)} playAll={playAll} add={addToQueue} editCover={editTrackCover} editDetails={editTrackDetails} remove={removeTrack} />}
        </div>
        {page === 'settings' && !widget && <div className="page-body" key="settings">
          <SettingsPage uiLanguage={preferences.uiLanguage} changeLanguage={(uiLanguage) => setPreferences((data) => ({ ...data, uiLanguage }))} appearance={appearance} effectiveAppearance={effectiveAppearance} locale={locale} playback={playback} audioQuality={audioQuality}
            playingStream={player.stream?.id === current?.id ? player.stream : undefined} connected={connected}
            nativeFloat={preferences.nativeFloat} floatStatus={player.floatStatus} changeFloat={(nativeFloat) => setPreferences((data) => ({ ...data, nativeFloat }))}
            metered={audioQuality.network === 'auto' ? metered : audioQuality.network === 'metered'}
            autoLyrics={preferences.autoLyrics} exportLyrics={preferences.exportLyrics} showDemos={preferences.showDemos} libraryReady={ready && !working}
            discord={preferences.discord} changeDiscord={(discord) => setPreferences((data) => ({ ...data, discord }))}
            sleepDeadline={sleepDeadline} changeSleepTimer={changeSleepTimer} localFallback={preferences.localFallback}
            toggleLocalFallback={() => setPreferences((data) => ({ ...data, localFallback: !data.localFallback }))}
            previewTrack={current} tint={tint} localCount={localTracks.length} recentCount={preferences.recent.length}
            volumeControls={localControls} eqEnabled={preferences.equalizer.enabled} openEqualizer={openEqualizer} openRecent={() => navigate('recent')}
            clearRecent={() => setPreferences((data) => ({ ...data, recent: [] }))} openDiagnostics={() => navigate('diagnostics')} changeAppearance={changeAppearance}
            changePlayback={(playback) => setPreferences((data) => ({ ...data, playback }))} toggleDemos={toggleDemos}
            changeQuality={(audioQuality) => setPreferences((data) => ({ ...data, audioQuality }))}
            toggleLyrics={(option) => setPreferences((data) => ({ ...data, [option]: !data[option] }))}
            toggleEffects={() => setPreferences((data) => ({ ...data, equalizer: { ...data.equalizer, enabled: !data.equalizer.enabled } }))}
            openLocalLibrary={() => navigate('library', 'offline')} widgetTint={sampledTone} openWidget={() => { void changeWidget(true); }}
            openTrackInfo={current && !current.demo && !current.online ? () => editTrackDetails(current.id) : undefined}
            reset={resetCustomization} sectionId={settingsSection} selectSection={setSettingsSection} returnToTab={exitSettings} />
        </div>}
      </main>
      {!widget && queueOpen && <>
        <button type="button" className="queue-scrim" onClick={closeQueue} aria-label={t("Закрыть панель очереди")} />
        <QueuePanel active={current} upcoming={upcoming} count={queued.length} fullNumbers={appearance.fullNumbers} duration={queued.reduce((sum, track) => sum + track.duration, 0)} playing={player.playing}
          close={closeQueue} play={(id) => playTrack(id, true)} remove={removeQueued} move={(from, to) => commit(moveUpcoming(queueRef.current, from, to))} goToLibrary={goToLibrary} />
      </>}
      {widget ? <DesktopWidget macos={glass} track={current} tint={sampledTone} appearance={appearance} playing={player.playing} sample={player.readSpectrum} controls={localControls} pending={widgetPending} restore={() => { void changeWidget(false); }} />
      : <PlayerBar {...localControls} track={current} classic={!glass && appearance.classicDock}
        goToPlayer={() => { navigate('player'); scrollArea.current?.scrollTo({ top: 0 }); }} openPresentation={showPresentation} openKaraoke={showKaraoke} queueOpen={queueOpen} toggleQueue={toggleQueue} />}
      {presentationKind && current && !widget && <FullscreenPlayer {...localControls} karaoke={karaokeOpen} lyrics={lyrics} clock={player.playing ? position : undefined}
        karaokeStyle={preferences.karaokeStyle} changeKaraokeStyle={(karaokeStyle) => setPreferences((data) => ({ ...data, karaokeStyle }))}
        toggleKaraoke={karaokeOpen ? showPresentation : showKaraoke} upcoming={upcoming} playUpcoming={playTrack} autoNext={playback.autoNext} stage={presentationStage} track={current} tint={tint} appearance={effectiveAppearance}
        favorite={(live ? stationIds : favoriteIds).has(current.id)} disliked={dislikedIds.has(current.id)} toggleDislike={toggleDislike} toggleFavorite={toggleFavorite} readSpectrum={player.readSpectrum} sceneVisible={!modalOpen} close={closePresentation}
        toggleQueue={() => setPreferences((data) => ({ ...data, appearance: { ...data.appearance, fullscreenQueue: !data.appearance.fullscreenQueue } }))}
        openAppearance={() => setShowAppearance(true)} openEqualizer={openEqualizer} />}
      <audio ref={player.ref} crossOrigin="anonymous" preload="metadata" onPlay={closeVk} />
      <audio ref={player.blendRef} data-blend-audio crossOrigin="anonymous" preload="none" onPlay={closeVk} />
      <audio ref={player.streamRef} data-online-audio preload="none" onPlay={closeVk} />
      <input type="file" ref={fileInput} hidden accept={AUDIO_ACCEPT} multiple onChange={(event) => {
        handleFiles(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = '';
      }} />
      {dropActive && <div className="drop-overlay" aria-hidden="true"><div><FileAudio size={30} /><strong>{t("Отпустите файлы")}</strong><span>{t("Добавим аудио в вашу медиатеку")}</span></div></div>}
      <div className="notifications" aria-live="polite">
        {(visibleNotice || playbackError) && <div className={`toast${visibleNotice?.error || (!visibleNotice && playbackError) ? ' toast-error' : ''}`}>
          {visibleNotice?.error || (!visibleNotice && playbackError) ? <CircleAlert size={20} /> : <CircleCheck size={20} />}
          <div><strong>{visibleNotice ? noticeText(t, visibleNotice.message) : t(playbackError)}</strong>{noticeDetail && <small>{noticeDetail}</small>}{!visibleNotice && playbackError && current?.online && <OnlineCredit track={{ online: current.online }} compact />}</div>
          {visibleNotice && <button type="button" className="icon-button" onClick={() => setNotice(undefined)} aria-label={t("Скрыть уведомление")}><X size={17} /></button>}
        </div>}
      </div>
      {musicDialog && !widget && !presentationOpen && <MusicLinkDialog key={musicDialog.url ?? 'paste'} initial={musicDialog.url} close={() => setMusicDialog(undefined)}
        connected={connected} disabled={working || !ready} choose={chooseOnline} openVk={window.luma?.vkSite ? openVk : undefined} />}
      {importPlaylist && <Suspense fallback={null}><PlaylistImport collection={collection} close={() => setImportPlaylist(false)} save={(title, items) => {
        if (!savePlaylist(title, items)) return false;
        setImportPlaylist(false);
        setNotice({ message: (t) => t('Плейлист «{0}» импортирован', playlistTitle(title)) });
        return true;
      }} /></Suspense>}
      {coverTarget && <CoverEditor key={coverTarget.key} target={coverTarget} currentUrl={covers.get(coverTarget.key)} update={saveCover} close={() => setCoverTarget(undefined)} />}
      {detailsTrack && <TrackDetailsEditor key={detailsTrack.id} locale={locale} track={detailsTrack} edited={details.has(detailsTrack.id)} save={saveDetails} close={() => setDetailsId(undefined)} />}
      {showAppearance && <NowPlayingDialog appearance={appearance} tint={tint} track={current} playing={player.playing} sample={player.playing && !current?.online ? player.readSpectrum : undefined} change={changeAppearance} close={() => setShowAppearance(false)} />}
      {showEqualizer && <Equalizer settings={preferences.equalizer} sampleRate={player.sampleRate} spectrum={player.readSpectrum} live={appearance.motion && player.playing && !current?.online} online={!!current?.online} change={(equalizer) => setPreferences((data) => ({ ...data, equalizer }))} close={() => setShowEqualizer(false)} />}
    </div></UiText.Provider>
  );
}
