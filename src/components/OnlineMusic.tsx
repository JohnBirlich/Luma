import type { Text } from '../i18n/text';
import { useText } from '../i18n/context';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, ChevronDown, HardDriveDownload, Cloud, CloudOff, Download, Globe2, Link2, ListPlus, Play, RotateCw, Search } from 'lucide-react';
import { connectionState, subscribeConnection } from '../data/diagnostics';
import { CATALOG_DEBOUNCE_MS, catalogQuery, catalogTargets, mergeCatalogResults, searchCatalogs } from '../data/catalog-search';
import type { CatalogId, CatalogResult } from '../data/catalog-search';
import { importOnlineTrack } from '../data/online';
import { formatTime } from '../shared/media';
import { AUDIUS_LEGAL, commonsMp3Export, ONLINE_SOURCES } from '../shared/online';
import type { OnlineCreditData, OnlineTrack } from '../shared/online';
import { Artwork } from './Artwork';

export type OnlineAction = 'play' | 'queue' | 'save' | 'export' | 'cache';

export function SourceLink({ url, children, className, label }: { url: string; children: ReactNode; className?: string; label?: string }) {
  const t = useText();
  const [failed, setFailed] = useState(false);
  return <><a href={url} className={className} aria-label={label} title={label} target="_blank" rel="noopener noreferrer" onClick={(event) => {
    if (!window.luma) return;
    event.preventDefault();
    setFailed(false);
    void window.luma.openOnlineLink(url).catch(() => setFailed(true));
  }}>{children}</a>{failed && <span role="status">{t("Не удалось открыть ссылку.")}</span>}</>;
}

export function OnlineCredit({ track, compact }: { track: { online: OnlineCreditData }; compact?: boolean }) {
  const t = useText();
  const { source, page, license, licenseUrl } = track.online;
  if (source === 'broadcast') return <span className="online-credit"><SourceLink url={page}>{t('Сайт станции')} <ArrowUpRight size={12} /></SourceLink></span>;
  return <span className="online-credit"><SourceLink url={page}>{ONLINE_SOURCES[source]} <ArrowUpRight size={12} /></SourceLink>
    {!compact && <> · {licenseUrl ? <SourceLink url={licenseUrl}>{license}</SourceLink> : t(license)}</>}</span>;
}

function message(error: unknown, t: Text) {
  const code = error instanceof Error && /^Каталог сейчас недоступен \(HTTP (\d+)\)\. Повторите попытку позже\.$/.exec(error.message);
  if (code) return t("Каталог сейчас недоступен (HTTP {0}). Повторите попытку позже.", code[1]);
  return error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError) && error.name !== 'TimeoutError'
    ? t(error.message) : t("Не удалось связаться с каталогом. Проверьте подключение и повторите попытку.");
}

export interface CatalogSearchPreferences { autoCatalogSearch: boolean; changeAutoCatalogSearch(value: boolean): void }

const visibleDocument = () => document.visibilityState !== 'hidden';
function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

type SearchAttempt = { term: string };
type SearchSnapshot = { term: string; attempt?: SearchAttempt; results: Partial<Record<CatalogId, CatalogResult>> };

/** Both search surfaces share one policy and show each supported catalog as it finishes. */
export function OnlineSearch({ query, visible, autoCatalogSearch, changeAutoCatalogSearch, saved, disabled, choose }: CatalogSearchPreferences & {
  query: string; visible: boolean; saved: ReadonlySet<string>; disabled: boolean; choose(track: OnlineTrack, action: OnlineAction): void;
}) {
  const t = useText();
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const foreground = useSyncExternalStore(subscribeVisibility, visibleDocument);
  const desktop = !!window.luma?.searchCommunity;
  const targets = useMemo(() => catalogTargets(desktop), [desktop]);
  const term = catalogQuery(query);
  const [manual, setManual] = useState<SearchAttempt>();
  const attempt = manual?.term === term ? manual : undefined;
  // A manual request (including a retry) never carries over to later input.
  if (manual && !attempt) setManual(undefined);
  const [snapshot, setSnapshot] = useState<SearchSnapshot>();
  const active = !!term && connected && visible && foreground && (autoCatalogSearch || !!attempt);
  const results = active && snapshot?.term === term && snapshot.attempt === attempt ? snapshot.results : undefined;
  const settled = targets.flatMap(({ id }) => results?.[id] ?? []);
  const searching = active && settled.length < targets.length;
  const tracks = mergeCatalogResults(settled);
  const failures = settled.filter((result) => 'error' in result);

  useEffect(() => {
    if (!active) return;
    const request = new AbortController();
    const timeout = window.setTimeout(() => {
      setSnapshot({ term, attempt, results: {} });
      void searchCatalogs(term, targets, request.signal, (result) => {
        setSnapshot((state) => state?.term === term && state.attempt === attempt
          ? { ...state, results: { ...state.results, [result.id]: result } } : state);
      });
    }, attempt ? 0 : CATALOG_DEBOUNCE_MS);
    return () => { window.clearTimeout(timeout); request.abort(); };
  }, [active, term, attempt, targets]);

  const canRequest = !!term && connected && visible && foreground && !searching;
  const searchLabel = t(autoCatalogSearch ? 'Повторить поиск' : 'Искать во всех каталогах');
  const SearchIcon = autoCatalogSearch ? RotateCw : Search;
  return <section className="online-panel catalog-search" aria-labelledby="online-title">
    <header className="catalog-header">
      <h2 id="online-title"><Globe2 size={17} aria-hidden="true" />{t('Онлайн-каталоги')}</h2>
      <div className="catalog-controls">
        <label className="catalog-toggle" title={t('Автоматический онлайн-поиск')}>
          <input type="checkbox" aria-label={t('Автоматический онлайн-поиск')} checked={autoCatalogSearch} onChange={(event) => {
            setSnapshot(undefined); setManual(undefined); changeAutoCatalogSearch(event.currentTarget.checked);
          }} />{t('Автопоиск')}
        </label>
        {(!autoCatalogSearch || failures.length > 0) && <button className="icon-button catalog-request" type="button" disabled={!canRequest}
          aria-label={searchLabel} title={searchLabel} onClick={() => setManual({ term })}><SearchIcon size={16} aria-hidden="true" /></button>}
      </div>
    </header>
    <details className="catalog-details">
      <summary><ChevronDown size={13} aria-hidden="true" />{t('Источники')}
        {!!failures.length && <span className="catalog-failure-count">{t('Не ответили: {0}', failures.length)}</span>}
      </summary>
      <ul className="catalog-sources" aria-label={t('Статус каталогов')}>
        {targets.map(({ id, name }) => {
          const row = results?.[id];
          const error = row && 'error' in row;
          const status = error ? t('Не ответил') : row && 'tracks' in row ? t('Записей: {0}', row.tracks.length)
            : searching ? t('Ищем…') : null;
          return <li key={id} data-catalog={id} data-state={error ? 'error' : row ? 'done' : searching ? 'loading' : 'idle'}>
            <strong>{t(name)}</strong>{status && <span>{status}</span>}
            {error && <small>{message(row.error, t)}</small>}
          </li>;
        })}
      </ul>
      <p className="catalog-privacy">{t(desktop ? 'При поиске каталоги получают только текущий запрос.'
        : 'В веб-версии запрос отправляется только в Openverse. Другие каталоги доступны в Windows.')}</p>
      <p className="catalog-privacy">{t('Закладка сохраняет ссылку, а не аудиофайл.')}</p>
      {desktop && <p className="catalog-privacy"><SourceLink url={AUDIUS_LEGAL.terms}>{t('Условия API Audius')}</SourceLink>
        {' · '}<SourceLink url={AUDIUS_LEGAL.privacy}>{t('Конфиденциальность Audius')}</SourceLink></p>}
    </details>
    {!connected && <p className="online-offline" role="status"><CloudOff size={17} />{' '}{t('Устройство вне сети. Онлайн-поиск пока недоступен.')}</p>}
    {!term && !!query.trim() && <p className="online-message">{t('Введите не менее двух символов, чтобы искать треки.')}</p>}
    {searching && !settled.length && <p className="online-message" role="status">{t('Ищем записи в каталогах…')}</p>}
    {!!settled.length && <p className="online-message" role="status">{tracks.length ? t('Доступно записей: {0}', tracks.length)
      : searching ? t('Ждём ответы других каталогов…') : failures.length === targets.length ? t('Ни один каталог не ответил.')
        : t('В ответивших каталогах нет подходящих записей.')}</p>}
    {tracks.length > 0 && <ul className="online-results">
      {tracks.map((track) => <li key={track.id} data-source={track.online.source}>
        <Artwork track={track} />
        <div className="online-result-copy"><strong title={track.title}>{track.title}</strong><span>{track.artist}{track.duration > 0 ? ` · ${formatTime(track.duration)}` : ''}</span>
          <OnlineCredit track={track} /></div>
        <div className="online-result-actions">
          <button type="button" className="icon-button" disabled={disabled || !connected} aria-label={t("Слушать онлайн: {0}", track.title)} title={t("Слушать онлайн")} onClick={() => choose(track, 'play')}><Play size={17} /></button>
          <button type="button" className="icon-button" disabled={disabled} aria-label={t("В очередь: {0}", track.title)} title={t("В очередь")} onClick={() => choose(track, 'queue')}><ListPlus size={17} /></button>
          {track.online.source !== 'audius' && <button type="button" className="icon-button" disabled={disabled || saved.has(track.id)} aria-label={saved.has(track.id) ? t("Сохранено: {0}", track.title) : t("Сохранить: {0}", track.title)} title={t("Сохранить ссылку в медиатеке")} onClick={() => choose(track, 'save')}>
            {saved.has(track.id) ? <Check size={17} /> : <BookmarkPlus size={17} />}
          </button>}
          {window.luma?.streamCache && commonsMp3Export(track) && <button type="button" className="icon-button" disabled={disabled || !connected} aria-label={t("В кэш: {0}", track.title)} title={t("Сохранить временную копию для офлайн-прослушивания")} onClick={() => choose(track, 'cache')}><HardDriveDownload size={17} /></button>}
          {window.luma && commonsMp3Export(track) && <button type="button" className="icon-button" disabled={disabled || !connected} aria-label={t("Скачать MP3: {0}", track.title)} title={t("Сохранить копию MP3")} onClick={() => choose(track, 'export')}><Download size={17} /></button>}
        </div>
      </li>)}
    </ul>}
  </section>;
}

export function OnlineImport({ disabled, save }: { disabled: boolean; save(track: OnlineTrack): void }) {
  const t = useText();
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown }>();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled || !connected) return;
    const request = pending.current = new AbortController();
    setBusy(true);
    setFailure(undefined);
    try {
      const track = await importOnlineTrack(link, request.signal);
      if (!request.signal.aborted) { save(track); setLink(''); }
    } catch (error) { if (!request.signal.aborted) setFailure({ cause: error }); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  return <section className="online-import" aria-labelledby="online-import-heading">
    <h2 id="online-import-heading"><Cloud size={17} />{" "}{t("Импорт онлайн-трека")}</h2>
    <p>{t("Вставьте ссылку на аудиозапись Jamendo или Wikimedia Commons из карточки на Openverse. Luma сохранит запись без скачивания файла.")}</p>
    <form onSubmit={add} className="online-search-form">
      <input type="url" required maxLength={2048} aria-label={t("Ссылка на запись Openverse")} placeholder="https://openverse.org/audio/…" value={link} onChange={(event) => setLink(event.currentTarget.value)} />
      <button className="button outline-button" disabled={busy || disabled || !connected || !link.trim()} type="submit"><Link2 size={16} /> {busy ? t("Проверяем…") : t("Сохранить ссылку")}</button>
    </form>
    {failure && <p className="online-message error" role="alert">{message(failure.cause, t)}</p>}
  </section>;
}
