import type { Text } from '../i18n/text';
import { useText } from '../i18n/context';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, ChevronDown, HardDriveDownload, Cloud, CloudOff, Download, Globe2, Link2, ListPlus, Play, RotateCw, Search } from 'lucide-react';
import { connectionState, subscribeConnection } from '../data/diagnostics';
import { CATALOG_DEBOUNCE_MS, catalogQuery, catalogTargets, compareJamendo, mergeCatalogResults, searchCatalogs } from '../data/catalog-search';
import type { CatalogId, CatalogResult } from '../data/catalog-search';
import { CatalogError } from '../shared/catalog-reply';
import type { CatalogIssue } from '../shared/catalog-reply';
import { importOnlineTrack } from '../data/online';
import { useMusicServiceStatus } from '../data/music-services';
import { formatTime } from '../shared/media';
import type { Track } from '../shared/media';
import { bundleRecordings, recordingEvidence } from '../shared/recording-match';
import { AUDIUS_LEGAL, commonsMp3Export, ONLINE_SOURCES, PHISH_LEGAL, sessionCatalogId } from '../shared/online';
import type { OnlineCreditData, OnlineTrack } from '../shared/online';
import { phishSongQuery } from '../shared/phishin';
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

const catalogMessages: Record<CatalogIssue, string> = {
  network: 'Не удалось связаться с каталогом. Проверьте подключение и повторите попытку.',
  timeout: 'Каталог не ответил вовремя. Можно повторить поиск.',
  quota: 'Каталог временно ограничил запросы. Попробуйте позже.',
  unavailable: 'Сервис сейчас не может выполнить поиск. Попробуйте позже.',
  response: 'Каталог вернул неожиданный ответ.',
  credentials: 'Jamendo отклонил Client ID. Замените его в настройках сервисов.',
};
const catalogIssueLabel: Record<CatalogIssue, string> = {
  network: 'Нет связи', timeout: 'Тайм-аут', quota: 'Лимит запросов', unavailable: 'Недоступен', response: 'Ошибка ответа', credentials: 'Client ID отклонён',
};

function message(error: unknown, t: Text) {
  if (error instanceof CatalogError) return t(catalogMessages[error.issue]);
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

type SearchAttempt = { term: string; keep?: Partial<Record<CatalogId, CatalogResult>> };
type SearchSnapshot = { term: string; attempt?: SearchAttempt; results: Partial<Record<CatalogId, CatalogResult>> };

function OnlineResultActions({ track, saved, disabled, connected, choose }: {
  track: OnlineTrack; saved: ReadonlySet<string>; disabled: boolean; connected: boolean; choose(track: OnlineTrack, action: OnlineAction): void;
}) {
  const t = useText();
  return <div className="online-result-actions">
    <button type="button" className="icon-button" disabled={disabled || !connected} aria-label={t("Слушать онлайн: {0}", track.title)} title={t("Слушать онлайн")} onClick={() => choose(track, 'play')}><Play size={17} /></button>
    <button type="button" className="icon-button" disabled={disabled} aria-label={t("В очередь: {0}", track.title)} title={t("В очередь")} onClick={() => choose(track, 'queue')}><ListPlus size={17} /></button>
    {!sessionCatalogId(track.id) && <button type="button" className="icon-button" disabled={disabled || saved.has(track.id)} aria-label={saved.has(track.id) ? t("Сохранено: {0}", track.title) : t("Сохранить: {0}", track.title)} title={t("Сохранить ссылку в медиатеке")} onClick={() => choose(track, 'save')}>
      {saved.has(track.id) ? <Check size={17} /> : <BookmarkPlus size={17} />}
    </button>}
    {window.luma?.streamCache && commonsMp3Export(track) && <button type="button" className="icon-button" disabled={disabled || !connected} aria-label={t("В кэш: {0}", track.title)} title={t("Сохранить временную копию для офлайн-прослушивания")} onClick={() => choose(track, 'cache')}><HardDriveDownload size={17} /></button>}
    {window.luma && commonsMp3Export(track) && <button type="button" className="icon-button" disabled={disabled || !connected} aria-label={t("Скачать MP3: {0}", track.title)} title={t("Сохранить копию MP3")} onClick={() => choose(track, 'export')}><Download size={17} /></button>}
  </div>;
}

/** Both search surfaces share one policy and show each supported catalog as it finishes. */
export function OnlineSearch({ query, visible, autoCatalogSearch, changeAutoCatalogSearch, saved, disabled, choose, library, playLibrary, renderLibrary, remember, searchVk }: CatalogSearchPreferences & {
  query: string; visible: boolean; saved: ReadonlySet<string>; disabled: boolean; choose(track: OnlineTrack, action: OnlineAction): void;
  library: Track[]; playLibrary(id: string): void; renderLibrary(tracks: Track[]): ReactNode; remember(query: string): void; searchVk?(query: string): void;
}) {
  const t = useText();
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const foreground = useSyncExternalStore(subscribeVisibility, visibleDocument);
  const desktop = !!window.luma?.searchCommunity;
  const term = catalogQuery(query);
  const phish = Boolean(phishSongQuery(term));
  const directJamendo = useMusicServiceStatus('jamendo').status?.configured === true;
  const targets = useMemo(() => catalogTargets(desktop, phish, directJamendo), [desktop, phish, directJamendo]);
  const [manual, setManual] = useState<SearchAttempt>();
  const attempt = manual?.term === term ? manual : undefined;
  // A manual request (including a retry) never carries over to later input.
  if (manual && !attempt) setManual(undefined);
  const [snapshot, setSnapshot] = useState<SearchSnapshot>();
  const active = !!term && connected && visible && foreground && (autoCatalogSearch || !!attempt);
  const results = snapshot?.term === term && snapshot.attempt === attempt ? snapshot.results : attempt?.keep;
  const settled = targets.flatMap(({ id }) => results?.[id] ?? []);
  const indexed = results?.openverse, direct = results?.jamendo_direct;
  const comparison = directJamendo && direct && indexed && 'tracks' in direct && 'tracks' in indexed
    ? compareJamendo(indexed.tracks, direct.tracks) : undefined;
  const searching = active && settled.length < targets.length;
  const tracks = mergeCatalogResults(settled);
  const { bundles, bundledIds } = bundleRecordings(tracks, library.filter(({ online }) => !online));
  const onlineById = new Map(tracks.map((track) => [track.id, track]));
  const actions = (track: Track) => {
    const remote = onlineById.get(track.id);
    return remote ? <OnlineResultActions track={remote} saved={saved} disabled={disabled} connected={connected} choose={(item, action) => {
      remember(query); choose(item, action);
    }} /> : <button type="button" className="icon-button" disabled={disabled} onClick={() => { remember(query); playLibrary(track.id); }}
      aria-label={t('Воспроизвести файл: {0}', track.title)} title={t('Воспроизвести файл: {0}', track.title)}><Play size={17} /></button>;
  };
  const sourceName = (track: Track) => {
    const remote = onlineById.get(track.id);
    return remote ? ONLINE_SOURCES[remote.online.source] : t('Файл');
  };
  const credit = (track: Track) => {
    const remote = onlineById.get(track.id);
    return remote ? <OnlineCredit track={remote} /> : <span>{track.fileName ?? t('Файл')}</span>;
  };
  const incomplete = settled.filter((result) => 'error' in result || result.issue);
  const failures = incomplete.filter((result) => 'error' in result);

  useEffect(() => {
    if (!active) return;
    const request = new AbortController();
    const timeout = window.setTimeout(() => {
      setSnapshot({ term, attempt, results: attempt?.keep ?? {} });
      void searchCatalogs(term, targets.filter(({ id }) => !attempt?.keep?.[id]), request.signal, (result) => {
        setSnapshot((state) => state?.term === term && state.attempt === attempt
          ? { ...state, results: { ...state.results, [result.id]: result } } : state);
      });
    }, attempt ? 0 : CATALOG_DEBOUNCE_MS);
    return () => { window.clearTimeout(timeout); request.abort(); };
  }, [active, term, attempt, targets]);

  const canRequest = !!term && connected && visible && foreground && !searching;
  const searchLabel = t(autoCatalogSearch ? 'Повторить поиск' : 'Искать во всех каталогах');
  const SearchIcon = autoCatalogSearch ? RotateCw : Search;
  return <>{renderLibrary(library.filter(({ id }) => !bundledIds.has(id)))}<section className="online-panel catalog-search" aria-labelledby="online-title">
    <header className="catalog-header">
      <h2 id="online-title"><Globe2 size={17} aria-hidden="true" />{t('Онлайн-каталоги')}</h2>
      <div className="catalog-controls">
        <label className="catalog-toggle" title={t('Автоматический онлайн-поиск')}>
          <input type="checkbox" aria-label={t('Автоматический онлайн-поиск')} checked={autoCatalogSearch} onChange={(event) => {
            setSnapshot(undefined); setManual(undefined); changeAutoCatalogSearch(event.currentTarget.checked);
          }} />{t('Автопоиск')}
        </label>
        {(!autoCatalogSearch || incomplete.length > 0) && <button className="icon-button catalog-request" type="button" disabled={!canRequest}
          aria-label={searchLabel} title={searchLabel} onClick={() => {
            remember(query);
            const keep = incomplete.length ? Object.fromEntries(settled.filter((result) => !('error' in result) && !result.issue).map((result) => [result.id, result])) : undefined;
            setManual({ term, keep });
          }}><SearchIcon size={16} aria-hidden="true" /></button>}
      </div>
    </header>
    <details className="catalog-details">
      <summary><ChevronDown size={13} aria-hidden="true" />{t('Источники')}
        {!!incomplete.length && <span className="catalog-failure-count">{t('Не завершили: {0}', incomplete.length)}</span>}
      </summary>
      <ul className="catalog-sources" aria-label={t('Статус каталогов')}>
        {targets.map(({ id, name }) => {
          const row = results?.[id];
          const error = row && 'error' in row ? row.error : undefined;
          const issue = error instanceof CatalogError ? error.issue : row && 'tracks' in row ? row.issue : undefined;
          const status = error ? t(issue ? catalogIssueLabel[issue] : 'Не ответил') : row && 'tracks' in row
            ? t(issue ? 'Часть результатов: {0}' : row.tracks.length ? 'Записей: {0}' : 'Нет совпадений', row.tracks.length) : searching ? t('Ищем…') : null;
          return <li key={id} data-catalog={id} data-state={error ? 'error' : issue ? 'partial' : row ? 'done' : searching ? 'loading' : 'idle'}>
            <strong>{t(name)}</strong>{status && <span>{status}</span>}
            {issue ? <small>{t(catalogMessages[issue])}</small> : !!error && <small>{message(error, t)}</small>}
          </li>;
        })}
      </ul>
      {comparison && <p className="catalog-privacy" data-jamendo-comparison>{t('Jamendo напрямую: {0} дополнительных записей · {1} совпали с выдачей Openverse.', comparison.additional, comparison.matches)}</p>}
      {directJamendo && <p className="catalog-privacy">{t('Прямой Jamendo: воспроизведение и очередь только в текущей сессии.')}</p>}
      <p className="catalog-privacy">{t(desktop ? 'При поиске каталоги получают только текущий запрос.'
        : 'В веб-версии доступны Openverse и концертный архив Phish.in.')}</p>
      <p className="catalog-privacy">{t('Закладка сохраняет ссылку, а не аудиофайл.')}</p>
      <p className="catalog-privacy">{t('Для концертов Phish.in введите Phish и точное название песни, например Phish Llama.')}{' · '}
        <SourceLink url={PHISH_LEGAL.terms}>{t('Условия Phish.in')}</SourceLink></p>
      {desktop && <p className="catalog-privacy"><SourceLink url={AUDIUS_LEGAL.terms}>{t('Условия API Audius')}</SourceLink>
        {' · '}<SourceLink url={AUDIUS_LEGAL.privacy}>{t('Конфиденциальность Audius')}</SourceLink></p>}
    </details>
    {!!term && searchVk && <div className="catalog-vk-handoff">
      <p>{t('Открытые каталоги не охватывают весь музыкальный каталог. Эту фразу можно отдельно поискать на сайте VK.')}</p>
      <button type="button" className="button outline-button" data-catalog-vk disabled={!connected || !visible} onClick={() => { remember(query); searchVk(term); }}>
        {t('Искать в VK Музыке')} <ArrowUpRight size={15} aria-hidden="true" />
      </button>
    </div>}
    {!connected && <p className="online-offline" role="status"><CloudOff size={17} />{' '}{t('Устройство вне сети. Онлайн-поиск пока недоступен.')}</p>}
    {!term && !!query.trim() && <p className="online-message">{t('Введите не менее двух символов, чтобы искать треки.')}</p>}
    {searching && !settled.length && <p className="online-message" role="status">{t('Ищем записи в каталогах…')}</p>}
    {!!settled.length && <p className="online-message" role="status">{bundles.length ? t('Доступно записей: {0}', bundles.length)
      : searching ? t('Ждём ответы других каталогов…') : failures.length === targets.length ? t('Ни один каталог не ответил.')
        : t('В ответивших каталогах нет подходящих записей.')}</p>}
    {bundles.length > 0 && <ul className="online-results">
      {bundles.map(([track, ...alternatives]) => <li key={track.id} data-source={track.online?.source ?? 'file'}>
        <Artwork track={track} />
        <div className="online-result-copy"><strong title={track.title}>{track.title}</strong><span>{track.artist}{track.duration > 0 ? ` · ${formatTime(track.duration)}` : ''}</span>
          {track.online?.source === 'phishin' && <span>{track.album}</span>}
          {credit(track)}</div>
        {actions(track)}
        {alternatives.length > 0 && <details className="recording-sources">
          <summary><span>{t(alternatives.every((other) => recordingEvidence(track, other) === 'verified') ? 'Другие источники' : 'Похожие записи · проверьте версию')}</span>
            {[...new Set([track, ...alternatives].map(sourceName))].map((name) => <small key={name}>{name}</small>)}
          </summary>
          <ul>{alternatives.map((other) => <li key={other.id} data-source={other.online?.source ?? 'file'}>
            <div className="online-result-copy"><span>{[other.album, other.duration > 0 && formatTime(other.duration)].filter(Boolean).join(' · ')}</span>{credit(other)}</div>{actions(other)}
          </li>)}</ul>
        </details>}
      </li>)}
    </ul>}
  </section></>;
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
