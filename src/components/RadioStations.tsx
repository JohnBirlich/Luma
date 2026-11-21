import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Check, Pause, Play, Plus, Radio, Search, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { EXTRA_STATIONS, RADIO_DIRECTORY, RADIO_GENRES, RADIO_LISTINGS } from '../shared/radio';
import type { RadioListing } from '../shared/radio';
import { musicSearchKey } from '../shared/russian';
import { SourceLink } from './OnlineMusic';

function StationLogo({ station }: { station: RadioListing }) {
  const [failed, setFailed] = useState(false);
  return <div className="station-logo" aria-hidden="true">{!station.logo || failed ? <Radio size={26} /> :
    <img src={station.logo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />}</div>;
}

const modes = { all: 'Все станции', native: 'В Luma', browser: 'В браузере' } as const;
const searchable = (text: string) => musicSearchKey(text).replace(/[-–—]+/g, ' ');
const nativeCount = RADIO_DIRECTORY.filter(({ stream }) => stream).length;

export function RadioStations({ saved, activeId, playing, loading, connected, busy, toggleSave, play }: {
  saved: ReadonlySet<string>; activeId: string | null; playing: boolean; loading: boolean; connected: boolean; busy: boolean;
  toggleSave(id: string): void; play(id: string, toggle?: boolean): void;
}) {
  const t = useText();
  const [genre, setGenre] = useState<keyof typeof RADIO_GENRES>('all');
  const [mode, setMode] = useState<keyof typeof modes>('all');
  const [query, setQuery] = useState('');
  const terms = searchable(query).split(' ').filter(Boolean);
  const added = RADIO_LISTINGS.filter(({ id }) => saved.has(id));
  function matches(station: RadioListing) {
    return (genre === 'all' || station.genre === genre) && (mode === 'all' || (mode === 'native') === Boolean(station.stream))
      && terms.every((term) => searchable(station.name).includes(term));
  }
  const directory = RADIO_DIRECTORY.filter(matches);
  const extras = EXTRA_STATIONS.filter(matches);

  function tiles(stations: readonly RadioListing[]) {
    return <ul className="station-grid">{stations.map((station) => {
      const active = station.id === activeId;
      const connecting = active && loading, onAir = active && playing && !loading, stop = connecting || onAir;
      const isSaved = saved.has(station.id);
      return <li key={station.id} data-station={station.id} className="station-tile" data-active={active || undefined} data-mode={station.stream ? 'native' : 'browser'}
        style={{ '--station-tint': station.tint } as CSSProperties}>
        <div className="station-top">
          <StationLogo station={station} />
          <button type="button" className="icon-button station-add" aria-pressed={isSaved} onClick={() => toggleSave(station.id)}
            aria-label={t(isSaved ? 'Убрать станцию {0}' : 'Добавить станцию {0}', station.name)} title={t(isSaved ? 'Убрать из добавленных' : 'В добавленные')}>
            {isSaved ? <Check size={16} /> : <Plus size={16} />}
          </button>
        </div>
        <h3>{station.name}</h3>
        <p>{station.broadcaster && `${station.broadcaster} · `}{t(RADIO_GENRES[station.genre])}</p>
        <div className="station-bottom">
          {station.stream && <button type="button" className="icon-button station-play" onClick={() => play(station.id, true)} disabled={busy || (!connected && !stop)}
            aria-label={t(stop ? 'Остановить эфир: {0}' : 'Слушать станцию: {0}', station.name)} title={t(stop ? 'Остановить эфир' : 'Слушать эфир')}>
            {stop ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>}
          <span className="station-state" role={active ? 'status' : undefined}>{t(connecting ? 'Подключение…' : onAir ? 'В эфире' : station.stream ? 'В Luma' : 'В браузере')}</span>
          <SourceLink className="station-link" url={station.page} label={t('Открыть сайт станции {0}', station.name)}><ArrowUpRight size={16} /></SourceLink>
        </div>
      </li>;
    })}</ul>;
  }
  return <div className="radio-shelves">
    <section className="hub-shelf" aria-labelledby="radio-added"><header className="hub-shelf-head"><h2 id="radio-added"><Radio size={18} />{t('Добавленные')}</h2>
      <span className="hub-badge">{added.length}</span></header>
      {added.length ? tiles(added) : <p>{t('Нажмите «+» на карточке станции, чтобы она появилась здесь.')}</p>}
    </section>
    <section className="hub-shelf" aria-labelledby="radio-stations"><header className="hub-shelf-head"><div><h2 id="radio-stations">{t('Радиостанции')}</h2>
      <p>{t('{0} в Luma · {1} в браузере', nativeCount, RADIO_DIRECTORY.length - nativeCount)}</p></div><span className="hub-badge">{RADIO_DIRECTORY.length}</span></header>
      <p>{t('Прямые эфиры вещателей. Без перемотки и скачивания. Доступность зависит от сети и станции.')}</p>
      {!connected && <p className="online-offline" role="status">{t('Для эфира нужно подключение к интернету.')}</p>}
      <div className="radio-search library-search"><Search size={16} aria-hidden="true" /><input type="search" value={query} maxLength={120}
        aria-label={t('Найти радиостанцию')} placeholder={t('Найти радиостанцию')} onChange={(event) => setQuery(event.currentTarget.value)} />
        {query && <button className="icon-button" type="button" aria-label={t('Очистить поиск')} onClick={() => setQuery('')}><X size={15} /></button>}</div>
      <div className="hub-chips" role="group" aria-label={t('Где слушать')}>
        {(Object.keys(modes) as (keyof typeof modes)[]).map((id) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{t(modes[id])}</button>)}
      </div>
      <div className="hub-chips" role="group" aria-label={t('Жанры радио')}>
        {(Object.keys(RADIO_GENRES) as (keyof typeof RADIO_GENRES)[]).map((id) =>
          <button type="button" key={id} aria-pressed={genre === id} onClick={() => setGenre(id)}>{t(RADIO_GENRES[id])}</button>)}
      </div>
      {directory.length > 0 && tiles(directory)}
      {extras.length > 0 && <div className="station-extras"><h3>{t('Каналы Record и SomaFM')}</h3>{tiles(extras)}</div>}
      {!directory.length && !extras.length && <p role="status">{t('По этому запросу нет станций.')}</p>}
    </section>
  </div>;
}
