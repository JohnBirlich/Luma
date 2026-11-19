import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, Music2 } from 'lucide-react';
import { createLyricsService } from '../shared/lyrics-service';
import { ONLINE_SOURCES } from '../shared/online';
import { activeLyricLine, readLocalLyrics, readLyricsQuery, timedLines } from '../shared/lyrics';
import type { Lyrics } from '../shared/lyrics';
import type { Track } from '../shared/media';

const webLyrics = createLyricsService();

export function LyricsPanel({ track, elapsed, playing, auto, connected }: {
  track: Track; elapsed: number; playing: boolean; auto: boolean; connected: boolean;
}) {
  const query = useMemo(() => readLyricsQuery({ ...track, album: track.online && track.album === ONLINE_SOURCES[track.online.source] ? undefined : track.album }), [track]);
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<Lyrics | null | undefined>();
  const [local, setLocal] = useState<Lyrics | null | undefined>(() => track.online || !window.luma ? readLocalLyrics(track.embeddedLyrics) : undefined);
  const result = local ?? remote;
  const [error, setError] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const lines = useMemo(() => result?.synced ? timedLines(result.synced) : [], [result]);
  const current = activeLyricLine(lines, elapsed);
  useEffect(() => {
    if (!window.luma || track.online) return;
    let stale = false;
    void window.luma.lyrics.local(track.id).then((lyrics) => { if (!stale) setLocal(lyrics); }, () => { if (!stale) setLocal(null); });
    return () => { stale = true; };
  }, [track.id, track.online]);
  useEffect(() => { if (auto && playing) setStarted(true); }, [auto, playing]);
  useEffect(() => {
    if (local !== null || !query || !connected || (!attempt && !(auto && started))) return;
    const request = new AbortController();
    setBusy(true); setError(false); setRemote(undefined);
    const lookup = window.luma?.lyrics.lookup(query) ?? webLyrics(query, request.signal);
    void lookup.then((lyrics) => { if (!request.signal.aborted) setRemote(lyrics); }, () => {
      if (!request.signal.aborted) setError(true);
    }).finally(() => { if (!request.signal.aborted) setBusy(false); });
    return () => { request.abort(); setBusy(false); };
  }, [attempt, auto, started, query, connected, local]);
  useEffect(() => {
    const pane = scroll.current, item = line.current;
    if (pane && item) pane.scrollTop = item.offsetTop - pane.clientHeight / 2 + item.offsetHeight / 2;
  }, [current, result]);
  if (!query && !local) return null;
  return <section className="lyrics-card" aria-labelledby="lyrics-title">
    <header><AlignLeft size={19} /><div><h2 id="lyrics-title">Текст песни</h2><p>{local ? 'Из файла' : 'LRCLIB'}{lines.length ? ' · синхронизированный текст' : ''}</p></div>
      {!result && <button className="button outline-button" type="button" disabled={busy || !connected || local === undefined} onClick={() => setAttempt((value) => value + 1)}>{busy && connected ? 'Ищем…' : error || result === null ? 'Повторить' : 'Найти текст'}</button>}</header>
    {!connected && !result && <p className="lyrics-status" role="status">Для поиска нужна сеть.</p>}
    {connected && error && <p className="lyrics-status" role="status">LRCLIB не ответил. Попробуйте позже.</p>}
    {result === null && <p className="lyrics-status" role="status">Для этой записи текст не найден.</p>}
    {result?.instrumental && <p className="lyrics-status"><Music2 size={14} /> Инструментальная запись</p>}
    {lines.length ? <div className="lyrics-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Строки песни">
      {lines.map(({ time, text }, index) => <p key={`${time}-${index}`} ref={index === current ? line : undefined} aria-current={index === current ? 'true' : undefined}>{text || '\u00a0'}</p>)}
    </div> : result?.plain && <div className="lyrics-scroll lyrics-plain" tabIndex={0} role="region" aria-label="Текст песни">{result.plain}</div>}
    {!busy && result === undefined && !error && connected && <p className="lyrics-status">Поиск отправит название, исполнителя и, если известны, альбом и длительность.</p>}
  </section>;
}
