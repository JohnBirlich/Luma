import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AudioLines, ChevronRight, CirclePause, CloudOff, Headphones, ListMusic, Play, Plus, Radio, Search, Settings2, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { findOnlineTracks } from '../data/online';
import { formatTime } from '../shared/media';
import type { Track } from '../shared/media';
import { makeMix, musicGroups, tracksInGroup } from '../shared/mix';
import type { MixType } from '../shared/mix';
import { HUB_QUEUE_LIMIT, hubMusic, moodTracks } from '../shared/music-hub';
import { ONLINE_FILTERS } from '../shared/online';
import type { OnlineFilter, OnlineTrack } from '../shared/online';
import { musicSearchKey } from '../shared/russian';
import { Artwork } from './Artwork';
import { OnlineCredit, OnlineSearch } from './OnlineMusic';
import type { OnlineAction } from './OnlineMusic';
import { ReleaseLink, useInstalledBuild } from './About';
import { VkBookmarks } from './VkBookmarks';
import type { BookmarkProps } from './VkBookmarks';
import { useVisualMotion } from '../player/useVisualMotion';
import './home.css';

const TABS = { home: 'Для вас', mine: 'Моя музыка', browse: 'Обзор', radio: 'Радио', updates: 'Обновления' } as const;
export type HomeTab = keyof typeof TABS;
const MOODS = [
  { name: 'Спокойно', tags: ['ambient', 'эмбиент', 'jazz', 'джаз', 'chillout', 'downtempo', 'даунтемпо'], color: 'orchid', icon: '✦' },
  { name: 'В движении', tags: ['rock', 'рок', 'metal', 'метал', 'dance', 'электроника', 'electronic'], color: 'mango', icon: '↗' },
  { name: 'В фокусе', tags: ['instrumental', 'classical', 'классика', 'эмбиент', 'ambient'], color: 'aqua', icon: '◎' },
  { name: 'Ночной ритм', tags: ['hip-hop', 'хип-хоп', 'synthwave', 'синтвейв', 'jazz', 'джаз'], color: 'rose', icon: '◐' },
] as const;
const STATIONS = [
  { label: 'Джаз', query: 'jazz', color: 'rose' }, { label: 'Эмбиент', query: 'ambient', color: 'blue' },
  { label: 'Классика', query: 'classical', color: 'orchid' }, { label: 'Рок', query: 'rock', color: 'mango' },
  { label: 'Электроника', query: 'electronic', color: 'aqua' }, { label: 'Хип-хоп', query: 'hip hop', color: 'lime' },
] as const;
const DEMO_COLLECTIONS = [
  { title: 'Тихая сторона', slugs: ['low-tide', 'afterimage', 'glass-waltz'], color: 'aqua' },
  { title: 'Город после заката', slugs: ['violet-hour', 'blue-meridian', 'signal-loop'], color: 'orchid' },
  { title: 'Смена ритма', slugs: ['blue-cafe', 'district-beat', 'night-garage', 'paper-satellites'], color: 'mango' },
] as const;
const COLORS = ['blue', 'orchid', 'aqua', 'rose', 'mango', 'lime'];

interface HomeProps extends BookmarkProps {
  tab: HomeTab;
  query: string;
  selectTab(tab: HomeTab): void;
  setQuery(value: string): void;
  nowPlaying: ReactNode;
  lyrics: ReactNode;
  tracks: Track[];
  recent: Track[];
  favorites: ReadonlySet<string>;
  disliked: ReadonlySet<string>;
  saved: ReadonlySet<string>;
  currentId: string | null;
  playing: boolean;
  connected: boolean;
  visible: boolean;
  motion: boolean;
  busy: boolean;
  play(id: string, toggleCurrent?: boolean): void;
  playMix(tracks: Track[]): void;
  startRadio(tracks: OnlineTrack[]): boolean;
  chooseOnline(track: OnlineTrack, action: OnlineAction): void;
  openLibrary(): void;
  openMixes(): void;
  addMusic(): void;
}

function Shelf({ title, detail, children, action }: { title: string; detail?: string; children?: ReactNode; action?: ReactNode }) {
  return <section className="hub-shelf" aria-label={title}>
    <header className="hub-shelf-head"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</header>
    {children}
  </section>;
}
function Tile({ title, description, color, onClick, disabled, symbol, image, className = '' }: {
  title: string; description?: string; color: string; onClick(): void; disabled?: boolean; symbol?: string; image?: Track; className?: string;
}) {
  return <button type="button" className={`hub-tile tone-${color} ${className}`} disabled={disabled} onClick={onClick}
    aria-label={title} title={description}>
    <span className="hub-tile-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span>
    {image && <Artwork track={image} lazy />}{symbol && <span className="hub-tile-symbol" aria-hidden="true">{symbol}</span>}
    <span className="hub-tile-play" aria-hidden="true"><Play size={13} fill="currentColor" /></span>
  </button>;
}
const TrackRows = memo(function TrackRows({ tracks, play, currentId, playing, strip = false }: {
  tracks: readonly Track[]; play(id: string, toggleCurrent?: boolean): void; currentId: string | null; playing: boolean; strip?: boolean;
}) {
  const t = useText();
  return <ul className={`hub-tracks${strip ? ' hub-tracks-strip' : ''}`}>{tracks.map((track) => {
    const active = track.id === currentId, live = active && playing;
    return <li key={track.id}><button type="button" aria-current={active ? 'true' : undefined} aria-label={t(live ? 'Приостановить: {0}' : 'Слушать: {0}', track.title)}
      className="hub-track" onClick={() => play(track.id, true)}>
      <span className="hub-track-art"><Artwork track={track} lazy /><i>{live ? <CirclePause size={22} /> : <Play size={16} fill="currentColor" />}</i></span>
      <span className="hub-track-copy"><strong>{track.title}</strong><small>{track.artist}</small></span>
      <time>{formatTime(track.duration)}</time>
    </button></li>;
  })}</ul>;
});
function Updates({ tracks, play, currentId, playing }: Pick<HomeProps, 'tracks' | 'play' | 'currentId' | 'playing'>) {
  const t = useText();
  const info = useInstalledBuild();
  const latest = useMemo(() => tracks.filter(({ demo, online }) => !demo && !online).slice(-9).reverse(), [tracks]);
  return <>
    <section className="hub-shelf hub-version"><div className="hub-version-mark"><AudioLines size={27} /></div>
      <div><p className="overline">LUMA PLAYER</p><h2>{info ? t('Версия {0}', info.version) : info === null ? t('Версия недоступна') : t('Читаем версию…')}</h2>
        <p>{t('Проверьте новые версии на странице релизов. Установка запускается вручную.')}</p></div><ReleaseLink className="button outline-button" />
    </section>
    {latest.length > 0 && <Shelf title={t('Недавно добавлено')}><TrackRows tracks={latest} play={play} currentId={currentId} playing={playing} strip /></Shelf>}
  </>;
}

export const HomePage = memo(function HomePage(props: HomeProps) {
  const liquid = useVisualMotion(props.visible && props.motion);
  const t = useText();
  const { tracks, recent, disliked, favorites, saved, visible, connected, currentId, playing, play, playMix, addMusic, openLibrary } = props;
  const { tab, query, setQuery, selectTab } = props;
  const [filter, setFilter] = useState<OnlineFilter>('all');
  const [radioFilter, setRadioFilter] = useState<OnlineFilter>('jamendo');
  const [station, setStation] = useState<{ name: string; loading: boolean; error?: string; tracks?: OnlineTrack[] }>();
  const [tune, setTune] = useState(false);
  const [mixType, setMixType] = useState<MixType>('library');
  const [justFiles, setJustFiles] = useState(false);
  const request = useRef<AbortController | null>(null);
  const formInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (visible && connected && tab === 'radio' && !query.trim()) return;
    if (request.current) { request.current.abort(); request.current = null; setStation(undefined); }
  }, [visible, connected, tab, query]);
  const data = useMemo(() => hubMusic(tracks, recent, disliked, !connected || justFiles), [tracks, recent, disliked, connected, justFiles]);
  const sources = data.personal.length ? data.personal : data.demos;
  const picks = useMemo(() => {
    const lookup = new Map(data.demos.map((track) => [track.id, track]));
    return DEMO_COLLECTIONS.map((group) => ({ ...group, tracks: group.slugs.flatMap((id) => lookup.get(`demo-${id}`) ?? []) }))
      .filter(({ tracks }) => tracks.length);
  }, [data.demos]);
  const demoMix = !data.personal.length && data.demos.length > 0;
  const artists = useMemo(() => {
    const art = new Map<string, Track>();
    for (const item of sources) if (!art.has(musicSearchKey(item.artist))) art.set(musicSearchKey(item.artist), item);
    return musicGroups(sources, 'artist', 10).map((artist) => ({ ...artist, art: art.get(artist.id) }));
  }, [sources]);
  const genres = useMemo(() => musicGroups(sources, 'genre', 14), [sources]);
  const moods = useMemo(() => MOODS.map((mood) => ({ ...mood, tracks: moodTracks(sources, mood.tags) })), [sources]);
  const mine = useMemo(() => tracks.filter(({ demo }) => !demo), [tracks]);
  const searchIndex = useMemo(() => tracks.map((track) => ({ track,
    text: musicSearchKey([track.title, track.artist, track.album, ...(track.genres ?? [])].join(' ')) })), [tracks]);
  const term = musicSearchKey(query);
  const found = useMemo(() => {
    if (!term) return [];
    const result: Track[] = [];
    for (const { track, text } of searchIndex) {
      if (text.includes(term)) result.push(track);
      if (result.length >= 30) break;
    }
    return result;
  }, [term, searchIndex]);
  const favoriteOptions = sources.some(({ id }) => favorites.has(id));
  const mixReady = mixType === 'favorites' ? favoriteOptions : mixType === 'recent' ? !!data.history.length : !!sources.length;
  const rows = { play, currentId, playing };

  function mix(type: MixType, group?: { kind: 'artist' | 'genre'; id: string }) {
    playMix(makeMix(sources, { type, group, favorites, recent: data.history, offline: !connected || justFiles, disliked,
      seed: Math.floor(Math.random() * (2 ** 32)) }));
  }
  function cancelStation() { request.current?.abort(); request.current = null; setStation(undefined); }
  async function radio(name: string, query: string) {
    if (!connected || !visible || props.busy) return;
    request.current?.abort();
    const active = request.current = new AbortController();
    setStation({ name, loading: true });
    try {
      const entries = (await findOnlineTracks(query, radioFilter, active.signal)).filter(({ id }) => !disliked.has(id)).slice(0, HUB_QUEUE_LIMIT);
      if (active.signal.aborted) return;
      if (!entries.length) setStation({ name, loading: false, error: 'Подходящих записей для этой станции нет. Попробуйте другой каталог.' });
      else setStation({ name, loading: false, tracks: entries });
    } catch { if (!active.signal.aborted) setStation({ name, loading: false, error: 'Каталог сейчас недоступен. Повторите попытку позже.' }); }
    finally { if (request.current === active) request.current = null; }
  }

  return <div className="page home-page">
    <header className="hub-masthead">
      <div className="hub-heading"><div>
        <p className="overline page-kicker"><span />{t('Ваша коллекция')}</p>
        <h1>{t('Главная')}</h1>
      </div><div className="hub-search"><Search size={18} aria-hidden="true" /><input ref={formInput} type="search" aria-label={t('Поиск музыки')} placeholder={t('Поиск музыки')} maxLength={140} value={query}
        onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && term && !found.length) {
            const form = document.getElementById('online-search-form');
            if (form instanceof HTMLFormElement) { event.preventDefault(); form.requestSubmit(); }
          }
        }} />{query && <button type="button" className="icon-button" aria-label={t('Очистить поиск')} onClick={() => { setQuery(''); formInput.current?.focus(); }}><X size={14} /></button>}</div></div>
      <div className="hub-topline"><nav aria-label={t('Разделы на главной')} className="hub-tabs">
        {(Object.keys(TABS) as HomeTab[]).map((id) => <button type="button" key={id} aria-current={tab === id && !term ? 'page' : undefined} onClick={() => selectTab(id)}>{t(TABS[id])}</button>)}
      </nav><div className="hub-top-actions">
        <button type="button" className="icon-button" disabled={props.busy} onClick={addMusic} title={t('Добавить музыку')} aria-label={t('Добавить музыку')}><Plus size={19} /></button>
        <button type="button" className="icon-button" onClick={props.openMixes} title={t('Миксы Luma')} aria-label={t('Миксы Luma')}><ListMusic size={18} /></button>
      </div></div>
    </header>
    {term ? <>
      <Shelf title={t('В вашей медиатеке')}>
        {found.length ? <TrackRows {...rows} tracks={found} /> : <p className="hub-note">{t('В медиатеке нет совпадений.')}</p>}
      </Shelf>
      <OnlineSearch key={term} query={query} hasLocal={!!found.length} filter={filter} setFilter={setFilter} saved={saved} disabled={props.busy} choose={props.chooseOnline} />
    </> : <>
      {tab === 'home' && <>
        <div className="hub-lead"><section className="hub-hero" aria-labelledby="hub-mix-title">
          <div className={`hub-liquid${liquid ? ' hub-liquid-moving' : ''}`} aria-hidden="true" />
          <div className="hub-hero-inner"><p className="overline hub-hero-kicker"><AudioLines size={14} /> {t('Музыка Luma')} <span /> {demoMix ? t('Демоколлекция') : t('На этом устройстве')}</p>
            <h2 id="hub-mix-title">{t('Слушать микс Luma')}</h2>
            <p>{demoMix ? t('Попробуйте плеер на встроенной коллекции.') : t('Подборка из вашей музыки, избранного и истории.')}</p>
            <div className="hub-hero-controls">
              <button type="button" className="hub-hero-play" onClick={() => mix(mixType)} disabled={!mixReady || props.busy} aria-label={t('Слушать микс Luma')}><Play size={22} fill="currentColor" /></button>
              <button type="button" className="button outline-button" aria-expanded={tune} aria-controls="hub-mix-tune" onClick={() => setTune(!tune)}><Settings2 size={16} />{t('Настроить')}</button>
              {!sources.length && <button type="button" className="button primary-button" disabled={props.busy} onClick={addMusic}>{t('Добавить музыку')}</button>}
            </div>
            {tune && <div className="hub-tune" id="hub-mix-tune">
              <label>{t('Источник микса')}<select value={mixType} onChange={(event) => setMixType(event.currentTarget.value as MixType)}>
                <option value="library">{t('Моя музыка')}</option><option value="favorites" disabled={!favoriteOptions}>{t('Избранное')}</option>
                <option value="recent" disabled={!data.history.length}>{t('Недавно слушали')}</option></select></label>
              <label><input type="checkbox" checked={justFiles} onChange={(event) => setJustFiles(event.currentTarget.checked)} /> {t('Только файлы')}</label>
            </div>}
          </div>
        </section>{props.nowPlaying}</div>
        {props.lyrics}
        <Shelf title={t('Мои треки')} detail={!mine.length && data.demos.length ? t('Пока здесь встроенные демотреки.') : undefined} action={<button type="button" className="text-button" onClick={() => selectTab('mine')}>{t('Показать все')}<ChevronRight size={15} /></button>}>
          {(mine.length || data.demos.length) ? <TrackRows {...rows} tracks={(mine.length ? mine : data.demos).slice(0, 9)} strip />
            : <p className="hub-note">{t('Добавьте аудиофайлы, чтобы начать.')}</p>}
        </Shelf>
        <Shelf title={t('Собрано в Luma')} detail={t('Подборки без передачи истории на сервер.')}>
          <div className="hub-rail hub-mix-rail">
            <Tile title={t('Для вас')} description={demoMix ? t('Демоколлекция') : t('По вашим прослушиваниям')} color="blue" onClick={() => mix('library')} disabled={!sources.length || props.busy} />
            <Tile title={t('Открытия')} description={t('Ещё не звучали')} color="orchid" onClick={() => playMix(data.discoveries.slice(0, HUB_QUEUE_LIMIT))} disabled={!data.discoveries.length || props.busy} />
            <Tile title={t('Недавнее')} description={t('Снова в очереди')} color="aqua" onClick={() => mix('recent')} disabled={!data.history.length || props.busy} />
            <Tile title={t('Избранное')} description={t('Треки, отмеченные сердцем')} color="rose" onClick={() => mix('favorites')} disabled={!favoriteOptions || props.busy} />
          </div>
        </Shelf>
        {data.seed && data.related.length > 0 && <Shelf title={t('Похоже на «{0}»', data.seed.title)} detail={t('По исполнителям и жанрам в вашей медиатеке.')}>
          <TrackRows {...rows} tracks={data.related} strip />
        </Shelf>}
      </>}
      {(tab === 'home' || tab === 'browse') && <>
        {genres.length > 0 && <Shelf title={t('Жанры')} detail={demoMix ? t('Жанры встроенных демотреков.') : undefined}>
          <div className="hub-rail hub-strip">{genres.map((genre) => <Tile key={genre.id} title={genre.label} color="blue" disabled={props.busy} onClick={() => mix('library', { kind: 'genre', id: genre.id })} />)}</div>
        </Shelf>}
        <Shelf title={t('Настроения и занятия')} detail={t('Собираются по жанрам в медиатеке.')}>
          <div className="hub-rail hub-strip">{moods.map(({ name, color, tracks, icon }) => <Tile key={name} title={t(name)} color={color} symbol={icon} onClick={() => playMix(tracks)} disabled={!tracks.length || props.busy} />)}</div>
        </Shelf>
        {artists.length > 0 && <Shelf title={t('Микс по исполнителям')}>
          <div className="hub-rail hub-artist-rail">{artists.map((artist, index) => <Tile key={artist.id} title={artist.label} color={COLORS[index % COLORS.length]} image={artist.art} disabled={props.busy}
            onClick={() => playMix(tracksInGroup(sources, { kind: 'artist', id: artist.id }).slice(0, HUB_QUEUE_LIMIT))} />)}</div>
        </Shelf>}
        {picks.length > 0 && <Shelf title={t('Коллекции Luma')} detail={t('Тематические подборки из встроенных демотреков.')}>
          <div className="hub-rail hub-curated-rail">{picks.map(({ title, tracks, color }) => <Tile key={title} title={t(title)} description={t('Демоколлекция')}
            color={color} image={tracks[0]} disabled={props.busy} onClick={() => playMix(tracks)} />)}</div>
        </Shelf>}
        {tab === 'browse' && <Shelf title={t('Открытые каталоги')} detail={t('Ищите записи в Jamendo, Wikimedia Commons и других доступных источниках.')}
          action={<button type="button" className="text-button" onClick={() => formInput.current?.focus()}>{t('Поиск музыки')}<ChevronRight size={15} /></button>} />}
      </>}
      {tab === 'mine' && <>
        <Shelf title={t('Мои треки')} action={<button type="button" className="text-button" onClick={openLibrary}>{t('Медиатека')}<ChevronRight size={15} /></button>}>
          {mine.length ? <TrackRows {...rows} tracks={mine.slice(0, 24)} /> : <p className="hub-note">{t('Добавьте аудиофайлы, чтобы начать.')}</p>}
        </Shelf>
        {!mine.length && data.demos.length > 0 && <Shelf title={t('Демоколлекция')}><TrackRows {...rows} tracks={data.demos} strip /></Shelf>}
        <VkBookmarks covers={props.covers} editCover={props.editCover} discardCover={props.discardCover} />
      </>}
      {tab === 'radio' && <Shelf title={t('Радио Luma')} detail={t('Станция создаёт очередь из открытого каталога, а не запускает прямой эфир.') }>
        <div className="hub-radio-settings"><label><Radio size={17} /> {t('Источник онлайн-поиска')}
          <select value={radioFilter} onChange={(event) => { cancelStation(); setRadioFilter(event.currentTarget.value as OnlineFilter); }}>
            <option value="all">Jamendo + Wikimedia Commons</option>{Object.entries(ONLINE_FILTERS)
              .filter(([key]) => window.luma || key === 'jamendo' || key === 'wikimedia_audio').map(([key, name]) => <option key={key} value={key}>{t(name)}</option>)}</select></label>
          {station?.loading && <button type="button" className="text-button" onClick={cancelStation}>{t('Отмена')}</button>}
        </div>
        {!connected && <p className="hub-note"><CloudOff size={17} /> {t('Для радио нужна сеть.')}</p>}
        <div className="hub-rail hub-station-rail">{STATIONS.map(({ label, color, query }) => <Tile key={label} title={t(label)} description={t('Из выбранного каталога')}
          color={color} onClick={() => void radio(label, query)} disabled={!connected || props.busy} />)}</div>
        {station && <p role="status" className={station.error ? 'hub-error' : 'hub-note'}>{station.error ? t(station.error) : station.loading ? t('Ищем…') : t('Станция «{0}» · записей: {1}', t(station.name), station.tracks?.length ?? 0)}</p>}
        {station?.tracks && <div className="hub-radio-result">
          <button type="button" className="button primary-button" disabled={!connected || props.busy}
            onClick={() => { if (props.startRadio(station.tracks!.filter(({ id }) => !disliked.has(id)))) setStation(undefined); }}><Play size={16} />{t('Слушать станцию')}</button>
          <ul>{station.tracks.slice(0, 3).map((track) => <li key={track.id}><span>{track.title} · {track.artist}</span><OnlineCredit track={track} /></li>)}</ul>
        </div>}
      </Shelf>}
      {tab === 'updates' && <Updates tracks={tracks} {...rows} />}
    </>}
    <footer className="hub-footer"><Headphones size={14} />{t('Миксы Luma не используют аккаунт VK.')}</footer>
  </div>;
});
