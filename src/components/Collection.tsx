import { useMemo, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, Link2, Sparkles, UserRound, ArrowRight, Disc3, Headphones, Heart, History, ImagePlus, LayoutGrid, List, ListPlus, Maximize2, Music2, Palette, Pause, Pencil, Play, Plus, Radio, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { connectionState, subscribeConnection } from '../data/diagnostics';
import { formatCount } from '../shared/customization';
import { LyricsPanel } from './LyricsPanel';
import { homeRecommendations, musicGroups, tracksInGroup } from '../shared/mix';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import { formatTime, trackCount } from '../shared/media';
import type { OnlineFilter, OnlineTrack } from '../shared/online';
import { OnlineCredit, OnlineImport, OnlineSearch } from './OnlineMusic';
import type { OnlineAction } from './OnlineMusic';
import type { Track } from '../shared/media';
import type { Appearance, LibraryLayout } from '../shared/customization';
import { musicSearchKey } from '../shared/russian';
import { Artwork } from './Artwork';
import { FavoriteButton } from './FavoriteButton';
import { Signal } from './QueuePanel';
import { SceneBackground } from './SceneBackground';
import { VinylRecord } from './VinylRecord';
import type { ReadSpectrum } from '../player/useAudio';

interface TrackCardProps {
  track: Track;
  active: boolean;
  playing: boolean;
  row?: boolean;
  play(id: string): void;
  add?(id: string): void;
  editCover?(id: string): void;
  editDetails?(id: string): void;
  remove?(id: string): void;
  favorite?: boolean;
  toggleFavorite?(id: string): void;
}

function TrackCard({ track, active, playing, row, play, add, editCover, editDetails, remove, favorite, toggleFavorite }: TrackCardProps) {
  return (
    <article className={`track-card${row ? ' track-list-item' : ''}${active ? ' track-card-active' : ''}${active && playing ? ' track-card-playing' : ''}`}>
      <button type="button" className="card-play" onClick={() => play(track.id)} aria-label={`${active && playing ? 'Приостановить' : 'Воспроизвести'} ${track.title}`}>
        <div className="card-image">
          <Artwork track={track} />
          <span className="card-play-icon">{active && playing ? <Pause size={17} fill="currentColor" /> : <Play className="play-icon" size={17} fill="currentColor" />}</span>
          {add && !row && (track.demo || track.online) && <span className="card-demo">{track.online ? 'Онлайн' : 'Демо'}</span>}
        </div>
        <div className="card-text">
          <strong>{track.title}</strong>
          <small>{track.artist}{row && <span className="track-row-album"> · {track.album}</span>}{track.online && ' · Онлайн'}</small>
        </div>
      </button>
      {add && <div className="card-details">
        <span className="track-length" title={track.album}>{!row && <>{track.album} <span aria-hidden="true">·</span> </>}{formatTime(track.duration)}</span>
        {toggleFavorite && <FavoriteButton track={track} selected={Boolean(favorite)} toggle={toggleFavorite} />}
        {editDetails && !track.demo && !track.online && <button type="button" className="icon-button" onClick={() => editDetails(track.id)} title="Редактировать данные трека" aria-label={`Данные трека: ${track.title}`} aria-haspopup="dialog"><Pencil size={15} /></button>}
        {editCover && <button type="button" className="icon-button" onClick={() => editCover(track.id)} title="Редактировать обложку" aria-label={`Обложка: ${track.title}`} aria-haspopup="dialog"><ImagePlus size={16} /></button>}
        <button type="button" className="icon-button" onClick={() => add(track.id)} title="В очередь" aria-label={`Добавить ${track.title} в очередь`}><ListPlus size={17} /></button>
        {remove && !track.demo && <button type="button" className="icon-button delete-button" onClick={() => remove(track.id)}
          title={track.online ? "Убрать онлайн-ссылку" : "Убрать из медиатеки (файл не удаляется)"} aria-label={`Убрать ${track.title} из медиатеки`}><Trash2 size={15} /></button>}
      </div>}
    </article>
  );
}

interface PlayerPageProps {
  track: Track | null;
  tracks: Track[];
  recent: Track[];
  favoriteIds: ReadonlySet<string>;
  connected: boolean;
  elapsed: number;
  autoLyrics: boolean;
  openMixes(): void;
  tint: string;
  appearance: Appearance;
  favorite: boolean;
  toggleFavorite(id: string): void;
  readSpectrum: ReadSpectrum;
  openAppearance(): void;
  openPresentation(): void;
  sceneVisible: boolean;
  playing: boolean;
  position: number;
  count: number;
  eqEnabled: boolean;
  toggle(): void;
  play(id: string): void;
  goToLibrary(): void;
  openEqualizer(): void;
  editCover(id: string): void;
  editDetails(id: string): void;
  addMusic(): void;
}

export function PlayerPage(props: PlayerPageProps) {
  const { track, tracks, tint, playing, appearance } = props;
  const { hero, effect, effectStrength, motion } = appearance;
  const [failedPicture, setFailedPicture] = useState<string>();
  const source = track?.backdropUrl ?? track?.artworkUrl;
  const fallback = !source || source === failedPicture;
  const artwork = fallback ? DEFAULT_ARTWORK_URL : source;
  const showPicture = !!track && (hero === 'cover' || hero === 'blur');
  const centered = hero === 'center';
  const picks = useMemo(() => homeRecommendations(tracks, props.recent, props.favoriteIds, !props.connected), [tracks, props.recent, props.favoriteIds, props.connected]);
  const homeSections = [
    { label: 'Похожее на прослушанное', items: picks.related, icon: Headphones },
    { label: 'Открытия в медиатеке', items: picks.discoveries, icon: Sparkles },
    { label: 'Недавно слушали', items: picks.recent, icon: History },
  ];
  const featured = (tracks.length > 1 ? tracks.filter(({ id }) => id !== track?.id) : tracks).slice(0, 4);
  return (
    <div className="page player-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Плеер Luma</p><h1>Сейчас играет</h1></div>
        <div className="page-actions">
          <button type="button" className="button outline-button scene-open" onClick={props.openAppearance} aria-label="Оформление экрана «Сейчас играет»" title="Оформление" aria-haspopup="dialog"><Palette size={17} /><span>Оформление</span></button>
          {track && !track.demo && !track.online && <button type="button" className="button outline-button track-details-button" onClick={() => props.editDetails(track.id)}
            aria-label="Редактировать данные трека" title="Редактировать данные трека" aria-haspopup="dialog"><Pencil size={16} /></button>}
          {track && <button type="button" className="button outline-button track-cover-button" onClick={() => props.editCover(track.id)}
            aria-label="Редактировать обложку" title="Редактировать обложку" aria-haspopup="dialog"><ImagePlus size={17} /><span>Обложка</span></button>}
          <button type="button" className="button outline-button page-equalizer" onClick={props.openEqualizer} aria-label="Эквалайзер" title="Эквалайзер" aria-haspopup="dialog">
            <SlidersHorizontal size={17} /><span>Эквалайзер</span>{props.eqEnabled && <i className="enabled-dot" />}
          </button>
        </div>
      </header>
      <section aria-label="Текущий трек" data-effect={effect} className={`hero hero-style-${hero}${effect !== 'off' ? ' hero-with-effect' : ''}${track?.backdropUrl && !fallback ? ' hero-wide' : ''}${!track ? ' hero-empty' : ''}`} style={{ '--hero-tone': tint, '--scene-tone': tint } as CSSProperties}>
        <SceneBackground effect={effect} strength={effectStrength} tempo={appearance.effectTempo} animate={motion && playing && props.sceneVisible} sample={appearance.audioReactive && !track?.online ? props.readSpectrum : undefined} />
        {showPicture && <img className={`hero-image${fallback ? ' hero-image-fallback' : ''}`} key={artwork} src={artwork} alt="" draggable={false}
          onError={() => { if (!fallback) setFailedPicture(source); }} />}
        {!showPicture && !centered && hero !== 'blur' && <VinylRecord className="hero-disc" track={track} animate={hero === 'vinyl' && motion && playing && props.sceneVisible} />}
        <div className="hero-scrim" aria-hidden="true" />
        {centered && <Artwork track={track} className="hero-center-art" />}
        <div className="hero-content">
          <div className="hero-label"><Signal playing={playing} /> {track?.demo ? 'Демо-трек' : track?.online ? 'Онлайн-трек' : track ? 'Воспроизведение' : 'Ваша коллекция'}</div>
          <h2 title={track?.title}>{track?.title ?? 'Время для музыки'}</h2>
          <div className="hero-meta">
            {track ? <><span>{track.artist}</span><span className="hero-dot" />{track.online ? <OnlineCredit track={{ online: track.online }} /> : <span>{track.album}</span>}</> : <span>Добавьте аудиофайлы, чтобы начать.</span>}
          </div>
          <div className="hero-actions-row">
            <button type="button" className="button primary-button hero-action" onClick={track ? props.toggle : props.addMusic}>
              {track ? playing ? <Pause size={16} fill="currentColor" /> : <Play className="play-icon" size={16} fill="currentColor" /> : <Plus size={18} />}
              <span>{track ? playing ? 'Пауза' : 'Воспроизвести' : 'Добавить музыку'}</span>
            </button>
            {track && <>
              <FavoriteButton track={track} selected={props.favorite} toggle={props.toggleFavorite} />
              <button type="button" className="icon-button hero-fullscreen" onClick={props.openPresentation} aria-label="Развернуть текущий трек" title="Во весь экран (F)" aria-haspopup="dialog"><Maximize2 size={17} /></button>
            </>}
          </div>
        </div>
        {track && <span className="hero-index" title="Позиция в очереди"><span>{formatCount(props.position, appearance.fullNumbers).padStart(2, '0')}</span><b>/</b>{formatCount(props.count, appearance.fullNumbers).padStart(2, '0')}</span>}
      </section>
      {track && !track.demo && <LyricsPanel key={track.id} track={track} elapsed={props.elapsed} playing={playing} auto={props.autoLyrics} connected={props.connected} />}
      {homeSections.some(({ items }) => items.length) && <section className="home-personal" aria-labelledby="home-personal-title">
        <header className="section-header"><div><p className="overline">Только на этом устройстве</p><h2 id="home-personal-title">Для вас в Luma</h2></div>
          <button className="text-button" type="button" onClick={props.openMixes}>Миксы Luma <ArrowRight size={16} /></button></header>
        <div className="home-personal-grid">{homeSections.map(({ label, items, icon: Icon }, index) => items.length > 0 && <section key={label} className={`home-pick home-pick-${index}`} aria-label={label}>
          <div className="home-pick-title"><Icon size={17} /><h3>{label}</h3></div>
          <ul>{items.map((item) => <li key={item.id}>
            <button type="button" className="home-pick-track" aria-label={`Слушать: ${item.title}`} onClick={() => props.play(item.id)}>
              <Artwork track={item} /><span><strong>{item.title}</strong><small>{item.artist}</small></span><Play size={13} />
            </button>
          </li>)}</ul>
        </section>)}</div>
      </section>}
      {featured.length > 0 && <section aria-labelledby="featured-title" className="featured">
        <header className="section-header">
          <div><p className="overline">Коллекция</p><h2 id="featured-title">В медиатеке</h2></div>
          <button type="button" className="text-button" onClick={props.goToLibrary}>Вся музыка <ArrowRight size={16} /></button>
        </header>
        <div className="track-grid featured-grid">
          {featured.map((item) => <TrackCard key={item.id} track={item} active={item.id === track?.id} playing={playing} play={props.play} />)}
        </div>
      </section>}
    </div>
  );
}

interface LibraryPageProps {
  tracks: Track[];
  currentId: string | null;
  playing: boolean;
  showDemos: boolean;
  busy: boolean;
  mode: 'library' | 'search' | 'favorites' | 'recent';
  initialScope?: 'all' | 'offline';
  fullNumbers: boolean;
  favorites: ReadonlySet<string>;
  toggleFavorite(id: string): void;
  goToLibrary(): void;
  layout: LibraryLayout;
  changeLayout(layout: LibraryLayout): void;
  openVk(): void;
  openMixes(): void;
  openRecent(): void;
  openFavorites(): void;
  openSearch(): void;
  chooseOnline(track: OnlineTrack, action: OnlineAction): void;
  addMusic(): void;
  toggleDemos(): void;
  play(id: string): void;
  playAll(tracks: Track[]): void;
  add(id: string): void;
  editCover(id: string): void;
  editDetails(id: string): void;
  remove(id: string): void;
}

export function LibraryPage(props: LibraryPageProps) {
  const isLibrary = props.mode === 'library';
  const isSearch = props.mode === 'search';
  const isFavorites = props.mode === 'favorites';
  const isRecent = props.mode === 'recent';
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const [search, setSearch] = useState('');
  const [catalogSource, setCatalogSource] = useState<OnlineFilter>('all');
  const [scopeId, setScope] = useState<'all' | 'offline' | 'online'>(props.initialScope ?? 'all');
  const files = useMemo(() => props.tracks.filter(({ online }) => !online), [props.tracks]);
  const online = useMemo(() => props.tracks.filter(({ online }) => online), [props.tracks]);
  const saved = useMemo(() => new Set(online.map(({ id }) => id)), [online]);
  const [groupKind, setGroupKind] = useState<'artist' | 'album'>();
  const [groupId, setGroupId] = useState('');
  const groups = useMemo(() => groupKind ? musicGroups(props.tracks, groupKind) : [], [props.tracks, groupKind]);
  const scope = useMemo(() => scopeId === 'offline' ? files : scopeId === 'online' ? online
    : groupKind && groupId ? tracksInGroup(props.tracks, { kind: groupKind, id: groupId }) : props.tracks,
    [files, online, scopeId, props.tracks, groupKind, groupId]);
  const indexed = useMemo(() => scope.map((track) => ({ track, text: musicSearchKey(`${track.title} ${track.artist} ${track.album} ${track.genres?.join(' ') ?? ''}`) })), [scope]);
  const term = musicSearchKey(search);
  const results = useMemo(() => term ? indexed.filter(({ text }) => text.includes(term)).map(({ track }) => track) : scope, [scope, indexed, term]);
  const isList = props.layout === 'list';
  return (
    <div className="page library-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />{isSearch ? 'Найти трек' : 'Коллекция Luma'}</p><h1>{isRecent ? 'Недавно слушали' : isFavorites ? 'Избранное' : isSearch ? 'Поиск' : 'Медиатека'}</h1></div>
        {isLibrary && <button type="button" className="button primary-button" onClick={props.addMusic} disabled={props.busy}><Plus size={18} /> Добавить музыку</button>}
      </header>
      {isRecent && <p className="recent-intro">Локальные и онлайн-треки, которые играли в Luma. История хранится на устройстве.</p>}
      {isLibrary && <div className="collection-tabs" role="group" aria-label="Разделы медиатеки">
        <button type="button" aria-pressed={scopeId === 'all'} onClick={() => { setScope('all'); setGroupKind(undefined); setGroupId(''); }}>Все треки <small>{formatCount(props.tracks.length, props.fullNumbers)}</small></button>
        <button type="button" aria-pressed={scopeId === 'offline'} onClick={() => setScope('offline')}>Без сети <small>{formatCount(files.length, props.fullNumbers)}</small></button>
        <button type="button" aria-pressed={scopeId === 'online'} onClick={() => setScope('online')}>Из интернета <small>{formatCount(online.length, props.fullNumbers)}</small></button>
      </div>}
      {isLibrary && scopeId === 'all' && !term && <div className="collection-shortcuts" aria-label="Каталоги медиатеки">
        <button type="button" onClick={props.openMixes}><span><Sparkles size={18} />Микс Luma</span><small>Подборка ваших треков</small></button>
        <button type="button" onClick={props.openRecent}><span><History size={18} />Недавно слушали</span><small>История на устройстве</small></button>
        <button type="button" onClick={props.openFavorites}><span><Heart size={18} />Избранное</span><small>Любимые треки</small></button>
        <button type="button" aria-pressed={groupKind === 'album'} onClick={() => { setGroupKind('album'); setGroupId(''); }}><span><Disc3 size={18} />Альбомы</span><small>Сгруппированы по тегам</small></button>
        <button type="button" aria-pressed={groupKind === 'artist'} onClick={() => { setGroupKind('artist'); setGroupId(''); }}><span><UserRound size={18} />Исполнители</span><small>Найти музыку артиста</small></button>
        <button type="button" onClick={() => setScope('online')}><span><Link2 size={18} />Перенос музыки</span><small>Добавить ссылку на запись</small></button>
      </div>}
      {isLibrary && scopeId === 'all' && groupKind && <label className="collection-facet">{groupKind === 'artist' ? 'Исполнитель' : 'Альбом'}
        <select aria-label={groupKind === 'artist' ? 'Исполнитель' : 'Альбом'} value={groupId} onChange={(event) => setGroupId(event.currentTarget.value)}>
          <option value="">{groupKind === 'artist' ? 'Все исполнители' : 'Все альбомы'}</option>
          {groups.map(({ id, label, count }) => <option key={id} value={id}>{label} · {formatCount(count, props.fullNumbers)}</option>)}
        </select>
      </label>}
      {isLibrary && scopeId !== 'offline' && !connected && <p className="online-offline" role="status"><CloudOff size={17} /> Устройство вне сети. Файлы доступны во вкладке «Без сети».</p>}
      {isLibrary && scopeId === 'online' && <OnlineImport disabled={props.busy} save={(track) => props.chooseOnline(track, 'save')} />}
      {isLibrary && scopeId === 'offline' && <p className="recent-intro">Файлы с устройства и встроенная музыка. Онлайн-треки сюда не копируются.</p>}
      <div className="library-toolbar">
        <div className="library-search">
          <Search size={18} />
          <input type="search" placeholder="Трек, исполнитель, альбом или жанр…" aria-label="Поиск по медиатеке" maxLength={140} value={search} onChange={(event) => setSearch(event.currentTarget.value)} onKeyDown={(event) => {
            if (isSearch && !results.length && event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              const form = document.getElementById('online-search-form');
              if (form instanceof HTMLFormElement) form.requestSubmit();
            }
          }} />
          {search && <button className="icon-button" type="button" onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={16} /></button>}
        </div>
        {isLibrary && scopeId !== 'online' && <button className="button outline-button demo-toggle" type="button" onClick={props.toggleDemos}
          aria-pressed={props.showDemos} aria-label="Демотреки" title="Показать или скрыть встроенные демотреки" disabled={props.busy}>
          <Headphones size={16} /> <span>Демотреки</span>
        </button>}
      </div>
      {isSearch && <div className="search-scope"><span>Сначала в медиатеке</span><button className="text-button" type="button" onClick={props.openVk}><Radio size={14} /> Перейти к VK</button></div>}
      <div className="library-caption">
        <div><Disc3 size={16} />{trackCount(results.length, props.fullNumbers)}</div>
        <div className="library-actions">
          <button className="text-button library-play-all" onClick={() => props.playAll(results)} type="button" aria-label="Воспроизвести все" title="Воспроизвести все" disabled={!results.length}>
            <Play size={14} fill="currentColor" /> <span>Воспроизвести все</span>
          </button>
          <div className="layout-toggle" role="group" aria-label="Вид медиатеки">
            <button className="icon-button" type="button" aria-pressed={isList} aria-label="Списком" title="Списком" onClick={() => props.changeLayout('list')}><List size={17} /></button>
            <button className="icon-button" type="button" aria-pressed={!isList} aria-label="Плиткой" title="Плиткой" onClick={() => props.changeLayout('grid')}><LayoutGrid size={16} /></button>
          </div>
        </div>
      </div>
      {results.length ? <div className={isList ? 'track-list' : 'track-grid library-grid'}>
        {results.map((track) => <TrackCard key={track.id} track={track} active={track.id === props.currentId} playing={props.playing} row={isList}
          play={props.play} add={props.add} editCover={props.editCover} editDetails={props.editDetails} remove={props.remove} favorite={props.favorites.has(track.id)} toggleFavorite={props.toggleFavorite} />)}
      </div> : isSearch && term ? <p className="search-local-empty">В медиатеке нет совпадений.</p> : <div className="empty-library">
        <div>{isRecent ? <History size={27} /> : isFavorites ? <Heart size={27} /> : scopeId === 'online' ? <Cloud size={27} /> : <Music2 size={27} />}</div><h2>{term ? 'Ничего не нашлось' : isRecent ? 'История пока пуста' : isFavorites ? 'Сохраните любимые треки' : scopeId === 'online' ? 'Нет сохранённых онлайн-треков' : 'Здесь будет ваша музыка'}</h2>
        <p>{term ? 'Попробуйте поискать по части названия или имени исполнителя.' : isRecent ? 'Прослушанные треки появятся здесь, если в настройках включена история.' : isFavorites ? 'Нажмите на сердце рядом с треком или на экране «Сейчас играет».' : scopeId === 'online' ? 'Найдите запись в онлайн-поиске или вставьте ссылку Openverse выше.' : 'Перетащите аудиофайлы в окно или выберите их на компьютере.'}</p>
        {!term && (isFavorites || isRecent ? <button type="button" className="button outline-button" onClick={props.goToLibrary}>Открыть медиатеку <ArrowRight size={16} /></button>
          : scopeId === 'online' ? <button type="button" className="button outline-button" onClick={props.openSearch}>Открыть поиск <Search size={16} /></button>
          : <button type="button" className="button outline-button" onClick={props.addMusic} disabled={props.busy}><Plus size={17} /> Выбрать файлы</button>)}
      </div>}
      {isSearch && search.trim().length >= 2 && <OnlineSearch key={search.trim()} query={search.trim()} hasLocal={results.length > 0} filter={catalogSource} setFilter={setCatalogSource} saved={saved} disabled={props.busy} choose={props.chooseOnline} />}
    </div>
  );
}
