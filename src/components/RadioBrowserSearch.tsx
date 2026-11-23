import { useMemo, useState } from 'react';
import { ArrowUpRight, Pause, Play, Search } from 'lucide-react';
import { useText } from '../i18n/context';
import { readRadioBrowserQuery } from '../shared/radio-browser';
import type { RadioBrowserQuery, RadioBrowserStation } from '../shared/radio-browser';
import { radioStationCover } from '../shared/radio-artwork';
import { Artwork } from './Artwork';
import { SourceLink } from './OnlineMusic';

const empty: RadioBrowserQuery = { name: '', country: '', language: '', genre: '' };
const fields = [
  ['name', 'Название станции', 'Например, SomaFM', 80], ['country', 'Код страны', 'Например, DE', 2],
  ['language', 'Язык эфира', 'Например, german', 32], ['genre', 'Жанр или тег', 'Например, jazz', 32],
] as const;

export function RadioBrowserSearch({ activeId, playing, loading, connected, busy, play }: {
  activeId: string | null; playing: boolean; loading: boolean; connected: boolean; busy: boolean;
  play(station: RadioBrowserStation): void;
}) {
  const t = useText();
  const bridge = window.luma?.radioBrowser;
  const [query, setQuery] = useState(empty);
  const [stations, setStations] = useState<RadioBrowserStation[]>();
  const covers = useMemo(() => new Map(stations?.map(({ id, name }) => [id, radioStationCover(id, name)])), [stations]);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(false);
  const filters = readRadioBrowserQuery(query);
  if (!bridge) return <p className="hub-note">{t('Поиск станций Radio Browser доступен в настольной Luma.')}</p>;
  return <div className="radio-browser-panel">
    <p className="hub-note">{t('Заполняйте только нужные поля. Для поиска отправляются эти фильтры, а при запуске из результатов — ID станции. Записи эфира нет.')}</p>
    <form className="radio-browser-form" onSubmit={(event) => {
      event.preventDefault();
      if (!filters || waiting || !connected) return;
      setWaiting(true); setError(false); setStations(undefined);
      void bridge.search(filters).then(setStations).catch(() => setError(true)).finally(() => setWaiting(false));
    }}>
      {fields.map(([key, label, hint, maxLength]) => <label key={key}>{t(label)}
        <input type={key === 'name' ? 'search' : 'text'} value={query[key]} maxLength={maxLength} placeholder={t(hint)} disabled={waiting}
          pattern={key === 'country' ? '[A-Za-z]{2}' : undefined} autoComplete="off" spellCheck={false}
          onChange={(event) => { setStations(undefined); setError(false); setQuery({ ...query, [key]: event.currentTarget.value }); }} />
      </label>)}
      <button type="submit" className="button primary-button" disabled={!filters || waiting || !connected}><Search size={16} />{t(waiting ? 'Ищем…' : 'Найти станции')}</button>
    </form>
    {!connected && <p className="online-offline" role="status">{t('Для эфира нужно подключение к интернету.')}</p>}
    {error && <p className="hub-error" role="alert">{t('Radio Browser сейчас недоступен. Попробуйте позже.')}</p>}
    {stations && <p className="hub-note" role="status">{t(stations.length ? 'Найдено станций: {0}' : 'По этому запросу нет станций.', stations.length)}</p>}
    {stations && stations.length > 0 && <ul className="station-grid" aria-label="Radio Browser">{stations.map((station) => {
      const active = activeId === station.id;
      const connecting = active && loading, onAir = active && playing && !loading, stop = connecting || onAir;
      return <li key={station.id} data-station={station.id} data-active={active || undefined} data-mode={station.stream ? 'native' : 'browser'} className="station-tile radio-browser-tile">
        <div className="station-top"><Artwork className="station-logo" imageUrl={covers.get(station.id)} lazy /></div>
        <h3>{station.name}</h3><p>{[station.country, station.language, station.genre].filter(Boolean).join(' · ')}</p>
        {station.codec && <p>{station.codec}{station.bitrate ? ` · ${t('{0} кбит/с', station.bitrate)}` : ''}</p>}
        <div className="station-bottom">
          {station.stream && <button type="button" className="icon-button station-play" disabled={busy || (!connected && !stop)} onClick={() => play(station)}
            aria-label={t(stop ? 'Остановить эфир: {0}' : 'Слушать станцию: {0}', station.name)}>{stop ? <Pause size={16} /> : <Play size={16} />}</button>}
          <span className="station-state">{t(connecting ? 'Подключение…' : onAir ? 'В эфире' : station.stream ? 'В Luma' : 'В браузере')}</span>
          <SourceLink className="station-link" url={station.page} label={t('Открыть станцию в Radio Browser: {0}', station.name)}><ArrowUpRight size={16} /></SourceLink>
        </div>
      </li>;
    })}</ul>}
    <p className="hub-note">{t('Luma открывает только совместимые HTTPS-эфиры известных вещателей. Для остальных станций есть кнопка открытия в браузере.')}</p>
  </div>;
}
