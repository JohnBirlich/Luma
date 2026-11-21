import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, FileUp, ListMusic, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { MAX_PLAYLIST_TRACKS, playlistTitle } from '../shared/luma-playlists';
import type { Track } from '../shared/media';
import { IMPORT_STATUS, MAX_PLAYLIST_IMPORT_BYTES, playlistImportFormat, previewPlaylist, readPlaylistImport } from '../shared/playlist-import';
import type { PlaylistDraft } from '../shared/playlist-import';
import './playlist-import.css';

const sources = [
  { id: 'spotify', name: 'Spotify', mark: 'S', tint: '#49d583', hint: 'Playlist*.json / CSV / TXT' },
  { id: 'apple', name: 'Apple Music', mark: '♪', tint: '#fa7089', hint: 'TXT / CSV' },
  { id: 'deezer', name: 'Deezer', mark: 'D', tint: '#bda0ff', hint: 'CSV / TXT' },
  { id: 'youtube', name: 'YouTube Music', mark: '▶', tint: '#fa7878', hint: 'CSV / TXT' },
  { id: 'soundcloud', name: 'SoundCloud', mark: '☁', tint: '#ff985f', hint: 'CSV / TXT' },
  { id: 'tidal', name: 'Tidal', mark: '◆', tint: '#8ad7e8', hint: 'CSV / TXT' },
  { id: 'yandex', name: 'Яндекс Музыка', mark: 'Я', tint: '#ffd467', hint: 'CSV / TXT' },
  { id: 'file', name: 'Другой сервис или список', mark: '≡', tint: '#aeadff', hint: 'CSV / TXT' },
  { id: 'm3u', name: 'Плейлист из M3U', mark: '♫', tint: '#a9c6ff', hint: 'M3U / M3U8' },
] as const;
type ImportSource = typeof sources[number];
const PAGE_SIZE = 10;

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
  const draft = drafts[list];
  const preview = useMemo(() => draft ? previewPlaylist(draft, collection) : undefined, [draft, collection]);
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
    setDrafts(next); setList(index); setTitle(next[index]?.title || t('Импортированный плейлист')); setPage(0); setError('');
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
      const format = playlistImportFormat(file.name);
      if (!format || (provider.id === 'm3u' ? format !== 'm3u' : format === 'm3u' || (format === 'spotify-json' && provider.id !== 'spotify'))) {
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
            <span className="playlist-source-mark" style={{ '--source-tone': item.tint } as CSSProperties} aria-hidden="true">{item.mark}</span>
            <span><strong>{t(item.name)}</strong><small>{item.hint}</small></span><ChevronRight size={17} aria-hidden="true" />
          </button></li>)}</ul>
      </>}
      {step === 2 && source && <>
        <h3>{t(source.name)}</h3>
        <p>{t(source.id === 'spotify' ? 'Откройте Playlist*.json из архива Spotify или экспорт CSV / TXT.'
          : source.id === 'apple' ? 'В приложении «Музыка» экспортируйте список в текстовый файл с данными о треках или выберите CSV.'
          : source.id === 'm3u' ? 'Откройте M3U / M3U8 со списком локальных аудиофайлов. Luma не открывает пути, ссылки или потоки из списка.'
          : 'Выберите CSV / TXT, экспортированный из сервиса или инструмента переноса плейлистов.')}</p>
        {source.id !== 'm3u' && <p>{t('Для CSV нужны колонки «Название» и «Исполнитель», альбом необязателен. В TXT — «Исполнитель — Название» на каждой строке.')}</p>}
        <input type="file" ref={input} hidden accept={source.id === 'spotify' ? '.json,.csv,.txt' : source.id === 'm3u' ? '.m3u,.m3u8' : '.csv,.txt'} onChange={(event) => {
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
        <p>{t('Сохранятся только однозначно сопоставленные локальные треки, в исходном порядке (до {0}).', MAX_PLAYLIST_TRACKS)}</p>
        {draft.skipped > 0 && <p>{t('Пропущено строк без подходящих данных: {0}', draft.skipped)}</p>}
        {!preview.items.length && <p>{t('Нет однозначных совпадений. Добавьте аудиофайлы в Luma и повторите импорт.')}</p>}
        <ol className="playlist-import-preview" start={page * PAGE_SIZE + 1}>
          {preview.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(({ ref, match, status }, index) => <li key={page * PAGE_SIZE + index}>
            <span><strong>{match?.title ?? ref.title}</strong><small>{[match?.artist ?? ref.artist, match?.album ?? ref.album].filter(Boolean).join(' · ')}</small></span>
            <span className="playlist-match" data-status={status}>{t(IMPORT_STATUS[status])}</span>
          </li>)}
        </ol>
        {preview.rows.length > PAGE_SIZE && <div className="playlist-import-pager">
          <button type="button" className="icon-button" aria-label={t('Предыдущая страница')} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button>
          <span>{page + 1} / {Math.ceil(preview.rows.length / PAGE_SIZE)}</span>
          <button type="button" className="icon-button" aria-label={t('Следующая страница')} disabled={(page + 1) * PAGE_SIZE >= preview.rows.length} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
        </div>}
      </>}
      {error && <p className="hub-error" role="alert">{t(error)}</p>}
    </div>
    <footer className="playlist-import-foot">
      {source && <button type="button" className="button outline-button" onClick={goBack}><ArrowLeft size={16} />{t('Назад')}</button>}
      {preview && <button type="button" className="button primary-button" disabled={!playlistTitle(title) || !preview.items.length} onClick={() => {
        if (!save(title, preview.items)) setError('Не удалось сохранить плейлист. Проверьте лимит плейлистов.');
      }}>{t('Сохранить плейлист')}</button>}
    </footer>
  </dialog>;
}
