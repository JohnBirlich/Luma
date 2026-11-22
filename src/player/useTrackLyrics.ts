import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { webAppInfo } from '../data/app-info';
import { findLyricEdition } from '../shared/lyric-editions';
import { MAX_LYRIC_FILE, readCustomLyrics, readLocalLyrics, readLyricsQuery, selectLyrics, timedLines } from '../shared/lyrics';
import type { Lyrics, LyricSource } from '../shared/lyrics';
import { createLyricsService } from '../shared/lyrics-service';
import { createLyricsOvhLookup, readPlainLyricsQuery } from '../shared/lyrics-ovh';
import type { Track } from '../shared/media';
import { ONLINE_SOURCES, sessionCatalogId } from '../shared/online';

const webLyrics = createLyricsService(fetch, false, webAppInfo.version);
const webPlainLyrics = createLyricsOvhLookup();
type LookupResult = { key: string; attempt: number; value: Lyrics | null; failed: boolean };
interface Workspace {
  id?: string;
  token: symbol;
  choice: LyricSource;
  started: boolean;
  attempt: number;
  local?: Lyrics | null;
  remote?: LookupResult;
  plainAttempt?: number;
  plainRemote?: LookupResult;
  attached?: Lyrics;
  attachment?: 'file' | 'text';
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
  const sessionOnly = sessionCatalogId(id);
  const edition = useMemo(() => track && !track.demo && !sessionOnly ? findLyricEdition(track.title) : undefined, [track?.title, track?.demo, sessionOnly]);
  const online = track?.online;
  const canReadSidecar = Boolean(window.luma && track && !track.demo && !online);
  const embedded = useMemo(() => readLocalLyrics(track?.embeddedLyrics), [track?.embeddedLyrics]);
  const local = canReadSidecar ? state.local : embedded;
  const demo = track?.demo;
  const title = track?.title, artist = track?.artist, album = track?.album;
  // Catalog duration belongs to that record. For files without a tag, use the decoded duration.
  const length = track?.duration || duration;
  const query = useMemo(() => demo || sessionOnly || online?.source === 'broadcast' ? undefined : readLyricsQuery({ title, artist,
    album: online && album === ONLINE_SOURCES[online.source] ? undefined : album, duration: length }), [title, artist, album, length, online, demo, sessionOnly]);
  const key = query ? JSON.stringify(query) : '';
  const plainQuery = useMemo(() => demo || sessionOnly || online?.source === 'broadcast' ? undefined : readPlainLyricsQuery({ title, artist }),
    [title, artist, demo, sessionOnly, online?.source]);
  const plainKey = plainQuery ? JSON.stringify(plainQuery) : '';
  const plainAttempt = state.plainAttempt ?? 0;
  const plainCached = state.plainRemote?.key === plainKey ? state.plainRemote : undefined;
  const plainDone = plainCached?.attempt === plainAttempt;
  const plainSelected = choice === 'lyricsovh' && Boolean(plainQuery);
  const plainBusy = enabled && connected && plainSelected && !plainDone;
  const cached = remote && remote.key === key ? remote : undefined;
  const done = cached?.attempt === attempt;
  const showLocal = choice === 'auto' || choice === 'local';
  const allowed = Boolean(query && (choice === 'lrclib' || (choice === 'auto' && local === null && !attached)));
  const busy = enabled && connected && allowed && !done && (attempt > 0 || choice === 'lrclib' || (auto && started));

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
    const lookup = window.luma?.lyrics.lookup(query, attempt > 0) ?? webLyrics(query, request.signal, attempt > 0);
    void lookup.then((value) => {
      if (!request.signal.aborted) update(() => ({ remote: { key, attempt, value, failed: false } }));
    }, () => {
      if (!request.signal.aborted) update(() => ({ remote: { key, attempt, value: null, failed: true } }));
    });
    return () => request.abort();
  }, [busy, query, key, attempt, update]);

  useEffect(() => {
    if (!plainBusy || !plainQuery) return;
    const request = new AbortController();
    const lookup = window.luma?.lyrics.lookupPlain?.(plainQuery) ?? webPlainLyrics(plainQuery, request.signal);
    void lookup.then((value) => {
      if (!request.signal.aborted) update(() => ({ plainRemote: { key: plainKey, attempt: plainAttempt, value, failed: false } }));
    }, () => {
      if (!request.signal.aborted) update(() => ({ plainRemote: { key: plainKey, attempt: plainAttempt, value: null, failed: true } }));
    });
    return () => request.abort();
  }, [plainBusy, plainQuery, plainKey, plainAttempt, update]);

  const attachIntent = useRef(0);
  const attach = useCallback(async (file: File) => {
    const intent = ++attachIntent.current;
    update(() => ({ attachError: false }));
    try {
      if (file.size > MAX_LYRIC_FILE || !/\.(?:txt|lrc)$/i.test(file.name)) throw new Error('Invalid file');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const lyrics = /\.lrc$/i.test(file.name) ? readLocalLyrics(undefined, text) : readLocalLyrics(text);
      if (!lyrics) throw new Error('No lyrics');
      if (intent === attachIntent.current) update(() => ({ attached: lyrics, attachment: 'file', choice: 'attached' }));
    } catch { if (intent === attachIntent.current) update(() => ({ attachError: true })); }
  }, [update]);
  const attachText = useCallback((text: string) => {
    const lyrics = readCustomLyrics(text);
    if (!lyrics) return false;
    attachIntent.current++;
    update(() => ({ attached: lyrics, attachment: 'text', choice: 'attached', attachError: false }));
    return true;
  }, [update]);
  const select = useCallback((choice: LyricSource) => update(() => ({ choice })), [update]);
  const clear = useCallback(() => {
    attachIntent.current++;
    update((previous) => ({ attached: undefined, attachment: undefined, attachError: false, choice: previous.choice === 'attached' ? 'auto' : previous.choice }));
  }, [update]);
  const search = useCallback(() => update((previous) => previous.choice === 'lyricsovh'
    ? { plainAttempt: (previous.plainAttempt ?? 0) + 1 } : { attempt: previous.attempt + 1 }), [update]);
  const searchOnline = useCallback(() => update((previous) => ({ choice: 'lrclib', attempt: previous.attempt + 1 })), [update]);
  const result = useMemo(() => selectLyrics(choice, { local, attached, lrclib: cached?.value, lyricsovh: plainCached?.value, edition }),
    [choice, local, attached, cached?.value, plainCached?.value, edition]);
  const visibleLookup = plainSelected && plainDone ? plainCached : allowed && done ? cached : undefined;
  const lines = useMemo(() => result.lyrics?.wordLines ?? (result.lyrics?.synced ? timedLines(result.lyrics.synced) : []), [result.lyrics]);
  return {
    ...result, choice, select, local: Boolean(local), attached: Boolean(attached), edition, clear, attach, attachText, attachment: state.attachment, search, searchOnline, lines,
    attachError: state.attachError, busy: busy || plainBusy, offline: !connected, loadingLocal: showLocal && canReadSidecar && local === undefined,
    canSearch: allowed || plainSelected, canSearchOnline: Boolean(query), canSearchPlain: Boolean(plainQuery),
    error: Boolean(visibleLookup?.failed), missing: visibleLookup?.value === null && !visibleLookup.failed,
  };
}

export type TrackLyrics = ReturnType<typeof useTrackLyrics>;
