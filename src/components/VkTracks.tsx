import { useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronLeft, ChevronRight, ListMusic, Music2, Play, Search, Trash2 } from 'lucide-react';
import type { VkTracksState } from '../data/vk-tracks';
import { useText } from '../i18n/context';
import type { Track } from '../shared/media';
import { filterVkTracks, vkLocalFiles, vkTrackKey } from '../shared/vk-tracks';
import type { VkTrack } from '../shared/vk-tracks';

interface FilePlayback { library: readonly Track[]; play(id: string): void; disabled: boolean }
const PAGE_SIZE = 12;

function VkTrackRows({ items, library, play, disabled, lookup }: FilePlayback & { items: readonly VkTrack[]; lookup?(item: VkTrack): void }) {
  const t = useText();
  const localFile = useMemo(() => vkLocalFiles(library), [library]);
  return <ul className="vk-track-list">{items.map((item) => {
    const file = localFile(item);
    const details = [item.artist, item.album].filter(Boolean).join(' · ');
    return <li key={vkTrackKey(item)}>
      <span className="vk-track-mark" aria-hidden="true"><Music2 size={16} /></span>
      <div className="vk-track-copy"><strong>{item.title}</strong>{details && <small>{details}</small>}</div>
      {file ? <button className="icon-button vk-file-play" type="button" disabled={disabled} onClick={() => play(file.id)}
        aria-label={t('Слушать локальный файл: {0}', item.title)} title={t('Слушать локальный файл')}><Play size={16} fill="currentColor" /></button>
        : lookup ? <button className="icon-button" type="button" disabled={disabled} onClick={() => lookup(item)}
          aria-label={t('Искать в Luma: {0}', item.title)} title={t('Искать в Luma')}><Search size={16} /></button> : null}
    </li>;
  })}</ul>;
}

export function VkTracksShelf({ state, lookup, ...playback }: FilePlayback & { state: VkTracksState; lookup(item: VkTrack): void }) {
  const t = useText();
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const matches = useMemo(() => filterVkTracks(state.items, filter), [state.items, filter]);
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const offset = currentPage * PAGE_SIZE;
  const canEdit = state.ready && !state.busy;
  return <section className="hub-shelf vk-track-shelf" aria-labelledby="vk-tracks-title">
    <header className="hub-shelf-head"><h2 id="vk-tracks-title"><ListMusic size={18} aria-hidden="true" />{t('Мои треки из VK')}</h2>
      <span className="hub-badge">{state.items.length ? t('Записей: {0}', state.items.length) : t('Локальный список')}</span></header>
    <p className="hub-note">{t('Импортируйте список треков из файла. Это названия и исполнители, не загрузка аудио и не синхронизация VK.')}</p>
    <div className="vk-track-actions">
      <input ref={input} type="file" hidden accept=".csv,.txt,text/csv,text/plain" aria-label={t('Файл списка треков VK')} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file && canEdit) { setFilter(''); setPage(0); setConfirmClear(false); void state.update(file); }
      }} />
      <button type="button" className="button outline-button" disabled={!canEdit} onClick={() => input.current?.click()}>
        <ArrowDownToLine size={16} />{t(state.items.length ? 'Заменить список из файла' : 'Импортировать CSV или TXT')}</button>
      {state.items.length > 0 && <button type="button" className="text-button" disabled={!canEdit} onClick={() => setConfirmClear(!confirmClear)}
        aria-expanded={confirmClear} aria-controls="vk-tracks-clear"><Trash2 size={16} />{t('Очистить список VK')}</button>}
    </div>
    {confirmClear && <div id="vk-tracks-clear" className="vk-track-confirm">
      <p className="hub-note">{t('Удалится только список внутри Luma. Файлы, закладки и аккаунт VK не изменятся.')}</p>
      <div className="vk-track-actions"><button type="button" className="button outline-button" disabled={!canEdit} onClick={() => {
        setConfirmClear(false); setFilter(''); setPage(0); void state.update();
      }}>{t('Удалить список')}</button><button className="text-button" type="button" onClick={() => setConfirmClear(false)}>{t('Отмена')}</button></div>
    </div>}
    {state.error ? <p className="hub-error" role="alert">{t(state.error)}</p>
      : state.busy || !state.ready ? <p className="hub-note" role="status">{t('Читаем список VK…')}</p>
      : state.saved !== undefined && <p className="hub-note" role="status">{state.saved ? t('Сохранено записей: {0}', state.saved) : t('Список VK удалён.')}</p>}
    <details className="vk-track-format">
      <summary>{t('Формат файла')}</summary>
      <p className="hub-note">{t('Файл в UTF-8, до 2 МБ и 10 000 записей. CSV: колонки title, artist, album (альбом необязателен). TXT: одна строка «Исполнитель — Название» на трек.')}</p>
      <p className="hub-note">{t('Файл не отправляется в интернет. Если в медиатеке есть однозначное совпадение по тегам, можно включить локальный файл.')}</p>
    </details>
    {!!state.items.length && <>
      <div className="library-search vk-track-filter"><Search size={16} aria-hidden="true" /><input type="search" maxLength={140} value={filter}
        onChange={(event) => { setFilter(event.currentTarget.value); setPage(0); }} aria-label={t('Поиск в списке VK')} placeholder={t('Поиск в списке VK')} /></div>
      {matches.length ? <VkTrackRows {...playback} items={matches.slice(offset, offset + PAGE_SIZE)} lookup={lookup} />
        : <p className="hub-note">{t('В списке VK нет совпадений.')}</p>}
      {lastPage > 0 && <div className="vk-track-pages" role="group" aria-label={t('Страницы списка VK')}>
        <button className="icon-button" type="button" disabled={!currentPage} aria-label={t('Предыдущая страница')} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
        <span className="hub-note" role="status">{t('{0}–{1} из {2}', offset + 1, Math.min(offset + PAGE_SIZE, matches.length), matches.length)}</span>
        <button className="icon-button" type="button" disabled={currentPage === lastPage} aria-label={t('Следующая страница')} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
      </div>}
    </>}
  </section>;
}

export function VkTrackMatches({ items, query, open, ...playback }: FilePlayback & { items: readonly VkTrack[]; query: string; open(): void }) {
  const t = useText();
  const matches = useMemo(() => query.trim() ? filterVkTracks(items, query) : [], [items, query]);
  if (!matches.length) return null;
  return <section className="hub-shelf vk-track-matches" aria-labelledby="vk-matches-title">
    <header className="hub-shelf-head"><h2 id="vk-matches-title"><ListMusic size={18} aria-hidden="true" />{t('Из списка VK')}</h2>
      <button className="text-button" type="button" onClick={open}>{t('Весь список')}<ChevronRight size={15} /></button></header>
    <p className="hub-note">{t('Импортированные названия · совпадений: {0}', matches.length)}</p>
    <VkTrackRows {...playback} items={matches.slice(0, 6)} />
  </section>;
}
