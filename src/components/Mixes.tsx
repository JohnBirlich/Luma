import { useText } from '../i18n/context';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, AudioLines, ListPlus, Play, RotateCw, Shuffle, Sparkles } from 'lucide-react';
import { formatCount } from '../shared/customization';
import { connectionState, subscribeConnection } from '../data/diagnostics';
import { formatTime, trackCount } from '../shared/media';
import type { Track } from '../shared/media';
import { makeMix, musicGroups, shuffledMix } from '../shared/mix';
import type { GroupFilter, MixType } from '../shared/mix';
import { Artwork } from './Artwork';
import { OnlineCredit } from './OnlineMusic';

const TYPES = {
  library: { name: 'Моя музыка', detail: 'Избранное и недавно прослушанное чаще попадают в подборку.' },
  favorites: { name: 'Избранное', detail: 'Только треки, отмеченные сердцем.' },
  recent: { name: 'Недавно слушали', detail: 'Микс из недавних прослушиваний в Luma.' },
} as const;

export function MixesPage({ tracks, favorites, favoriteTracks, disliked, recent, currentId, playing, fullNumbers, playAll, addMix, goToLibrary }: {
  tracks: Track[]; favorites: ReadonlySet<string>; favoriteTracks: Track[]; disliked: ReadonlySet<string>; recent: Track[]; currentId: string | null; playing: boolean; fullNumbers: boolean;
  playAll(items: Track[], start?: string): void; addMix(items: Track[]): void; goToLibrary(): void;
}) {
  const t = useText();
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const [type, setType] = useState<MixType>('library');
  const [group, setGroup] = useState<GroupFilter>();
  const [offline, setOffline] = useState(false);
  const [seed, setSeed] = useState(() => Date.now());
  // Keep the playlist stable while tracks in it are playing. Refresh picks up new history.
  const [history, setHistory] = useState(recent);
  const currentHistory = useMemo(() => {
    const byId = new Map(recent.map((track) => [track.id, track]));
    return history.flatMap(({ id }) => byId.get(id) ?? []);
  }, [history, recent]);
  const pool = type === 'favorites' ? favoriteTracks : tracks;
  const source = type === 'recent' ? currentHistory : pool;
  const groups = useMemo(() => {
    const pool = source.filter(({ id, online }) => !disliked.has(id) && (!(offline || !connected) || !online));
    return { artist: musicGroups(pool, 'artist', 6), genre: musicGroups(pool, 'genre', 6) };
  }, [source, connected, offline, disliked]);
  const selected = group && group.kind !== 'album' ? groups[group.kind].find(({ id }) => id === group.id) : undefined;
  const items = useMemo(() => makeMix(pool, { type, favorites, disliked, recent: currentHistory, group: selected ? group : undefined, offline: offline || !connected, seed }),
    [pool, type, favorites, disliked, currentHistory, selected, group, connected, offline, seed]);
  const name = selected ? t("Микс: {0}", selected.label) : type === 'library' ? t("Микс по моей музыке") : t("Микс: {0}", t(TYPES[type].name));
  const refresh = () => { setHistory(recent); setSeed((previous) => previous + 31337); };

  return <div className="page mixes-page">
    <header className="page-header"><button type="button" className="icon-button hub-back" onClick={goToLibrary}
      aria-label={t("В медиатеку")} title={t("В медиатеку")}><ArrowLeft size={18} /></button>
      <div><p className="overline page-kicker"><span />{t("Коллекция Luma")}</p><h1>{t("Миксы")}</h1></div></header>
    <section className="mix-hero" aria-labelledby="mix-title">
      <div className={`mix-art${items.length >= 4 ? ' mix-art-grid' : ''}`} aria-hidden="true">
        {items.length ? items.slice(0, items.length >= 4 ? 4 : 1).map((track) => <Artwork key={track.id} track={track} />) : <AudioLines size={46} />}
      </div>
      <div className="mix-copy"><p className="overline"><Sparkles size={13} />{" "}{t("Для вас в Luma")}</p><h2 id="mix-title">{name}</h2>
        <p>{t(TYPES[type].detail)}{" "}{t("Подборки собираются на этом устройстве, без аккаунта VK.")}</p>
        <div className="mix-actions">
          <button type="button" className="button primary-button" disabled={!items.length} onClick={() => playAll(items)}><Play size={17} fill="currentColor" />{" "}{t("Слушать")}</button>
          <button type="button" className="button outline-button" disabled={!items.length} onClick={() => addMix(items)}><ListPlus size={17} />{" "}{t("В очередь")}</button>
          <button type="button" className="icon-button" title={t("Слушать вперемешку")} aria-label={t("Слушать микс вперемешку")} disabled={items.length < 2} onClick={() => playAll(shuffledMix(items))}><Shuffle size={18} /></button>
          <button type="button" className="icon-button" title={t("Собрать заново")} aria-label={t("Собрать микс заново")} onClick={refresh}><RotateCw size={17} /></button>
        </div>
      </div>
    </section>
    <div className="mix-controls">
      <label>{t("Тип микса")}{" "}<select aria-label={t("Тип микса")} value={type} onChange={(event) => { setType(event.currentTarget.value as MixType); setHistory(recent); setGroup(undefined); }}>
        {Object.entries(TYPES).map(([id, { name: label }]) => <option key={id} value={id}>{t(label)}</option>)}
      </select></label>
      <label className="mix-offline"><input type="checkbox" checked={offline || !connected} disabled={!connected} onChange={(event) => setOffline(event.currentTarget.checked)} />{" "}{t("Только без сети")}</label>
      <span>{trackCount(items.length, fullNumbers, t.language)}</span>
    </div>
    <div className="mix-filters">
      {(['artist', 'genre'] as const).map((kind) => groups[kind].length ? <section key={kind} aria-label={kind === 'artist' ? t("Топ исполнителей") : t("Топ жанров")}>
        <p className="overline">{kind === 'artist' ? t("Топ исполнителей") : t("Топ жанров")} <span>{t("по числу треков")}</span></p>
        <div className="mix-artists" role="group" aria-label={kind === 'artist' ? t("Миксы по исполнителям") : t("Миксы по жанрам")}>
          {groups[kind].map(({ id, label, count }) => {
            const active = group?.id === id && group.kind === kind;
            return <button key={id} type="button" aria-pressed={active} onClick={() => setGroup(active ? undefined : { kind, id })}>{label} <small>{formatCount(count, fullNumbers, t.language)}</small></button>;
          })}
        </div>
      </section> : null)}
    </div>
    {items.length ? <ol className="mix-tracks" aria-label={t("Треки микса")}>{items.map((track, index) => <li key={track.id}>
      <button type="button" className="mix-track" aria-label={t("Играть в миксе: {0}", track.title)} onClick={() => playAll(items, track.id)} aria-current={track.id === currentId ? 'true' : undefined}>
        <span className="mix-index">{track.id === currentId && playing ? <AudioLines size={14} /> : String(index + 1).padStart(2, '0')}</span>
        <Artwork track={track} /><span className="mix-track-copy"><strong>{track.title}</strong><small>{track.artist}</small></span>
        <span>{formatTime(track.duration)}</span>
      </button>
      {track.online && <OnlineCredit track={{ online: track.online }} />}
    </li>)}</ol> : <div className="empty-library"><div><Sparkles size={27} /></div><h2>{t("Пока не из чего собрать микс")}</h2><p>{t("Пополните медиатеку, добавьте треки в избранное или выберите другой тип микса.")}</p></div>}
  </div>;
}
