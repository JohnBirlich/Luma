import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Check, Pause, Play, Plus, Radio, Search, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { EXTRA_STATIONS, RADIO_DIRECTORY, RADIO_GENRES, RADIO_LISTINGS } from '../shared/radio';
import type { RadioListing } from '../shared/radio';
import { musicSearchKey } from '../shared/russian';
import { SourceLink } from './OnlineMusic';
import { RadioBrowserSearch } from './RadioBrowserSearch';
import type { RadioBrowserStation } from '../shared/radio-browser';

function StationLogo({ station }: { station: RadioListing }) {
  const [failed, setFailed] = useState(false);
  return <div className="station-logo" aria-hidden="true">{!station.logo || failed ? <Radio size={26} /> :
    <img src={station.logo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />}</div>;
}

const modes = { all: 'Любой способ', native: 'В Luma', browser: 'В браузере' } as const;
const searchable = (text: string) => musicSearchKey(text).replace(/[-–—]+/g, ' ');
const nativeCount = RADIO_DIRECTORY.filter(({ stream }) => stream).length;

export function RadioStations({ saved, activeId, playing, loading, connected, busy, toggleSave, play, tuneDiscovered }: {
  saved: ReadonlySet<string>; activeId: string | null; playing: boolean; loading: boolean; connected: boolean; busy: boolean;
  toggleSave(id: string): void; play(id: string, toggle?: boolean): void; tuneDiscovered(station: RadioBrowserStation): void;
}) {
  const t = useText();
  const [scope, setScope] = useState<'directory' | 'saved' | 'browser'>('directory');
  const [genre, setGenre] = useState<keyof typeof RADIO_GENRES>('all');
  const [mode, setMode] = useState<keyof typeof modes>('all');
  const [query, setQuery] = useState('');
  const terms = searchable(query).split(' ').filter(Boolean);
  const added = RADIO_LISTINGS.filter(({ id }) => saved.has(id));
  const savedOnly = scope === 'saved';
  const remote = scope === 'browser';
  function matches(station: RadioListing) {
    return (genre === 'all' || station.genre === genre) && (mode === 'all' || (mode === 'native') === Boolean(station.stream))
      && terms.every((term) => searchable(station.name).includes(term));
  }
  const stations = (savedOnly ? added : RADIO_DIRECTORY).filter(matches);
  const extras = savedOnly ? [] : EXTRA_STATIONS.filter(matches);
  const heading = remote ? 'radio-browser-title' : savedOnly ? 'radio-added' : 'radio-stations';

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
    <section className="hub-shelf" aria-labelledby={heading}>
      <header className="hub-shelf-head"><div><h2 id={heading}>{t(remote ? 'Поиск станций · Radio Browser' : savedOnly ? 'Добавленные' : 'Радиостанции')}</h2>
        {scope === 'directory' && <p>{t('{0} в Luma · {1} в браузере', nativeCount, RADIO_DIRECTORY.length - nativeCount)}</p>}</div>
        {!remote && <span className="hub-badge">{savedOnly ? added.length : RADIO_DIRECTORY.length}</span>}
      </header>
      <div className="radio-views" role="group" aria-label={t('Списки радиостанций')}>
        <button type="button" data-radio-view="directory" aria-pressed={scope === 'directory'} onClick={() => setScope('directory')}>{t('Все станции')}</button>
        <button type="button" data-radio-view="saved" aria-pressed={savedOnly} onClick={() => setScope('saved')}>{t('Добавленные')} <span>{added.length}</span></button>
        <button type="button" data-radio-view="browser" aria-pressed={remote} onClick={() => setScope('browser')}>{t('Поиск станций')}</button>
      </div>
      {remote ? <RadioBrowserSearch activeId={activeId} playing={playing} loading={loading} connected={connected} busy={busy} play={tuneDiscovered} /> : <>
        <p className="hub-note">{t('Кнопки «Предыдущая» и «Следующая» в плеере переключают прямые эфиры по порядку каталога. Сами эфиры не перематываются.')}</p>
        {!connected && <p className="online-offline" role="status">{t('Для эфира нужно подключение к интернету.')}</p>}
        <div className="radio-controls">
          <div className="radio-search library-search"><Search size={16} aria-hidden="true" /><input type="search" value={query} maxLength={120}
            aria-label={t('Найти радиостанцию')} placeholder={t('Найти радиостанцию')} onChange={(event) => setQuery(event.currentTarget.value)} />
            {query && <button className="icon-button" type="button" aria-label={t('Очистить поиск')} onClick={() => setQuery('')}><X size={15} /></button>}</div>
          <select aria-label={t('Где слушать')} value={mode} onChange={(event) => setMode(event.currentTarget.value as keyof typeof modes)}>
            {Object.entries(modes).map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}
          </select>
          <select aria-label={t('Жанры радио')} value={genre} onChange={(event) => setGenre(event.currentTarget.value as keyof typeof RADIO_GENRES)}>
            {Object.entries(RADIO_GENRES).map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}
          </select>
        </div>
        {stations.length > 0 && tiles(stations)}
        {extras.length > 0 && <div className="station-extras"><h3>{t('Каналы Record и SomaFM')}</h3>{tiles(extras)}</div>}
        {!stations.length && !extras.length && <p className="hub-note" role="status">{t(savedOnly && !added.length
          ? 'Нажмите «+» на карточке станции, чтобы она появилась здесь.' : 'По этому запросу нет станций.')}</p>}
      </>}
    </section>
  </div>;
}
