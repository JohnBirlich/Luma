import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Check, Pause, Play, Plus, Radio } from 'lucide-react';
import { useText } from '../i18n/context';
import { RADIO_GENRES, STATIONS } from '../shared/radio';
import type { Station } from '../shared/radio';
import { SourceLink } from './OnlineMusic';

function StationLogo({ station }: { station: Station }) {
  const [failed, setFailed] = useState(false);
  return <div className="station-logo" aria-hidden="true">{failed ? <Radio size={26} /> :
    <img src={station.logo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />}</div>;
}

export function RadioStations({ saved, activeId, playing, loading, connected, busy, toggleSave, play }: {
  saved: ReadonlySet<string>; activeId: string | null; playing: boolean; loading: boolean; connected: boolean; busy: boolean;
  toggleSave(id: string): void; play(id: string, toggle?: boolean): void;
}) {
  const t = useText();
  const [genre, setGenre] = useState<keyof typeof RADIO_GENRES>('all');
  const added = STATIONS.filter(({ id }) => saved.has(id));
  const filtered = genre === 'all' ? STATIONS : STATIONS.filter((station) => station.genre === genre);
  function tiles(stations: readonly Station[]) {
    return <ul className="station-grid">{stations.map((station) => {
      const active = station.id === activeId;
      const connecting = active && loading, onAir = active && playing && !loading, stop = connecting || onAir;
      const isSaved = saved.has(station.id);
      return <li key={station.id} className="station-tile" data-active={active || undefined} style={{ '--station-tint': station.tint } as CSSProperties}>
        <div className="station-top">
          <StationLogo station={station} />
          <button type="button" className="icon-button station-add" aria-pressed={isSaved} onClick={() => toggleSave(station.id)}
            aria-label={t(isSaved ? 'Убрать станцию {0}' : 'Добавить станцию {0}', station.name)} title={t(isSaved ? 'Убрать из добавленных' : 'В добавленные')}>
            {isSaved ? <Check size={16} /> : <Plus size={16} />}
          </button>
        </div>
        <h3>{station.name}</h3>
        <p>{station.broadcaster} · {t(RADIO_GENRES[station.genre])}</p>
        <div className="station-bottom">
          <button type="button" className="icon-button station-play" onClick={() => play(station.id, true)} disabled={busy || (!connected && !stop)}
            aria-label={t(stop ? 'Остановить эфир: {0}' : 'Слушать станцию: {0}', station.name)} title={t(stop ? 'Остановить эфир' : 'Слушать эфир')}>
            {stop ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <span className="station-state" role={active ? 'status' : undefined}>{t(connecting ? 'Подключение…' : onAir ? 'В эфире' : 'Эфир')}</span>
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
    <section className="hub-shelf" aria-labelledby="radio-stations"><header className="hub-shelf-head"><h2 id="radio-stations">{t('Радиостанции')}</h2></header>
      <p>{t('Прямые эфиры вещателей. Без перемотки и скачивания. Доступность зависит от сети и станции.')}</p>
      {!connected && <p className="online-offline" role="status">{t('Для эфира нужно подключение к интернету.')}</p>}
      <div className="hub-chips" role="group" aria-label={t('Жанры радио')}>
        {(Object.entries(RADIO_GENRES) as [keyof typeof RADIO_GENRES, string][]).map(([id, name]) =>
          <button type="button" key={id} aria-pressed={genre === id} onClick={() => setGenre(id)}>{t(name)}</button>)}
      </div>
      {tiles(filtered)}
    </section>
  </div>;
}
