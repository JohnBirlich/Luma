import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, FileMusic, FileText, FileUp, Link2, ListMusic, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { MAX_PLAYLIST_TRACKS, playlistTitle } from '../shared/luma-playlists';
import type { Track } from '../shared/media';
import { formatTime } from '../shared/media';
import { ONLINE_SOURCES } from '../shared/online';
import { musicSearchKey } from '../shared/russian';
import { canChooseForPlaylist, checkPlaylistImportSize, IMPORT_STATUS, playlistImportFormat, previewPlaylist, readPlaylistImport } from '../shared/playlist-import';
import type { PlaylistDraft } from '../shared/playlist-import';
import { openwhydPlaylistUrl } from '../shared/openwhyd';
import type { OpenwhydDraft } from '../shared/openwhyd';
import { providerError } from '../data/music-services';
import { SourceLink } from './OnlineMusic';
import spotify from '../assets/playlist-sources/spotify.svg';
import appleMusic from '../assets/playlist-sources/apple-music.svg';
import deezer from '../assets/playlist-sources/deezer.svg';
import soundcloud from '../assets/playlist-sources/soundcloud.svg';
import tidal from '../assets/playlist-sources/tidal.svg';
import yandexMusic from '../assets/playlist-sources/yandex-music.png';
import './playlist-import.css';

const sources = [
  { id: 'luma', name: 'Luma', icon: ListMusic, hint: '.luma.json', tint: '#8b7bf7' },
  { id: 'unison', name: 'Unison', icon: FileText, hint: 'JSON', tint: '#5fa8ff' },
  { id: 'openwhyd', name: 'Openwhyd', icon: Link2, hint: 'https://openwhyd.org/…', tint: '#37c5a8' },
  { id: 'spotify', name: 'Spotify', logo: spotify, hint: 'Playlist*.json / CSV / TXT', tint: '#1ed760' },
  { id: 'apple', name: 'Apple Music', logo: appleMusic, hint: 'TXT / CSV', tint: '#fa2d48' },
  { id: 'deezer', name: 'Deezer', logo: deezer, hint: 'CSV / TXT', tint: '#a238ff' },
  { id: 'soundcloud', name: 'SoundCloud', logo: soundcloud, hint: 'CSV / TXT', tint: '#ff5500' },
  { id: 'tidal', name: 'Tidal', logo: tidal, hint: 'CSV / TXT', tint: '#8f9bb3' },
  { id: 'yandex', name: 'Яндекс Музыка', logo: yandexMusic, hint: 'CSV / TXT', tint: '#ffcc00' },
  { id: 'vk', name: 'VK Музыка', icon: FileText, hint: 'CSV / TXT', tint: '#4c8bf5' },
  { id: 'file', name: 'Другой сервис или список', icon: FileText, hint: 'CSV / TXT', tint: '#9aa3b5' },
  { id: 'm3u', name: 'Плейлист из M3U', icon: FileMusic, hint: 'M3U / M3U8 · файл плейлиста', tint: '#c58bff' },
] as const;
type ImportSource = typeof sources[number];
const PAGE_SIZE = 10;

function MatchOptions({ title, choices, candidates, match, choice, change }: {
  title: string; choices: readonly Track[]; candidates: readonly Track[]; match?: Track; choice?: string | null;
  change(value: string | null | undefined): void;
}) {
  const t = useText();
  const [search, setSearch] = useState('');
  const term = musicSearchKey(search);
  const found: Track[] = [];
  if (term) for (const track of choices) {
    if (musicSearchKey(`${track.title} ${track.artist} ${track.album} ${track.fileName ?? ''}`).includes(term)) found.push(track);
    if (found.length >= 24) break;
  }
  const options = [...new Map([...(match ? [match] : []), ...candidates, ...found].map((track) => [track.id, track])).values()];
  return <details className="playlist-match-options">
    <summary>{t('Выбрать или пропустить')}</summary>
    <label className="playlist-import-field">{t('Поиск другого варианта')}<input type="search" maxLength={140} value={search}
      onChange={(event) => setSearch(event.currentTarget.value)} /></label>
    <label className="playlist-import-field">{t('Совпадение для «{0}»', title)}<select value={choice === null ? 'skip' : choice ? `id:${choice}` : 'auto'}
      onChange={(event) => { const value = event.currentTarget.value; change(value === 'skip' ? null : value.startsWith('id:') ? value.slice(3) : undefined); }}>
      <option value="auto">{t('Автоматически (только локальный файл)')}</option>
      <option value="skip">{t('Пропустить трек')}</option>
      {options.map((track) => <option value={`id:${track.id}`} key={track.id}>
        {[track.title, track.artist, track.album, track.duration > 0 && formatTime(track.duration), track.fileName || (track.online && track.online.source !== 'broadcast' ? ONLINE_SOURCES[track.online.source] : t('Файл'))].filter(Boolean).join(' · ')}
      </option>)}
    </select></label>
    {term && !found.length && <small>{t('Нет подходящих треков.')}</small>}
  </details>;
}

export function PlaylistImport({ collection, save, close }: {
  collection: readonly Track[]; save(title: string, tracks: readonly Track[]): boolean; close(): void;
}) {
  const t = useText();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const [source, setSource] = useState<ImportSource>();
  const [drafts, setDrafts] = useState<(PlaylistDraft | OpenwhydDraft)[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [list, setList] = useState(0);
  const [title, setTitle] = useState('');
  const [page, setPage] = useState(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Map<number, string | null>>(() => new Map());
  const draft = drafts[list];
  const linked = draft && 'sourceLinks' in draft ? draft : undefined;
  const available = useMemo(() => collection.filter(canChooseForPlaylist), [collection]);
  const preview = useMemo(() => draft ? previewPlaylist(draft, collection, choices) : undefined, [draft, collection, choices]);
  function resolve(index: number, value: string | null | undefined) {
    setChoices((prior) => {
      const next = new Map(prior);
      if (value === undefined) next.delete(index); else next.set(index, value);
      return next;
    });
    setError('');
  }
  const step = preview ? 3 : source ? 2 : 1;

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { request.current++; element?.close(); };
  }, []);
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  function select(next: (PlaylistDraft | OpenwhydDraft)[], index: number) {
    setChoices(new Map()); setDrafts(next); setList(index); setTitle(next[index]?.title || t('Импортированный плейлист')); setPage(0); setError('');
  }
  function goBack() {
    request.current++;
    if (preview) setDrafts([]); else setSource(undefined);
    setReading(false); setError('');
  }
  async function loadPublicPlaylist() {
    const bridge = window.luma?.importOpenwhyd;
    if (!bridge || reading) return;
    if (!openwhydPlaylistUrl(playlistUrl)) { setError('Нужна публичная ссылка на плейлист Openwhyd.'); return; }
    const current = ++request.current;
    setReading(true); setError('');
    try {
      const result = await bridge(playlistUrl);
      if (current === request.current) select([result], 0);
    } catch (reason) {
      if (current === request.current) setError(providerError(reason, [
        'Нужна публичная ссылка на плейлист Openwhyd.', 'Плейлист Openwhyd не найден или не опубликован.',
        'В открытом плейлисте Openwhyd нет записей.', 'Ответ Openwhyd не удалось прочитать.',
      ], 'Не удалось загрузить плейлист Openwhyd. Проверьте сеть и ссылку.'));
    } finally { if (current === request.current) setReading(false); }
  }
  async function read(file: File, provider: ImportSource) {
    const current = ++request.current;
    setError('');
    setReading(true);
    try {
      const json = /\.json$/i.test(file.name);
      const format = json && provider.id === 'luma' ? 'luma-json' : json && provider.id === 'unison' ? 'unison-json' : playlistImportFormat(file.name);
      const allowed = provider.id === 'm3u' ? format === 'm3u' : provider.id === 'luma' ? format === 'luma-json' : provider.id === 'unison' ? format === 'unison-json'
        : format === 'csv' || format === 'txt' || (format === 'spotify-json' && provider.id === 'spotify');
      if (!format || !allowed) throw new Error('Формат не подходит для выбранного источника.');
      checkPlaylistImportSize(file.size, format);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request.current !== current) return;
      const next = readPlaylistImport(bytes, format, file.name);
      select(next, next.findIndex(({ rows }) => rows.length > 0));
    } catch (reason) {
      if (request.current === current) setError(reason instanceof Error ? reason.message : 'Не удалось прочитать файл плейлиста.');
    } finally { if (request.current === current) setReading(false); }
  }

  return <dialog ref={dialog} className="playlist-import" aria-labelledby={id} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className={`playlist-import-head${step === 1 ? ' is-first-step' : ''}`}>
      {step > 1 && <div className="online-mark" aria-hidden="true"><ListMusic size={20} /></div>}
      <div className="playlist-import-title">
        <h2 id={id} ref={heading} tabIndex={-1}>{t('Импорт плейлистов')}</h2>
        {step === 1 && <p>{t('С какого сервиса переносим?')}</p>}
      </div>
      <button type="button" className="icon-button" aria-label={t('Закрыть')} onClick={close}><X size={20} /></button>
    </header>
    <div className="playlist-import-progress" aria-hidden="true">{[1, 2, 3].map((item) => <span key={item} data-complete={item <= step || undefined} />)}</div>
    <div className="playlist-import-body" ref={body}>
      {step === 1 && <>
        <div className="playlist-import-card">
          <ul className="playlist-import-sources">{[...sources.filter((item) => item.id !== 'm3u'), ...sources.filter((item) => item.id === 'm3u')].map((item) => <li key={item.id}
            className={item.id === 'm3u' ? 'playlist-source-file' : undefined}>
            {item.id === 'm3u' && <p className="playlist-import-divider">{t('Или файл плейлиста')}</p>}
            <button type="button" data-source={item.id} onClick={() => setSource(item)}>
              <span className="playlist-source-mark" style={{ '--source-tint': item.tint } as CSSProperties} aria-hidden="true">{'logo' in item
                ? <img src={item.logo} width={24} height={24} alt="" draggable={false} /> : <item.icon size={18} />}</span>
              <span><strong>{t(item.name)}</strong><small>{item.hint}</small></span><ChevronRight size={16} aria-hidden="true" />
            </button></li>)}</ul>
        </div>
        <p>{t('Выберите источник. Luma сопоставит список с вашими локальными треками.')}</p>
      </>}
      {step === 2 && source?.id === 'openwhyd' && <>
        <h3>Openwhyd</h3>
        <p>{t('Вставьте ссылку на публичный плейлист. Luma прочитает названия и ссылки для предпросмотра, но не загрузит аудио.')}</p>
        {window.luma?.importOpenwhyd ? <form className="openwhyd-import-form" onSubmit={(event) => { event.preventDefault(); void loadPublicPlaylist(); }}>
          <label className="playlist-import-field">{t('Ссылка на плейлист Openwhyd')}<input type="url" value={playlistUrl} required maxLength={1024} disabled={reading}
            placeholder="https://openwhyd.org/adrien/playlist/10" onChange={(event) => { setPlaylistUrl(event.currentTarget.value); setError(''); }} /></label>
          <button className="button primary-button" type="submit" disabled={reading || !playlistUrl.trim()}><Link2 size={16} />{t(reading ? 'Читаем список…' : 'Загрузить список')}</button>
        </form> : <p>{t('Импорт ссылки Openwhyd доступен в настольной Luma.')}</p>}
      </>}
      {step === 2 && source && source.id !== 'openwhyd' && <>
        <h3>{t(source.name)}</h3>
        <p>{t(source.id === 'spotify' ? 'Откройте Playlist*.json из архива Spotify или экспорт CSV / TXT.'
          : source.id === 'apple' ? 'В приложении «Музыка» экспортируйте список в текстовый файл с данными о треках или выберите CSV.'
          : source.id === 'luma' ? 'Выберите полученный файл .luma.json, затем проверьте совпадения с вашей медиатекой.'
          : source.id === 'unison' ? 'Откройте резервную копию из Unison. Luma читает только плейлисты и избранное, не историю и не настройки.'
          : source.id === 'vk' ? 'Если у вас уже есть список VK в CSV или TXT, откройте его здесь. Luma не подключается к аккаунту VK и не скачивает музыку.'
          : source.id === 'm3u' ? 'Откройте M3U или M3U8 — обычный список или расширенный с #EXTINF. Luma читает только названия и исполнителей и сопоставляет их с вашей медиатекой; пути, ссылки и потоки из списка не открываются.'
          : 'Выберите CSV / TXT, экспортированный из сервиса или инструмента переноса плейлистов.')}</p>
        {source.id !== 'm3u' && source.id !== 'luma' && source.id !== 'unison' && <p>{t('Для CSV нужны колонки «Название» и «Исполнитель», альбом необязателен. В TXT — «Исполнитель — Название» на каждой строке.')}</p>}
        <input type="file" ref={input} hidden accept={source.id === 'spotify' ? '.json,.csv,.txt' : source.id === 'luma' || source.id === 'unison' ? '.json' : source.id === 'm3u' ? '.m3u,.m3u8' : '.csv,.txt'} onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void read(file, source);
        }} />
        <button type="button" className="button primary-button" disabled={reading} onClick={() => input.current?.click()}><FileUp size={16} />{t(reading ? 'Читаем список…' : 'Выбрать файл')}</button>
        <p>{t('Только метаданные. Без входа в сервис, импорта по ссылке и скачивания музыки.')}</p>
      </>}
      {draft && preview && <>
        <h3>{t('Что войдёт в плейлист')}</h3>
        {drafts.length > 1 && <label className="playlist-import-field">{t('Плейлист в файле')}<select value={list} onChange={(event) => select(drafts, Number(event.currentTarget.value))}>
          {drafts.map((item, index) => <option key={index} value={index}>{item.title || t('Плейлист {0}', index + 1)} · {item.rows.length}</option>)}
        </select></label>}
        <label className="playlist-import-field">{t('Название плейлиста')}<input value={title} maxLength={64} onChange={(event) => { setTitle(event.currentTarget.value); setError(''); }} /></label>
        <p className="playlist-import-summary" role="status">{t('Будет добавлено {0} из {1} записей', preview.items.length, preview.rows.length + draft.skipped)}</p>
        <p>{t('Проверьте совпадения. Можно выбрать другой трек из медиатеки или пропустить строку. Порядок исходного списка сохранится (до {0}).', MAX_PLAYLIST_TRACKS)}</p>
        {linked?.limited && <p>{t('Показаны первые 200 записей открытого плейлиста.')}</p>}
        {draft.skipped > 0 && <p>{t('Пропущено строк без подходящих данных: {0}', draft.skipped)}</p>}
        {!preview.items.length && <p>{t('Пока не выбран ни один трек. Проверьте варианты в списке.')}</p>}
        <ol className="playlist-import-preview" start={page * PAGE_SIZE + 1}>
          {preview.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(({ ref, match, status, candidates }, index) => {
            const row = page * PAGE_SIZE + index;
            const link = linked?.sourceLinks[row];
            return <li key={`${list}:${row}`}>
              <span><strong>{ref.title}</strong><small>{[ref.artist, ref.album].filter(Boolean).join(' · ')}</small>
                {match && (status === 'match' || status === 'chosen') && <small>{t('В плейлист: {0}', `${match.artist} — ${match.title}`)}</small>}</span>
              <span className="playlist-match" data-status={status}>{t(IMPORT_STATUS[status])}</span>
              {link && <SourceLink url={link} className="playlist-origin-link">{t('Оригинальная страница')} <ArrowUpRight size={12} /></SourceLink>}
              <MatchOptions title={ref.title} choices={available} candidates={candidates} match={match} choice={choices.get(row)} change={(value) => resolve(row, value)} />
            </li>;
          })}
        </ol>
      </>}
      {error && <p className="hub-error" role="alert">{t(error)}</p>}
    </div>
    <footer className="playlist-import-foot">
      {source && <button type="button" className="button outline-button" onClick={goBack}><ArrowLeft size={16} />{t('Назад')}</button>}
      {preview && preview.rows.length > PAGE_SIZE && <div className="playlist-import-pager">
          <button type="button" className="icon-button" aria-label={t('Предыдущая страница')} disabled={page === 0} onClick={() => { setPage(page - 1); body.current?.scrollTo({ top: 0 }); }}><ChevronLeft size={18} /></button>
          <span aria-live="polite">{page + 1} / {Math.ceil(preview.rows.length / PAGE_SIZE)}</span>
          <button type="button" className="icon-button" aria-label={t('Следующая страница')} disabled={(page + 1) * PAGE_SIZE >= preview.rows.length} onClick={() => { setPage(page + 1); body.current?.scrollTo({ top: 0 }); }}><ChevronRight size={18} /></button>
        </div>}
      {preview && <button type="button" className="button primary-button" disabled={!playlistTitle(title) || !preview.items.length} onClick={() => {
        if (!save(title, preview.items)) setError('Не удалось сохранить плейлист. Проверьте лимит плейлистов.');
      }}>{t('Сохранить плейлист')}</button>}
    </footer>
  </dialog>;
}
