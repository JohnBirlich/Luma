import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findLyricEdition } from '../shared/lyric-editions';
import { MAX_LYRIC_FILE, readLocalLyrics, readLyricsQuery, selectLyrics, timedLines } from '../shared/lyrics';
import type { Lyrics, LyricSource } from '../shared/lyrics';
import { createLyricsService } from '../shared/lyrics-service';
import type { Track } from '../shared/media';
import { ONLINE_SOURCES } from '../shared/online';

const webLyrics = createLyricsService();
interface Workspace {
  id?: string;
  token: symbol;
  choice: LyricSource;
  started: boolean;
  attempt: number;
  local?: Lyrics | null;
  remote?: { key: string; attempt: number; value: Lyrics | null; failed: boolean };
  attached?: Lyrics;
  attachError: boolean;
}
const empty = (id?: string): Workspace => ({ id, token: Symbol(), choice: 'auto', attempt: 0, started: false, attachError: false });

/** One lyrics session for the current recording, shared by the home and karaoke views. */
export function useTrackLyrics(track: Track | null, { enabled, connected, auto, playing, duration }: {
  enabled: boolean; connected: boolean; auto: boolean; playing: boolean; duration: number;
}) {
  const id = track?.id;
  const [stored, setStore] = useState(() => empty(id));
  const state = stored.id === id ? stored : empty(id);
  if (stored !== state) setStore(state);
  const { choice, token, attached, started, attempt, remote } = state;
  const update = useCallback((patch: (previous: Workspace) => Partial<Workspace>) => {
    setStore((previous) => previous.token === token ? { ...previous, ...patch(previous) } : previous);
  }, [token]);
  const edition = useMemo(() => track && !track.demo ? findLyricEdition(track.title) : undefined, [track?.title, track?.demo]);
  const online = track?.online;
  const canReadSidecar = Boolean(window.luma && track && !track.demo && !online);
  const embedded = useMemo(() => readLocalLyrics(track?.embeddedLyrics), [track?.embeddedLyrics]);
  const local = canReadSidecar ? state.local : embedded;
  const demo = track?.demo;
  const title = track?.title, artist = track?.artist, album = track?.album;
  // Catalog duration belongs to that record. For files without a tag, use the decoded duration.
  const length = track?.duration || Math.round(duration);
  const query = useMemo(() => demo || online?.source === 'broadcast' ? undefined : readLyricsQuery({ title, artist,
    album: online && album === ONLINE_SOURCES[online.source] ? undefined : album, duration: length }), [title, artist, album, length, online, demo]);
  const key = query ? JSON.stringify(query) : '';
  const cached = remote && remote.key === key ? remote : undefined;
  const done = cached?.attempt === attempt;
  const showLocal = choice === 'auto' || choice === 'local';
  const allowed = Boolean(query && (choice === 'lrclib' || (choice === 'auto' && local === null && !attached)));
  const busy = enabled && connected && allowed && !done && (attempt > 0 || (auto && started));

  useEffect(() => {
    if (!enabled || !id || !canReadSidecar || local !== undefined || !window.luma) return;
    let active = true;
    void window.luma.lyrics.local(id).then((lyrics) => { if (active) update(() => ({ local: lyrics })); }, () => {
      if (active) update(() => ({ local: null }));
    });
    return () => { active = false; };
  }, [enabled, id, local, update, canReadSidecar]);
  useEffect(() => {
    if (enabled && auto && playing && !started && query) update(() => ({ started: true }));
  }, [enabled, auto, playing, started, query, update]);
  useEffect(() => {
    if (!busy || !query) return;
    const request = new AbortController();
    const lookup = window.luma?.lyrics.lookup(query) ?? webLyrics(query, request.signal);
    void lookup.then((value) => {
      if (!request.signal.aborted) update(() => ({ remote: { key, attempt, value, failed: false } }));
    }, () => {
      if (!request.signal.aborted) update(() => ({ remote: { key, attempt, value: null, failed: true } }));
    });
    return () => request.abort();
  }, [busy, query, key, attempt, update]);

  const attachIntent = useRef(0);
  const attach = useCallback(async (file: File) => {
    const intent = ++attachIntent.current;
    update(() => ({ attachError: false }));
    try {
      if (file.size > MAX_LYRIC_FILE || !/\.(?:txt|lrc)$/i.test(file.name)) throw new Error('Invalid file');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const lyrics = /\.lrc$/i.test(file.name) ? readLocalLyrics(undefined, text) : readLocalLyrics(text);
      if (!lyrics) throw new Error('No lyrics');
      if (intent === attachIntent.current) update(() => ({ attached: lyrics, choice: 'attached' }));
    } catch { if (intent === attachIntent.current) update(() => ({ attachError: true })); }
  }, [update]);
  const select = useCallback((choice: LyricSource) => update(() => ({ choice })), [update]);
  const clear = useCallback(() => {
    attachIntent.current++;
    update((previous) => ({ attached: undefined, choice: previous.choice === 'attached' ? 'auto' : previous.choice }));
  }, [update]);
  const search = useCallback(() => update((previous) => ({ attempt: previous.attempt + 1 })), [update]);
  const result = useMemo(() => selectLyrics(choice, { local, attached, lrclib: cached?.value, edition }), [choice, local, attached, cached?.value, edition]);
  const lines = useMemo(() => result.lyrics?.synced ? timedLines(result.lyrics.synced) : [], [result.lyrics?.synced]);
  return {
    ...result, choice, select, local: Boolean(local), attached: Boolean(attached), edition, clear, attach, search, lines,
    attachError: state.attachError, busy, offline: !connected, loadingLocal: showLocal && canReadSidecar && local === undefined,
    canSearch: allowed, error: Boolean(done && cached?.failed), missing: Boolean(done && cached?.value === null && !cached.failed),
  };
}

export type TrackLyrics = ReturnType<typeof useTrackLyrics>;
