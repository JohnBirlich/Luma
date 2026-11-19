import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, Cloud, CloudOff, Globe2, Link2, ListPlus, MonitorPlay, Play, Search } from 'lucide-react';
import { connectionState, subscribeConnection } from '../data/diagnostics';
import { findOnlineTracks, importOnlineTrack } from '../data/online';
import { formatTime } from '../shared/media';
import { MUSIC_SERVICES, serviceSearchUrl } from '../shared/music-search';
import type { MusicService } from '../shared/music-search';
import { ONLINE_SOURCES } from '../shared/online';
import type { OnlineFilter, OnlineTrack } from '../shared/online';
import { Artwork } from './Artwork';

export type OnlineAction = 'play' | 'queue' | 'save';

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  return <><a href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => {
    if (!window.luma) return;
    event.preventDefault();
    setFailed(false);
    void window.luma.openOnlineLink(url).catch(() => setFailed(true));
  }}>{children}</a>{failed && <span role="status">Не удалось открыть ссылку.</span>}</>;
}

export function OnlineCredit({ track, compact }: { track: { online: OnlineTrack['online'] }; compact?: boolean }) {
  const { source, page, license, licenseUrl } = track.online;
  return <span className="online-credit"><SourceLink url={page}>{ONLINE_SOURCES[source]} <ArrowUpRight size={12} /></SourceLink>
    {!compact && <> · <SourceLink url={licenseUrl}>{license}</SourceLink></>}</span>;
}

function message(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError) && error.name !== 'TimeoutError'
    ? error.message : 'Не удалось связаться с Openverse. Проверьте подключение и повторите попытку.';
}

export function MusicServiceSearch({ query, connected, openVk }: {
  query: string; connected: boolean; openVk(url: string): Promise<void>;
}) {
  const [failed, setFailed] = useState<MusicService>();
  const [busy, setBusy] = useState<MusicService>();
  if (!serviceSearchUrl('vk', query)) return null;
  return <section className="service-search" aria-labelledby="service-search-title">
    <header><div className="service-search-mark"><Search size={20} /></div><div><p className="overline">Ваш запрос</p>
      <h2 id="service-search-title">Найти в музыкальных сервисах</h2><p>Выберите площадку. Результаты и воспроизведение откроются в её плеере, не в очереди Luma.</p></div></header>
    <div className="service-search-grid">
      {(Object.keys(MUSIC_SERVICES) as MusicService[]).map((id) => {
        const { name, mark, tone } = MUSIC_SERVICES[id];
        const desktopVk = id === 'vk' && Boolean(window.luma);
        const url = serviceSearchUrl(id, query);
        return <a key={id} className="service-search-link" style={{ '--service-tone': tone } as CSSProperties}
          href={connected ? url : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!connected || busy === id || undefined} onClick={(event) => {
            if (!connected || busy || !url) { event.preventDefault(); return; }
            if (!window.luma) return;
            event.preventDefault(); setFailed(undefined); setBusy(id);
            const request = desktopVk ? openVk(url) : window.luma.openMusicSearch(id, query);
            void request.catch(() => setFailed(id)).finally(() => setBusy(undefined));
          }}>
          <span className="service-search-glyph" aria-hidden="true">{mark}</span>
          <span><strong>{name}</strong><small>{busy === id ? 'Открываем…' : desktopVk ? 'Окно VK в Luma' : 'В браузере'}</small></span>
          {desktopVk ? <MonitorPlay size={15} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}
        </a>;
      })}
    </div>
    {failed && <p className="online-message error" role="alert">Не удалось открыть {MUSIC_SERVICES[failed].name}. Проверьте подключение и попробуйте снова.</p>}
    <p className="online-footnote">{connected ? 'Некоторые сервисы требуют входа, подписки или доступны не во всех регионах.' : 'Для поиска в сервисах нужно подключение к интернету.'}</p>
  </section>;
}

export function OnlineSearch({ query, hasLocal, saved, disabled, choose }: {
  query: string; hasLocal: boolean; saved: ReadonlySet<string>; disabled: boolean; choose(track: OnlineTrack, action: OnlineAction): void;
}) {
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const [filter, setFilter] = useState<OnlineFilter>('all');
  const [tracks, setTracks] = useState<OnlineTrack[] | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !connected || query.trim().length < 2) return;
    const request = pending.current = new AbortController();
    setBusy(true);
    setTracks(undefined);
    setError('');
    try {
      const items = await findOnlineTracks(query, filter, request.signal);
      if (!request.signal.aborted) setTracks(items);
    } catch (error) { if (!request.signal.aborted) setError(message(error)); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }

  return <section className="online-panel" aria-labelledby="online-title" aria-busy={busy}>
    <header><div className="online-mark"><Globe2 size={20} /></div><div>
      <p className="overline">Открытые записи</p><h2 id="online-title">Слушать в Luma</h2>
      <p>{hasLocal ? 'Хотите больше вариантов? Проверьте онлайн-каталоги.' : 'Не нашли в медиатеке? Проверьте онлайн-каталоги.'} Запрос отправляется в Openverse только по кнопке.</p>
    </div></header>
    {!connected && <p className="online-offline" role="status"><CloudOff size={17} /> Устройство вне сети. Онлайн-поиск пока недоступен.</p>}
    <form id="online-search-form" className="online-search-form" onSubmit={search}>
      <select value={filter} aria-label="Источник онлайн-поиска" onChange={(event) => {
        pending.current?.abort(); setBusy(false); setTracks(undefined); setError(''); setFilter(event.currentTarget.value as OnlineFilter);
      }}>
        <option value="all">Все открытые каталоги</option>
        {Object.entries(ONLINE_SOURCES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <button className="button primary-button" type="submit" disabled={busy || !connected || query.trim().length < 2}><Search size={16} /> {busy ? 'Ищем…' : 'Искать онлайн'}</button>
    </form>
    {error && <p className="online-message error" role="alert">{error}</p>}
    {tracks && <p className="online-message" role="status">{tracks.length ? `Доступно записей: ${tracks.length}` : 'Подходящих записей нет. Попробуйте другой запрос или источник.'}</p>}
    {tracks && tracks.length > 0 && <ul className="online-results">
      {tracks.map((track) => <li key={track.id}>
        <Artwork track={track} />
        <div className="online-result-copy"><strong title={track.title}>{track.title}</strong><span>{track.artist}{track.duration > 0 ? ` · ${formatTime(track.duration)}` : ''}</span>
          <OnlineCredit track={track} /></div>
        <div className="online-result-actions">
          <button type="button" className="icon-button" disabled={disabled || !connected} aria-label={`Слушать онлайн: ${track.title}`} title="Слушать онлайн" onClick={() => choose(track, 'play')}><Play size={17} /></button>
          <button type="button" className="icon-button" disabled={disabled} aria-label={`В очередь: ${track.title}`} title="В очередь" onClick={() => choose(track, 'queue')}><ListPlus size={17} /></button>
          <button type="button" className="icon-button" disabled={disabled || saved.has(track.id)} aria-label={saved.has(track.id) ? `Сохранено: ${track.title}` : `Сохранить: ${track.title}`} title="Сохранить ссылку в медиатеке" onClick={() => choose(track, 'save')}>
            {saved.has(track.id) ? <Check size={17} /> : <BookmarkPlus size={17} />}
          </button>
        </div>
      </li>)}
    </ul>}
    <p className="online-footnote">Сохраняется ссылка, не аудиофайл. Для воспроизведения нужна сеть. Эквалайзер и реакция фона на звук работают с файлами.</p>
  </section>;
}

export function OnlineImport({ disabled, save }: { disabled: boolean; save(track: OnlineTrack): void }) {
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled || !connected) return;
    const request = pending.current = new AbortController();
    setBusy(true);
    setError('');
    try {
      const track = await importOnlineTrack(link, request.signal);
      if (!request.signal.aborted) { save(track); setLink(''); }
    } catch (error) { if (!request.signal.aborted) setError(message(error)); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  return <section className="online-import" aria-labelledby="online-import-heading">
    <h2 id="online-import-heading"><Cloud size={17} /> Импорт онлайн-трека</h2>
    <p>Вставьте ссылку на аудиозапись Jamendo или Wikimedia Commons из карточки на Openverse. Luma сохранит запись без скачивания файла.</p>
    <form onSubmit={add} className="online-search-form">
      <input type="url" required maxLength={2048} aria-label="Ссылка на запись Openverse" placeholder="https://openverse.org/audio/…" value={link} onChange={(event) => setLink(event.currentTarget.value)} />
      <button className="button outline-button" disabled={busy || disabled || !connected || !link.trim()} type="submit"><Link2 size={16} /> {busy ? 'Проверяем…' : 'Сохранить ссылку'}</button>
    </form>
    {error && <p className="online-message error" role="alert">{error}</p>}
  </section>;
}
