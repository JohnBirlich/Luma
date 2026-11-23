import { useState } from 'react';
import { ArrowUpRight, FileText, Search } from 'lucide-react';
import { providerError, useMusicServiceStatus } from '../data/music-services';
import { useText } from '../i18n/context';
import type { GeniusAnnotation, GeniusSong } from '../shared/genius';
import { serviceQuery } from '../shared/music-services';
import { SourceLink } from './OnlineMusic';

const errors = ['Добавьте токен Genius в настройках.', 'Genius не принял токен. Проверьте настройки.', 'Ответ Genius не удалось прочитать.'];
const unavailable = 'Genius сейчас недоступен. Повторите попытку позже.';

export function GeniusLookup({ title, artist }: { title: string; artist: string }) {
  const t = useText();
  const { bridge, status } = useMusicServiceStatus('genius');
  const query = serviceQuery(`${artist.slice(0, 58)} ${title.slice(0, 81)}`.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ query: string; songs: GeniusSong[] }>();
  const [selected, setSelected] = useState<{ song: GeniusSong; annotations: GeniusAnnotation[] }>();
  if (!bridge) return null;
  const songs = status?.configured && result?.query === query ? result?.songs : undefined;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (reason) { setError(providerError(reason, errors, unavailable)); }
    finally { setBusy(false); }
  }
  return <details className="metadata-lookup genius-lookup">
    <summary><FileText size={17} />{' '}{t('О песне · Genius')}</summary>
    <div className="metadata-lookup-body">
      <p className="metadata-status">{t('Отправляются только название и исполнитель. Аннотации не используются как текст песни.')}</p>
      {status?.configured ? <button type="button" className="button outline-button" disabled={!query || busy} onClick={() => {
        if (!query) return;
        setResult(undefined); setSelected(undefined);
        void run(async () => setResult({ query, songs: await bridge.searchGenius(query) }));
      }}><Search size={15} />{t('Найти песню в Genius')}</button>
        : <p className="metadata-status" role="status">{t(status ? 'Добавьте токен Genius в настройках.' : 'Проверяем…')}</p>}
      {busy && <p className="metadata-status" role="status">{t('Ищем…')}</p>}
      {songs && !songs.length && <p className="metadata-status" role="status">{t('В Genius нет подходящих результатов.')}</p>}
      {songs && songs.length > 0 && <ul className="metadata-results">
        {songs.map((song) => <li key={song.id} className="genius-result">
          <div><strong>{song.title}</strong><small>{song.artist}</small></div>
          <div className="genius-actions"><button type="button" className="button outline-button" disabled={busy} onClick={() => {
            setSelected(undefined);
            void run(async () => setSelected({ song, annotations: await bridge.geniusAnnotations(song.id) }));
          }}>{t('Показать аннотации')}</button>
            <SourceLink url={song.page}>{t('Открыть в Genius')} <ArrowUpRight size={13} /></SourceLink></div>
        </li>)}
      </ul>}
      {songs && selected && <section className="genius-excerpts" aria-label={t('Аннотации Genius')}>
        <strong>{selected.song.title} · {t('Аннотации Genius')}</strong>
        {selected.annotations.length ? <ul>{selected.annotations.map(({ id, excerpt }) => <li key={id}>{excerpt}</li>)}</ul>
          : <p className="metadata-status">{t('Для этой песни нет доступных аннотаций.')}</p>}
        <SourceLink url={selected.song.page}>{t('Читать на Genius')} <ArrowUpRight size={13} /></SourceLink>
      </section>}
      {error && <p className="lastfm-issue" role="alert">{t(error)}</p>}
    </div>
  </details>;
}
