import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { CircleAlert, CircleCheck, FileAudio, X } from 'lucide-react';
import { Sidebar, TitleBar } from './components/Chrome';
import type { Page } from './components/Chrome';
import { LibraryPage, PlayerPage } from './components/Collection';
import { CoverEditor } from './components/CoverEditor';
import { DiagnosticsPage } from './components/Diagnostics';
import { Equalizer } from './components/Equalizer';
import { FullscreenPlayer } from './components/FullscreenPlayer';
import type { PlaybackProps } from './components/PlaybackControls';
import { MenuPage } from './components/Menu';
import { NowPlayingDialog } from './components/NowPlayingOptions';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { SettingsPage } from './components/Settings';
import { TrackDetailsEditor } from './components/TrackDetailsEditor';
import { VkModeBar, VkMusicPage } from './components/VkMusic';
import { useCoverArt } from './data/cover-art';
import { demoTracks } from './data/demos';
import { recordDiagnostic } from './data/diagnostics';
import { localLibrary } from './data/library';
import { useTrackDetails } from './data/track-details';
import type { TrackDetails } from './data/track-details';
import { useMediaSession } from './player/mediaSession';
import { readPreferences, savePreferences } from './player/preferences';
import { useAudio } from './player/useAudio';
import { usePresentation } from './player/usePresentation';
import { usePalette } from './player/usePalette';
import { trackCoverKey, withCover } from './shared/artwork';
import type { CoverTarget } from './shared/artwork';
import { defaultAppearance, defaultPlayback, shouldAdvanceAfterEnd, themeVariables } from './shared/customization';
import type { Appearance, LibraryLayout } from './shared/customization';
import { clamp } from './shared/equalizer';
import { AUDIO_ACCEPT, trackCount } from './shared/media';
import type { ImportResult, Track } from './shared/media';
import { adjacentId, appendToQueue, moveUpcoming, reconcileQueue, removeFromQueue, startQueue, toggleShuffle, upcomingIds } from './shared/queue';
import type { QueueState } from './shared/queue';

interface Notice { message: string; detail?: string; error?: boolean }
const demoIds = demoTracks.map((track) => track.id);
const noop = () => undefined;
const noMediaActions = {};

export default function App() {
  const [boot] = useState(readPreferences);
  const [preferences, setPreferences] = useState(boot);
  const [queue, setQueue] = useState(() => boot.queue ?? startQueue(boot.showDemos ? demoIds : []));
  const queueRef = useRef(queue);
  const commit = useCallback((next: QueueState) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState<Page>(boot.playback.startPage);
  const isVkPage = page === 'vk';
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
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
  const dropDepth = useRef(0);
  const scrollArea = useRef<HTMLElement>(null);

  const { appearance, playback } = preferences;
  const theme = useMemo(() => themeVariables(appearance), [appearance]);
  const originals = useMemo(() => [...localTracks, ...(preferences.showDemos ? demoTracks : [])], [localTracks, preferences.showDemos]);
  const tracks = useMemo(() => originals.map((track) => {
    const override = details.get(track.id);
    return withCover(override ? { ...track, ...override } : track, covers.get(trackCoverKey(track.id)));
  }), [originals, covers, details]);
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const favoriteIds = useMemo(() => new Set(preferences.favorites), [preferences.favorites]);
  const favorites = useMemo(() => tracks.filter(({ id }) => favoriteIds.has(id)), [tracks, favoriteIds]);
  const current = byId.get(queue.currentId ?? '') ?? null;
  const detailsTrack = detailsId ? byId.get(detailsId) : undefined;
  const modalOpen = Boolean(coverTarget || detailsTrack || showEqualizer || showAppearance);
  const { open: presentationOpen, show: showPresentation, close: closePresentation } = usePresentation();
  const player = useAudio(preferences.volume, preferences.equalizer, ended);
  const { load, isPlaying, position, play, pause, toggle, seek } = player;
  const sampledTone = usePalette(appearance.coverColors ? current : null);
  const tint = appearance.coverColors ? sampledTone : theme['--accent'];
  const localPlaybackError = isVkPage ? '' : player.error;
  const queued = queue.order.flatMap((id) => byId.get(id) ?? []);
  const upcoming = upcomingIds(queue).flatMap((id) => byId.get(id) ?? []);

  useEffect(() => {
    let ignored = false;
    const start = performance.now();
    recordDiagnostic('library.opening');
    void localLibrary.list().then((allLocal) => {
      if (ignored) return;
      recordDiagnostic('library.opened', { tracks: allLocal.length, ms: performance.now() - start });
      setLocalTracks(allLocal);
      const ids = [...allLocal.map(({ id }) => id), ...(boot.showDemos ? demoIds : [])];
      const state = queueRef.current;
      const restored = reconcileQueue(state, new Set(ids));
      if ((!boot.queue && allLocal.length && !isPlaying()) || (!restored.order.length && state.order.length)) {
        commit(startQueue(ids, ids[0], state.repeat));
      } else commit(restored);
    }).catch(() => {
      if (!ignored) {
        recordDiagnostic('library.failed', { ms: performance.now() - start });
        setNotice({ message: 'Не удалось открыть локальную медиатеку.', error: true });
      }
    }).finally(() => { if (!ignored) setReady(true); });
    return () => { ignored = true; };
  }, [boot, commit, isPlaying]);

  useEffect(() => { if (ready) savePreferences({ ...preferences, queue }); }, [ready, preferences, queue]);
  useEffect(() => { load(current); }, [load, current]);
  useEffect(() => { if (presentationOpen && (!current || isVkPage)) closePresentation(); }, [presentationOpen, current, isVkPage, closePresentation]);
  useEffect(() => { scrollArea.current?.scrollTo({ top: 0 }); }, [page]);
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
    commit({ ...appendToQueue(state, [id]), currentId: id });
    load(track, true);
  }, [byId, commit, load, toggle]);

  const next = useCallback((finished = false) => {
    const state = queueRef.current;
    const id = adjacentId(state, 1, finished);
    if (!id) return;
    if (id === state.currentId) seek(0);
    playTrack(id);
  }, [playTrack, seek]);
  const previous = useCallback(() => {
    const id = adjacentId(queueRef.current, -1);
    if (!id || position() > 3) seek(0);
    else playTrack(id);
  }, [playTrack, position, seek]);
  useEffect(() => {
    ended.current = () => {
      if (!isVkPage && shouldAdvanceAfterEnd(playback, queueRef.current.repeat)) next(true);
    };
  }, [isVkPage, next, playback]);
  const mediaActions = useMemo(() => ({
    play, pause, nexttrack: () => next(), previoustrack: previous,
    stop: () => { pause(); seek(0); },
    seekto: ({ seekTime }: MediaSessionActionDetails) => { if (seekTime !== undefined) seek(seekTime); },
    seekforward: ({ seekOffset }: MediaSessionActionDetails) => seek(seekOffset ?? playback.seekStep, true),
    seekbackward: ({ seekOffset }: MediaSessionActionDetails) => seek(-(seekOffset ?? playback.seekStep), true),
  }), [next, previous, play, pause, seek, playback.seekStep]);
  useMediaSession(isVkPage ? null : current, player.playing, player.elapsed, player.duration, isVkPage ? noMediaActions : mediaActions);

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
        const firstImport = localTracks.length === 0 && state.currentId?.startsWith('demo-') && !isPlaying() && !position();
        commit(firstImport ? startQueue(result.added, result.added[0], state.repeat) : appendToQueue(state, result.added));
      }
      const notes: string[] = [];
      if (result.duplicates) notes.push(`Уже в медиатеке: ${result.duplicates}.`);
      if (result.failures.length) notes.push(`${result.failures[0].name}: ${result.failures[0].message}${result.failures.length > 1 ? ` Ещё ошибок: ${result.failures.length - 1}.` : ''}`);
      if (result.temporary) notes.push('Браузер не сохранил часть файлов: они доступны до закрытия вкладки.');
      setNotice({
        message: result.added.length ? `Добавлено: ${trackCount(result.added.length)}` : result.failures.length ? 'Не удалось добавить файлы' : 'Новых треков нет',
        detail: notes.join(' '), error: !result.added.length && result.failures.length > 0,
      });
    } catch {
      recordDiagnostic('library.importFailed', { ms: performance.now() - start });
      setNotice({ message: 'Не удалось добавить музыку.', detail: 'Проверьте доступ к файлам и повторите попытку.', error: true });
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }, [ready, localTracks.length, isPlaying, position, commit]);

  const choose = useCallback(() => {
    if (!ready || busy.current) return;
    if (localLibrary.choose) void importMusic(localLibrary.choose);
    else fileInput.current?.click();
  }, [ready, importMusic]);
  function handleFiles(files: File[]) {
    if (files.length) void importMusic(() => localLibrary.add(files));
  }
  function filesDragged(event: DragEvent): boolean { return event.dataTransfer.types.includes('Files'); }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || modalOpen) return;
      if (!presentationOpen && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === 'KeyL') {
        event.preventDefault();
        if (!event.repeat) { setPage('diagnostics'); if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false); }
        return;
      }
      if (!presentationOpen && (event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'Comma') {
        event.preventDefault();
        if (!event.repeat) {
          setPage('settings');
          if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false);
        }
        return;
      }
      if (!presentationOpen && (event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyO') {
        event.preventDefault();
        if (!event.repeat) choose();
        return;
      }
      if (isVkPage) return;
      if (!event.altKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyF' && current
        && !(event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]'))) {
        event.preventDefault();
        if (!event.repeat) (presentationOpen ? closePresentation : showPresentation)();
        return;
      }
      if (!presentationOpen && event.key === 'Escape' && queueOpen && window.matchMedia('(max-width: 1079px)').matches) { setQueueOpen(false); return; }
      if (event.altKey || event.metaKey || event.ctrlKey || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable], button, a'))) return;
      if (event.code === 'Space' || event.code === 'KeyK') { event.preventDefault(); if (!event.repeat) toggle(); }
      else if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') { event.preventDefault(); seek(event.code === 'ArrowRight' ? playback.seekStep : -playback.seekStep, true); }
      else if (event.code === 'KeyM' && !event.repeat) mute();
      else if (!presentationOpen && event.code === 'KeyQ' && !event.repeat) setQueueOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choose, mute, seek, toggle, modalOpen, presentationOpen, showPresentation, closePresentation, current, queueOpen, isVkPage, playback.seekStep]);

  function addToQueue(id: string) {
    const state = queueRef.current;
    if (!byId.has(id)) return;
    if (state.order.includes(id)) { setNotice({ message: 'Трек уже в очереди' }); return; }
    commit(appendToQueue(state, [id]));
    setNotice({ message: 'Трек добавлен в очередь' });
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
      setPreferences((data) => ({ ...data, favorites: data.favorites.filter((favorite) => favorite !== id) }));
      setNotice({ message: 'Трек убран из медиатеки', detail: 'Исходный файл не удалён.' });
    } catch {
      setNotice({ message: 'Не удалось убрать трек из медиатеки.', error: true });
    } finally { busy.current = false; setWorking(false); }
  }
  function toggleDemos() {
    const state = queueRef.current;
    const showing = !preferences.showDemos;
    const updated = showing ? appendToQueue(state, demoIds) : demoIds.reduce(removeFromQueue, state);
    setPreferences((data) => ({ ...data, showDemos: showing }));
    commit(updated);
    if (state.currentId !== updated.currentId) load([...localTracks, ...(showing ? demoTracks : [])].find(({ id }) => id === updated.currentId) ?? null);
  }
  function resetCustomization() {
    if (!preferences.showDemos) toggleDemos();
    setPreferences((data) => ({ ...data, appearance: defaultAppearance, playback: defaultPlayback }));
    setNotice({ message: 'Оформление и параметры воспроизведения сброшены' });
  }
  function editTrackDetails(id: string) {
    dropDepth.current = 0;
    setDropActive(false);
    setDetailsId(id);
  }
  function saveDetails(value?: TrackDetails) {
    if (!detailsTrack) return;
    const saved = updateDetails(detailsTrack.id, value);
    setNotice(saved ? { message: value ? 'Данные трека сохранены' : 'Исходные данные возвращены' } : {
      message: 'Данные изменены только для этой сессии',
      detail: 'Не удалось сохранить их в профиле Luma.', error: true,
    });
  }
  function editTrackCover(id: string) {
    const track = originals.find((item) => item.id === id);
    if (track) setCoverTarget({ key: trackCoverKey(id), title: byId.get(id)?.title ?? track.title, kind: 'track', originalUrl: track.artworkUrl });
  }
  async function saveCover(image?: Blob) {
    if (!coverTarget) return;
    const saved = await updateCover(coverTarget.key, image);
    setNotice(saved ? { message: image ? 'Обложка сохранена' : 'Исходная обложка возвращена' } : {
      message: 'Обложка изменена только для этой сессии',
      detail: 'Не удалось сохранить её в профиле Luma.',
      error: true,
    });
  }
  function playAll(items: Track[]) {
    if (!items.length) return;
    commit(startQueue(items.map(({ id }) => id), items[0].id, queueRef.current.repeat));
    load(items[0], true);
  }
  function goToLibrary() {
    setPage('library');
    if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false);
  }
  function navigate(target: Page) {
    if (target === 'vk') pause();
    if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false);
    setPage(target);
  }
  const openEqualizer = () => setShowEqualizer(true);
  const toggleQueue = () => setQueueOpen((open) => !open);
  const changeAppearance = (appearance: Appearance) => setPreferences((data) => ({ ...data, appearance }));
  const toggleCompact = () => setPreferences((data) => ({ ...data, appearance: { ...data.appearance, compactSidebar: !data.appearance.compactSidebar } }));
  const toggleFavorite = useCallback((id: string) => setPreferences((data) => ({
    ...data, favorites: data.favorites.includes(id) ? data.favorites.filter((favorite) => favorite !== id) : [...data.favorites, id],
  })), []);
  const backToMenu = useCallback(() => setPage('menu'), []);
  const changeLibraryLayout = (libraryLayout: LibraryLayout) => setPreferences((data) => ({ ...data, appearance: { ...data.appearance, libraryLayout } }));
  const closeQueue = () => setQueueOpen(false);
  const localControls: PlaybackProps = {
    hasTrack: Boolean(current), playing: player.playing, elapsed: player.elapsed, duration: player.duration,
    shuffle: queue.beforeShuffle !== null, repeat: queue.repeat, hasNext: Boolean(adjacentId(queue, 1)), volume: preferences.volume,
    togglePlay: toggle, toggleShuffle: () => commit(toggleShuffle(queueRef.current)), toggleRepeat: () => {
      const state = queueRef.current;
      commit({ ...state, repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' });
    }, previous, next: () => next(), toggleMute: mute, setVolume, seek,
  };

  return (
    <div data-sidebar={appearance.compactSidebar ? 'compact' : 'expanded'} className={`app-shell${isVkPage ? ' vk-mode' : queueOpen ? ' queue-visible' : ''}${appearance.motion ? '' : ' motion-off'}${appearance.coverColors ? '' : ' cover-colors-off'}`} style={theme as CSSProperties}
      onDragEnter={(event) => {
        if (modalOpen || presentationOpen || !filesDragged(event)) return;
        event.preventDefault();
        dropDepth.current++;
        setDropActive(true);
      }}
      onDragOver={(event) => { if (!modalOpen && !presentationOpen && filesDragged(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDragLeave={(event) => {
        if (modalOpen || presentationOpen || !filesDragged(event)) return;
        dropDepth.current = Math.max(0, dropDepth.current - 1);
        if (!dropDepth.current) setDropActive(false);
      }}
      onDrop={(event) => {
        if (modalOpen || presentationOpen || !filesDragged(event)) return;
        event.preventDefault();
        dropDepth.current = 0;
        setDropActive(false);
        handleFiles(Array.from(event.dataTransfer.files));
      }}>
      <TitleBar openSettings={() => navigate('settings')} settingsActive={page === 'settings'} addMusic={choose} busy={working || !ready} />
      <Sidebar page={page} navigate={navigate} addMusic={choose} busy={working || !ready} count={tracks.length} favoriteCount={favorites.length}
        queued={queued.length} queueOpen={queueOpen} toggleQueue={toggleQueue} openEqualizer={openEqualizer} eqEnabled={preferences.equalizer.enabled}
        compact={appearance.compactSidebar} toggleCompact={toggleCompact} />
      <main className="main-pane" ref={scrollArea}>
        {isVkPage ? <VkMusicPage covers={covers} editCover={setCoverTarget} discardCover={(key) => { void updateCover(key); }} /> :
          page === 'diagnostics' ? <DiagnosticsPage back={backToMenu} /> :
          page === 'settings' ? <SettingsPage appearance={appearance} playback={playback} showDemos={preferences.showDemos} libraryReady={ready && !working}
            previewTrack={current} tint={tint} changeAppearance={changeAppearance}
            changePlayback={(playback) => setPreferences((data) => ({ ...data, playback }))} toggleDemos={toggleDemos} reset={resetCustomization} goToMenu={() => navigate('menu')} /> :
          page === 'menu' ? <MenuPage localCount={localTracks.length} ready={ready && !working} eqEnabled={preferences.equalizer.enabled}
            openSettings={() => navigate('settings')} openEqualizer={openEqualizer} openLibrary={goToLibrary} openFavorites={() => navigate('favorites')} openDiagnostics={() => navigate('diagnostics')} openVk={() => navigate('vk')} addMusic={choose} /> :
          page === 'player' ? <PlayerPage track={current} tracks={tracks} tint={tint} appearance={appearance} playing={player.playing} position={queue.order.indexOf(current?.id ?? '') + 1}
            count={queue.order.length} eqEnabled={preferences.equalizer.enabled} toggle={toggle} play={(id) => playTrack(id, true)} goToLibrary={goToLibrary}
            favorite={Boolean(current && favoriteIds.has(current.id))} toggleFavorite={toggleFavorite} openAppearance={() => setShowAppearance(true)} openPresentation={showPresentation} sceneVisible={!presentationOpen && !modalOpen} readSpectrum={player.readSpectrum}
            openEqualizer={openEqualizer} editCover={editTrackCover} editDetails={editTrackDetails} addMusic={choose} /> :
          <LibraryPage key={page} tracks={page === 'favorites' ? favorites : tracks} currentId={queue.currentId} playing={player.playing} showDemos={preferences.showDemos} busy={working || !ready}
            mode={page === 'favorites' || page === 'search' ? page : 'library'} favorites={favoriteIds} toggleFavorite={toggleFavorite} goToLibrary={goToLibrary} layout={appearance.libraryLayout} changeLayout={changeLibraryLayout} openVk={() => navigate('vk')} addMusic={choose} toggleDemos={toggleDemos} play={(id) => playTrack(id, true)} playAll={playAll} add={addToQueue} editCover={editTrackCover} editDetails={editTrackDetails} remove={(id) => void removeLocal(id)} />}
      </main>
      {!isVkPage && queueOpen && <>
        <button type="button" className="queue-scrim" onClick={closeQueue} aria-label="Закрыть панель очереди" />
        <QueuePanel active={current} upcoming={upcoming} count={queued.length} duration={queued.reduce((sum, track) => sum + track.duration, 0)} playing={player.playing}
          close={closeQueue} play={(id) => playTrack(id, true)} remove={removeQueued} move={(from, to) => commit(moveUpcoming(queueRef.current, from, to))} goToLibrary={goToLibrary} />
      </>}
      {isVkPage ? <VkModeBar goToPlayer={() => setPage('player')} /> : <PlayerBar {...localControls} track={current}
        goToPlayer={() => setPage('player')} openPresentation={showPresentation} queueOpen={queueOpen} toggleQueue={toggleQueue} />}
      {presentationOpen && current && !isVkPage && <FullscreenPlayer {...localControls} track={current} tint={tint} appearance={appearance}
        favorite={favoriteIds.has(current.id)} toggleFavorite={toggleFavorite} readSpectrum={player.readSpectrum} sceneVisible={!modalOpen} close={closePresentation}
        openAppearance={() => setShowAppearance(true)} openEqualizer={openEqualizer} />}
      <audio ref={player.ref} crossOrigin="anonymous" preload="metadata" />
      <input type="file" ref={fileInput} hidden accept={AUDIO_ACCEPT} multiple onChange={(event) => {
        handleFiles(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = '';
      }} />
      {dropActive && <div className="drop-overlay" aria-hidden="true"><div><FileAudio size={30} /><strong>Отпустите файлы</strong><span>Добавим аудио в вашу медиатеку</span></div></div>}
      <div className="notifications" aria-live="polite">
        {(notice || localPlaybackError) && <div className={`toast${notice?.error || (!notice && localPlaybackError) ? ' toast-error' : ''}`}>
          {notice?.error || (!notice && localPlaybackError) ? <CircleAlert size={20} /> : <CircleCheck size={20} />}
          <div><strong>{notice?.message ?? localPlaybackError}</strong>{notice?.detail && <small>{notice.detail}</small>}</div>
          {notice && <button type="button" className="icon-button" onClick={() => setNotice(undefined)} aria-label="Скрыть уведомление"><X size={17} /></button>}
        </div>}
      </div>
      {coverTarget && <CoverEditor key={coverTarget.key} target={coverTarget} currentUrl={covers.get(coverTarget.key)} update={saveCover} close={() => setCoverTarget(undefined)} />}
      {detailsTrack && <TrackDetailsEditor key={detailsTrack.id} track={detailsTrack} edited={details.has(detailsTrack.id)} save={saveDetails} close={() => setDetailsId(undefined)} />}
      {showAppearance && <NowPlayingDialog appearance={appearance} tint={tint} track={current} sample={player.playing ? player.readSpectrum : undefined} change={changeAppearance} close={() => setShowAppearance(false)} />}
      {showEqualizer && <Equalizer settings={preferences.equalizer} change={(equalizer) => setPreferences((data) => ({ ...data, equalizer }))} close={() => setShowEqualizer(false)} />}
    </div>
  );
}
