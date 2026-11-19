import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AudioLines, ExternalLink, FileSearch } from 'lucide-react';
import { connectionState, subscribeConnection } from '../data/diagnostics';
import { canFingerprint, lookupBySound, lookupByTitle } from '../data/recognition';
import { formatTime } from '../shared/media';
import type { Track } from '../shared/media';
import { metadataQueries } from '../shared/recognition';
import type { MetadataCandidate } from '../shared/recognition';
import { musicSearchKey } from '../shared/russian';

type Method = 'title' | 'sound';
export function MetadataLookup({ track, artistHint, locale, select }: {
  track: Track; locale: string; artistHint: string; select(candidate: MetadataCandidate, titleOnly: boolean): void;
}) {
  const [query, setQuery] = useState(track.title.slice(0, 160));
  const [method, setMethod] = useState<Method>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<MetadataCandidate[]>();
  const [status, setStatus] = useState('');
  const pending = useRef<AbortController | undefined>(undefined);
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  useEffect(() => {
    let ignored = false;
    void window.luma?.recognition.hasAcoustid().then((enabled) => { if (!ignored) setReady(enabled); }, () => {});
    return () => { ignored = true; pending.current?.abort(); };
  }, []);

  async function search(type: Method) {
    if (pending.current || !connected || (type === 'sound' ? !ready || !canFingerprint(track) : !metadataQueries(query).length)) return;
    const controller = pending.current = new AbortController();
    setMethod(type); setError(''); setStatus(''); setCandidates(undefined);
    try {
      const result = await (type === 'title' ? lookupByTitle(track, query, artistHint, locale, controller.signal) : lookupBySound(track, controller.signal));
      if (!controller.signal.aborted) setCandidates(result);
    } catch {
      if (!controller.signal.aborted) setError(type === 'title' ? 'Не удалось получить данные Apple Music. Проверьте сеть или попробуйте позже.'
        : 'Не удалось распознать файл. Проверьте настройки AcoustID или попробуйте поиск по названию.');
    } finally {
      if (pending.current === controller) { pending.current = undefined; setMethod(undefined); }
    }
  }

  function apply(candidate: MetadataCandidate, titleOnly: boolean) {
    select(candidate, titleOnly);
    setStatus(titleOnly ? 'Название вставлено. Нажмите «Сохранить», если всё верно.' : 'Данные вставлены. Проверьте исполнителя и нажмите «Сохранить».');
  }

  return <details className="metadata-lookup">
    <summary><FileSearch size={17} /> Найти данные записи</summary>
    <div className="metadata-lookup-body">
      <p>Apple Music подбирает версии по названию и пробует кириллицу. Это поиск по тексту, не подтверждение исполнителя.</p>
      <div className="metadata-search-controls">
        <input type="search" aria-label="Название для поиска в Apple Music" maxLength={160} value={query} disabled={Boolean(method)} onChange={(event) => {
          setQuery(event.currentTarget.value); setCandidates(undefined); setStatus(''); setError('');
        }} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void search('title'); }
        }} />
        <button className="button outline-button" type="button" disabled={Boolean(method) || !connected || !metadataQueries(query).length} onClick={() => void search('title')}>
          {method === 'title' ? 'Ищем…' : 'По названию'}
        </button>
      </div>
      {ready && canFingerprint(track) && <div className="metadata-sound">
        <button className="button outline-button" type="button" disabled={Boolean(method) || !connected} onClick={() => void search('sound')}><AudioLines size={16} />
          {method === 'sound' ? 'Сравниваем…' : 'По звуку'}
        </button>
        <small>AcoustID получит только отпечаток и длительность, не сам файл.</small>
      </div>}
      {window.luma && !ready && <small>Для поиска по звуку нужен настроенный AcoustID. Поиск по названию работает без ключа.</small>}
      {!connected && <p role="status">Для сравнения с каталогом нужна сеть.</p>}
      {error && <p className="online-message error" role="alert">{error}</p>}
      {candidates && !candidates.length && <p role="status">Совпадений нет. Уточните название или найдите другую версию.</p>}
      {candidates && candidates.length > 0 && <ul className="metadata-results" aria-label="Возможные версии записи">
        {candidates.map((candidate) => {
          const otherArtist = artistHint && artistHint !== 'Неизвестный исполнитель' && musicSearchKey(artistHint) !== musicSearchKey(candidate.artist);
          return <li key={candidate.page}>
            <div className="metadata-recording"><strong>{candidate.title}</strong><span>{candidate.artist}{candidate.duration ? ` · ${formatTime(candidate.duration)}` : ''}</span>
              <small>{candidate.album || (candidate.score !== undefined && `Оценка AcoustID: ${Math.round(candidate.score * 100)} / 100`)}{otherArtist && ' · Отличается от тега исполнителя'}</small>
            </div>
            <div className="metadata-result-actions">
              <button className="text-button" type="button" onClick={() => apply(candidate, true)}>Только название</button>
              <button className="text-button" type="button" onClick={() => apply(candidate, false)}>Вставить данные</button>
              <a className="text-button" href={candidate.page} target="_blank" rel="noopener noreferrer" onClick={(event) => {
                if (!window.luma) return;
                event.preventDefault();
                void window.luma.recognition.openSource(candidate.page).catch(() => setStatus('Не удалось открыть страницу источника.'));
              }}>{candidate.source === 'apple' ? 'Apple Music' : 'MusicBrainz'} <ExternalLink size={12} /></a>
            </div>
          </li>;
        })}
      </ul>}
      <p className="metadata-status" role="status">{status}</p>
    </div>
  </details>;
}
