import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { CircleAlert, CircleCheck, FileAudio, X } from 'lucide-react';
import { Sidebar, TitleBar } from './components/Chrome';
import type { Page } from './components/Chrome';
import { LibraryPage, PlayerPage } from './components/Collection';
import { Equalizer } from './components/Equalizer';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { demoTracks } from './data/demos';
import { localLibrary } from './data/library';
import { useMediaSession } from './player/mediaSession';
import { readPreferences, savePreferences } from './player/preferences';
import { useAudio } from './player/useAudio';
import { usePalette } from './player/usePalette';
import { clamp } from './shared/equalizer';
import { AUDIO_ACCEPT, trackCount } from './shared/media';
import type { ImportResult, Track } from './shared/media';
import { adjacentId, appendToQueue, moveUpcoming, reconcileQueue, removeFromQueue, startQueue, toggleShuffle, upcomingIds } from './shared/queue';
import type { QueueState } from './shared/queue';

interface Notice { message: string; detail?: string; error?: boolean }
const demoIds = demoTracks.map((track) => track.id);
const noop = () => undefined;

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
  const [page, setPage] = useState<Page>('player');
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [queueOpen, setQueueOpen] = useState(() => window.matchMedia('(min-width: 1080px)').matches);
  const [dropActive, setDropActive] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ended = useRef<() => void>(noop);
  const dropDepth = useRef(0);
  const scrollArea = useRef<HTMLElement>(null);

  const tracks = useMemo(() => [...localTracks, ...(preferences.showDemos ? demoTracks : [])], [localTracks, preferences.showDemos]);
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const current = byId.get(queue.currentId ?? '') ?? null;
  const player = useAudio(preferences.volume, preferences.equalizer, ended);
  const { load, isPlaying, position, play, pause, toggle, seek } = player;
  const tint = usePalette(current);
  const queued = queue.order.flatMap((id) => byId.get(id) ?? []);
  const upcoming = upcomingIds(queue).flatMap((id) => byId.get(id) ?? []);

  useEffect(() => {
    let ignored = false;
    void localLibrary.list().then((allLocal) => {
      if (ignored) return;
      setLocalTracks(allLocal);
      const ids = [...allLocal.map(({ id }) => id), ...(boot.showDemos ? demoIds : [])];
      const state = queueRef.current;
      const restored = reconcileQueue(state, new Set(ids));
      if ((!boot.queue && allLocal.length && !isPlaying()) || (!restored.order.length && state.order.length)) {
        commit(startQueue(ids, ids[0], state.repeat));
      } else commit(restored);
    }).catch(() => {
      if (!ignored) setNotice({ message: 'Не удалось открыть локальную медиатеку.', error: true });
    }).finally(() => { if (!ignored) setReady(true); });
    return () => { ignored = true; };
  }, [boot, commit, isPlaying]);

  useEffect(() => { if (ready) savePreferences({ ...preferences, queue }); }, [ready, preferences, queue]);
  useEffect(() => { load(current); }, [load, current]);
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
  useEffect(() => { ended.current = () => next(true); }, [next]);
  const mediaActions = useMemo(() => ({
    play, pause, nexttrack: () => next(), previoustrack: previous,
    stop: () => { pause(); seek(0); },
    seekto: ({ seekTime }: MediaSessionActionDetails) => { if (seekTime !== undefined) seek(seekTime); },
    seekforward: ({ seekOffset }: MediaSessionActionDetails) => seek(seekOffset ?? 5, true),
    seekbackward: ({ seekOffset }: MediaSessionActionDetails) => seek(-(seekOffset ?? 5), true),
  }), [next, previous, play, pause, seek]);
  useMediaSession(current, player.playing, player.elapsed, player.duration, mediaActions);

  const setVolume = useCallback((value: number) => {
    const volume = clamp(value, 0, 1);
    setPreferences((data) => ({ ...data, volume, lastVolume: volume > 0 ? volume : data.lastVolume }));
  }, []);
  const mute = useCallback(() => setPreferences((data) => ({ ...data, volume: data.volume > 0 ? 0 : data.lastVolume })), []);

  const importMusic = useCallback(async (operation: () => Promise<ImportResult>) => {
    if (!ready || busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      const result = await operation();
      if (result.cancelled) return;
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
      if (showEqualizer) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyO') {
        event.preventDefault();
        if (!event.repeat) choose();
        return;
      }
      if (event.key === 'Escape' && queueOpen && window.matchMedia('(max-width: 1079px)').matches) { setQueueOpen(false); return; }
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable], button, a'))) return;
      if (event.code === 'Space' || event.code === 'KeyK') { event.preventDefault(); if (!event.repeat) toggle(); }
      else if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') { event.preventDefault(); seek(event.code === 'ArrowRight' ? 5 : -5, true); }
      else if (event.code === 'KeyM' && !event.repeat) mute();
      else if (event.code === 'KeyQ' && !event.repeat) setQueueOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choose, mute, seek, toggle, showEqualizer, queueOpen]);

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
  function playAll(items: Track[]) {
    if (!items.length) return;
    commit(startQueue(items.map(({ id }) => id), items[0].id, queueRef.current.repeat));
    load(items[0], true);
  }
  function goToLibrary() {
    setPage('library');
    if (window.matchMedia('(max-width: 1079px)').matches) setQueueOpen(false);
  }
  const openEqualizer = () => setShowEqualizer(true);
  const closeQueue = () => setQueueOpen(false);

  return (
    <div className={`app-shell${queueOpen ? ' queue-visible' : ''}`}
      onDragEnter={(event) => {
        if (!filesDragged(event)) return;
        event.preventDefault();
        dropDepth.current++;
        setDropActive(true);
      }}
      onDragOver={(event) => { if (filesDragged(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDragLeave={(event) => {
        if (!filesDragged(event)) return;
        dropDepth.current = Math.max(0, dropDepth.current - 1);
        if (!dropDepth.current) setDropActive(false);
      }}
      onDrop={(event) => {
        if (!filesDragged(event)) return;
        event.preventDefault();
        dropDepth.current = 0;
        setDropActive(false);
        handleFiles(Array.from(event.dataTransfer.files));
      }}>
      <TitleBar />
      <Sidebar page={page} navigate={setPage} openEqualizer={openEqualizer} eqEnabled={preferences.equalizer.enabled} addMusic={choose} busy={working || !ready} count={tracks.length} />
      <main className="main-pane" ref={scrollArea}>
        {page === 'player' ? <PlayerPage track={current} tracks={tracks} tint={tint} playing={player.playing} position={queue.order.indexOf(current?.id ?? '') + 1}
          count={queue.order.length} eqEnabled={preferences.equalizer.enabled} toggle={toggle} play={(id) => playTrack(id, true)} goToLibrary={goToLibrary} openEqualizer={openEqualizer} addMusic={choose} /> :
          <LibraryPage tracks={tracks} currentId={queue.currentId} playing={player.playing} showDemos={preferences.showDemos} busy={working || !ready}
            addMusic={choose} toggleDemos={toggleDemos} play={(id) => playTrack(id, true)} playAll={playAll} add={addToQueue} remove={(id) => void removeLocal(id)} />}
      </main>
      {queueOpen && <>
        <button type="button" className="queue-scrim" onClick={closeQueue} aria-label="Закрыть панель очереди" />
        <QueuePanel active={current} upcoming={upcoming} count={queued.length} duration={queued.reduce((sum, track) => sum + track.duration, 0)} playing={player.playing}
          close={closeQueue} play={(id) => playTrack(id, true)} remove={removeQueued} move={(from, to) => commit(moveUpcoming(queueRef.current, from, to))} goToLibrary={goToLibrary} />
      </>}
      <PlayerBar track={current} playing={player.playing} elapsed={player.elapsed} duration={player.duration} shuffle={queue.beforeShuffle !== null} repeat={queue.repeat}
        hasNext={Boolean(adjacentId(queue, 1))} volume={preferences.volume} goToPlayer={() => setPage('player')} togglePlay={toggle}
        toggleShuffle={() => commit(toggleShuffle(queueRef.current))} toggleRepeat={() => {
          const state = queueRef.current;
          commit({ ...state, repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' });
        }} previous={previous} next={() => next()} toggleMute={mute} setVolume={setVolume} seek={seek}
        queueOpen={queueOpen} toggleQueue={() => setQueueOpen((open) => !open)} />
      <audio ref={player.ref} crossOrigin="anonymous" preload="metadata" />
      <input type="file" ref={fileInput} hidden accept={AUDIO_ACCEPT} multiple onChange={(event) => {
        handleFiles(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = '';
      }} />
      {dropActive && <div className="drop-overlay" aria-hidden="true"><div><FileAudio size={30} /><strong>Отпустите файлы</strong><span>Добавим аудио в вашу медиатеку</span></div></div>}
      <div className="notifications" aria-live="polite">
        {(notice || player.error) && <div className={`toast${notice?.error || (!notice && player.error) ? ' toast-error' : ''}`}>
          {notice?.error || (!notice && player.error) ? <CircleAlert size={20} /> : <CircleCheck size={20} />}
          <div><strong>{notice?.message ?? player.error}</strong>{notice?.detail && <small>{notice.detail}</small>}</div>
          {notice && <button type="button" className="icon-button" onClick={() => setNotice(undefined)} aria-label="Скрыть уведомление"><X size={17} /></button>}
        </div>}
      </div>
      {showEqualizer && <Equalizer settings={preferences.equalizer} change={(equalizer) => setPreferences((data) => ({ ...data, equalizer }))} close={() => setShowEqualizer(false)} />}
    </div>
  );
}
