import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, FileUp, ListMusic, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { MAX_PLAYLIST_TRACKS, playlistTitle } from '../shared/luma-playlists';
import type { Track } from '../shared/media';
import { formatTime } from '../shared/media';
import { ONLINE_SOURCES } from '../shared/online';
import { musicSearchKey } from '../shared/russian';
import { canChooseForPlaylist, IMPORT_STATUS, MAX_PLAYLIST_IMPORT_BYTES, playlistImportFormat, previewPlaylist, readPlaylistImport } from '../shared/playlist-import';
import type { PlaylistDraft } from '../shared/playlist-import';
import spotify from '../assets/playlist-sources/spotify.svg';
import appleMusic from '../assets/playlist-sources/apple-music.svg';
import deezer from '../assets/playlist-sources/deezer.svg';
import youtubeMusic from '../assets/playlist-sources/youtube-music.svg';
import soundcloud from '../assets/playlist-sources/soundcloud.svg';
import tidal from '../assets/playlist-sources/tidal.svg';
import yandexMusic from '../assets/playlist-sources/yandex-music.png';
import './playlist-import.css';

const sources = [
  { id: 'luma', name: 'Luma', icon: ListMusic, hint: '.luma.json' },
  { id: 'spotify', name: 'Spotify', logo: spotify, hint: 'Playlist*.json / CSV / TXT' },
  { id: 'apple', name: 'Apple Music', logo: appleMusic, hint: 'TXT / CSV' },
  { id: 'deezer', name: 'Deezer', logo: deezer, hint: 'CSV / TXT' },
  { id: 'youtube', name: 'YouTube Music', logo: youtubeMusic, hint: 'CSV / TXT' },
  { id: 'soundcloud', name: 'SoundCloud', logo: soundcloud, hint: 'CSV / TXT' },
  { id: 'tidal', name: 'Tidal', logo: tidal, hint: 'CSV / TXT' },
  { id: 'yandex', name: 'Яндекс Музыка', logo: yandexMusic, hint: 'CSV / TXT' },
  { id: 'file', name: 'Другой сервис или список', icon: FileText, hint: 'CSV / TXT' },
  { id: 'm3u', name: 'Плейлист из M3U', icon: ListMusic, hint: 'M3U / M3U8' },
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
  const [drafts, setDrafts] = useState<PlaylistDraft[]>([]);
  const [list, setList] = useState(0);
  const [title, setTitle] = useState('');
  const [page, setPage] = useState(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Map<number, string | null>>(() => new Map());
  const draft = drafts[list];
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

  function select(next: PlaylistDraft[], index: number) {
    setChoices(new Map()); setDrafts(next); setList(index); setTitle(next[index]?.title || t('Импортированный плейлист')); setPage(0); setError('');
  }
  function goBack() {
    request.current++;
    if (preview) setDrafts([]); else setSource(undefined);
    setReading(false); setError('');
  }
  async function read(file: File, provider: ImportSource) {
    const current = ++request.current;
    setError('');
    setReading(true);
    try {
      if (file.size > MAX_PLAYLIST_IMPORT_BYTES) throw new Error('Выберите файл плейлиста размером до 2 МБ.');
      const format = provider.id === 'luma' && /\.json$/i.test(file.name) ? 'luma-json' : playlistImportFormat(file.name);
        const allowed = provider.id === 'm3u' ? format === 'm3u' : provider.id === 'luma' ? format === 'luma-json'
        : format === 'csv' || format === 'txt' || (format === 'spotify-json' && provider.id === 'spotify');
      if (!format || !allowed) {
        throw new Error('Формат не подходит для выбранного источника.');
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request.current !== current) return;
      const next = readPlaylistImport(bytes, format, file.name);
      select(next, next.findIndex(({ rows }) => rows.length > 0));
    } catch (reason) {
      if (request.current === current) setError(reason instanceof Error ? reason.message : 'Не удалось прочитать файл плейлиста.');
    } finally { if (request.current === current) setReading(false); }
  }

  return <dialog ref={dialog} className="playlist-import" aria-labelledby={id} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="dialog-header playlist-import-head">
      <div className="online-mark" aria-hidden="true"><ListMusic size={20} /></div>
      <div><p className="overline">{t('Мои плейлисты')} · {t('Шаг {0} из 3', step)}</p>
        <h2 id={id} ref={heading} tabIndex={-1}>{t('Импорт плейлиста')}</h2></div>
      <button type="button" className="icon-button" aria-label={t('Закрыть')} onClick={close}><X size={20} /></button>
    </header>
    <div className="playlist-import-progress" aria-hidden="true">{[1, 2, 3].map((item) => <span key={item} data-complete={item <= step || undefined} />)}</div>
    <div className="playlist-import-body" ref={body}>
      {step === 1 && <>
        <h3>{t('Из какого сервиса переносим?')}</h3>
        <p>{t('Выберите источник и откройте экспорт плейлиста. Luma сопоставит его с вашими локальными треками.')}</p>
        <ul className="playlist-import-sources">{sources.map((item) => <li key={item.id}>
          <button type="button" data-source={item.id} onClick={() => setSource(item)}>
            <span className="playlist-source-mark" aria-hidden="true">{'logo' in item
              ? <img src={item.logo} width={24} height={24} alt="" draggable={false} /> : <item.icon size={19} />}</span>
            <span><strong>{t(item.name)}</strong><small>{item.hint}</small></span><ChevronRight size={17} aria-hidden="true" />
          </button></li>)}</ul>
      </>}
      {step === 2 && source && <>
        <h3>{t(source.name)}</h3>
        <p>{t(source.id === 'spotify' ? 'Откройте Playlist*.json из архива Spotify или экспорт CSV / TXT.'
          : source.id === 'apple' ? 'В приложении «Музыка» экспортируйте список в текстовый файл с данными о треках или выберите CSV.'
          : source.id === 'luma' ? 'Выберите полученный файл .luma.json, затем проверьте совпадения с вашей медиатекой.'
          : source.id === 'm3u' ? 'Откройте M3U / M3U8 со списком локальных аудиофайлов. Luma не открывает пути, ссылки или потоки из списка.'
          : 'Выберите CSV / TXT, экспортированный из сервиса или инструмента переноса плейлистов.')}</p>
        {source.id !== 'm3u' && source.id !== 'luma' && <p>{t('Для CSV нужны колонки «Название» и «Исполнитель», альбом необязателен. В TXT — «Исполнитель — Название» на каждой строке.')}</p>}
        <input type="file" ref={input} hidden accept={source.id === 'spotify' ? '.json,.csv,.txt' : source.id === 'luma' ? '.json' : source.id === 'm3u' ? '.m3u,.m3u8' : '.csv,.txt'} onChange={(event) => {
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
        {draft.skipped > 0 && <p>{t('Пропущено строк без подходящих данных: {0}', draft.skipped)}</p>}
        {!preview.items.length && <p>{t('Пока не выбран ни один трек. Проверьте варианты в списке.')}</p>}
        <ol className="playlist-import-preview" start={page * PAGE_SIZE + 1}>
          {preview.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(({ ref, match, status, candidates }, index) => {
            const row = page * PAGE_SIZE + index;
            return <li key={`${list}:${row}`}>
              <span><strong>{ref.title}</strong><small>{[ref.artist, ref.album].filter(Boolean).join(' · ')}</small>
                {match && (status === 'match' || status === 'chosen') && <small>{t('В плейлист: {0}', `${match.artist} — ${match.title}`)}</small>}</span>
              <span className="playlist-match" data-status={status}>{t(IMPORT_STATUS[status])}</span>
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
