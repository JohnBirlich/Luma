import { useMemo, useState } from 'react';
import { ArrowRight, Disc3, Headphones, Heart, History, ImagePlus, LayoutGrid, List, ListPlus, Maximize2, Music2, Palette, Pause, Pencil, Play, Plus, Radio, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import { formatTime, trackCount } from '../shared/media';
import type { Track } from '../shared/media';
import type { Appearance, LibraryLayout } from '../shared/customization';
import { musicSearchKey } from '../shared/russian';
import { Artwork } from './Artwork';
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
          {add && !row && track.demo && <span className="card-demo">Демо</span>}
        </div>
        <div className="card-text">
          <strong>{track.title}</strong>
          <small>{track.artist}{row && <span className="track-row-album"> · {track.album}</span>}</small>
        </div>
      </button>
      {add && <div className="card-details">
        <span className="track-length" title={track.album}>{!row && <>{track.album} <span aria-hidden="true">·</span> </>}{formatTime(track.duration)}</span>
        {toggleFavorite && <FavoriteButton track={track} selected={Boolean(favorite)} toggle={toggleFavorite} />}
        {editDetails && !track.demo && <button type="button" className="icon-button" onClick={() => editDetails(track.id)} title="Редактировать данные трека" aria-label={`Данные трека: ${track.title}`} aria-haspopup="dialog"><Pencil size={15} /></button>}
        {editCover && <button type="button" className="icon-button" onClick={() => editCover(track.id)} title="Редактировать обложку" aria-label={`Обложка: ${track.title}`} aria-haspopup="dialog"><ImagePlus size={16} /></button>}
        <button type="button" className="icon-button" onClick={() => add(track.id)} title="В очередь" aria-label={`Добавить ${track.title} в очередь`}><ListPlus size={17} /></button>
        {remove && !track.demo && <button type="button" className="icon-button delete-button" onClick={() => remove(track.id)}
          title="Убрать из медиатеки (файл не удаляется)" aria-label={`Убрать ${track.title} из медиатеки`}><Trash2 size={15} /></button>}
      </div>}
    </article>
  );
}

function FavoriteButton({ track, selected, toggle }: { track: Track; selected: boolean; toggle(id: string): void }) {
  return <button type="button" className="icon-button favorite-toggle" aria-pressed={selected} onClick={() => toggle(track.id)}
    aria-label={`${selected ? 'Убрать из избранного' : 'В избранное'}: ${track.title}`} title={selected ? 'Убрать из избранного' : 'В избранное'}>
    <Heart size={16} fill={selected ? 'currentColor' : 'none'} />
  </button>;
}

interface PlayerPageProps {
  track: Track | null;
  tracks: Track[];
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
  const featured = (tracks.length > 1 ? tracks.filter(({ id }) => id !== track?.id) : tracks).slice(0, 4);
  return (
    <div className="page player-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Локальный плеер</p><h1>Сейчас играет</h1></div>
        <div className="page-actions">
          <button type="button" className="button outline-button scene-open" onClick={props.openAppearance} aria-label="Оформление экрана «Сейчас играет»" title="Оформление" aria-haspopup="dialog"><Palette size={17} /><span>Оформление</span></button>
          {track && !track.demo && <button type="button" className="button outline-button track-details-button" onClick={() => props.editDetails(track.id)}
            aria-label="Редактировать данные трека" title="Редактировать данные трека" aria-haspopup="dialog"><Pencil size={16} /></button>}
          {track && <button type="button" className="button outline-button track-cover-button" onClick={() => props.editCover(track.id)}
            aria-label="Редактировать обложку" title="Редактировать обложку" aria-haspopup="dialog"><ImagePlus size={17} /><span>Обложка</span></button>}
          <button type="button" className="button outline-button page-equalizer" onClick={props.openEqualizer} aria-label="Эквалайзер" title="Эквалайзер" aria-haspopup="dialog">
            <SlidersHorizontal size={17} /><span>Эквалайзер</span>{props.eqEnabled && <i className="enabled-dot" />}
          </button>
        </div>
      </header>
      <section aria-label="Текущий трек" className={`hero hero-style-${hero}${effect !== 'off' ? ' hero-with-effect' : ''}${track?.backdropUrl && !fallback ? ' hero-wide' : ''}${!track ? ' hero-empty' : ''}`} style={{ '--hero-tone': tint, '--scene-tone': tint } as CSSProperties}>
        <SceneBackground effect={effect} strength={effectStrength} tempo={appearance.effectTempo} animate={motion && playing && props.sceneVisible} sample={appearance.audioReactive ? props.readSpectrum : undefined} />
        {showPicture && <img className={`hero-image${fallback ? ' hero-image-fallback' : ''}`} key={artwork} src={artwork} alt="" draggable={false}
          onError={() => { if (!fallback) setFailedPicture(source); }} />}
        {!showPicture && !centered && hero !== 'blur' && <VinylRecord className="hero-disc" track={track} animate={hero === 'vinyl' && motion && playing && props.sceneVisible} />}
        <div className="hero-scrim" aria-hidden="true" />
        {centered && <Artwork track={track} className="hero-center-art" />}
        <div className="hero-content">
          <div className="hero-label"><Signal playing={playing} /> {track?.demo ? 'Демо-трек' : track ? 'Воспроизведение' : 'Ваша коллекция'}</div>
          <h2 title={track?.title}>{track?.title ?? 'Время для музыки'}</h2>
          <div className="hero-meta">
            {track ? <><span>{track.artist}</span><span className="hero-dot" /><span>{track.album}</span></> : <span>Добавьте аудиофайлы, чтобы начать.</span>}
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
        {track && <span className="hero-index" title="Позиция в очереди"><span>{String(props.position).padStart(2, '0')}</span><b>/</b>{String(props.count).padStart(2, '0')}</span>}
      </section>
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
  favorites: ReadonlySet<string>;
  toggleFavorite(id: string): void;
  goToLibrary(): void;
  layout: LibraryLayout;
  changeLayout(layout: LibraryLayout): void;
  openVk(): void;
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
  const [search, setSearch] = useState('');
  const [onlyFiles, setOnlyFiles] = useState(false);
  const files = useMemo(() => props.tracks.filter(({ demo }) => !demo), [props.tracks]);
  const scope = onlyFiles ? files : props.tracks;
  const indexed = useMemo(() => scope.map((track) => ({ track, text: musicSearchKey(`${track.title} ${track.artist} ${track.album}`) })), [scope]);
  const term = musicSearchKey(search);
  const results = useMemo(() => term ? indexed.filter(({ text }) => text.includes(term)).map(({ track }) => track) : scope, [scope, indexed, term]);
  const isList = props.layout === 'list';
  return (
    <div className="page library-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />{isSearch ? 'Найти трек' : 'Коллекция Luma'}</p><h1>{isRecent ? 'Недавно слушали' : isFavorites ? 'Избранное' : isSearch ? 'Поиск' : 'Медиатека'}</h1></div>
        {isLibrary && <button type="button" className="button primary-button" onClick={props.addMusic} disabled={props.busy}><Plus size={18} /> Добавить музыку</button>}
      </header>
      {isRecent && <p className="recent-intro">Порядок прослушивания локальных треков. История не синхронизируется с VK.</p>}
      {isLibrary && <div className="collection-tabs" role="group" aria-label="Разделы медиатеки">
        <button type="button" aria-pressed={!onlyFiles} onClick={() => setOnlyFiles(false)}>Все треки <small>{props.tracks.length}</small></button>
        <button type="button" aria-pressed={onlyFiles} onClick={() => setOnlyFiles(true)}>С устройства <small>{files.length}</small></button>
      </div>}
      <div className="library-toolbar">
        <div className="library-search">
          <Search size={18} />
          <input type="search" placeholder="Трек, исполнитель, альбом…" aria-label="Поиск по медиатеке" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
          {search && <button className="icon-button" type="button" onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={16} /></button>}
        </div>
        {isLibrary && !onlyFiles && <button className="button outline-button demo-toggle" type="button" onClick={props.toggleDemos}
          aria-pressed={props.showDemos} aria-label="Демотреки" title="Показать или скрыть встроенные демотреки" disabled={props.busy}>
          <Headphones size={16} /> <span>Демотреки</span>
        </button>}
      </div>
      {isSearch && <div className="search-scope"><span>Поиск по музыке в Luma</span><button className="text-button" type="button" onClick={props.openVk}><Radio size={14} /> Перейти к VK</button></div>}
      <div className="library-caption">
        <div><Disc3 size={16} />{trackCount(results.length)}</div>
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
      </div> : <div className="empty-library">
        <div>{isRecent ? <History size={27} /> : isFavorites ? <Heart size={27} /> : <Music2 size={27} />}</div><h2>{term ? 'Ничего не нашлось' : isRecent ? 'История пока пуста' : isFavorites ? 'Сохраните любимые треки' : 'Здесь будет ваша музыка'}</h2>
        <p>{term ? 'Попробуйте поискать по части названия или имени исполнителя.' : isRecent ? 'Прослушанные треки появятся здесь, если в настройках включена история.' : isFavorites ? 'Нажмите на сердце рядом с треком или на экране «Сейчас играет».' : 'Перетащите аудиофайлы в окно или выберите их на компьютере.'}</p>
        {!term && (isFavorites || isRecent ? <button type="button" className="button outline-button" onClick={props.goToLibrary}>Открыть медиатеку <ArrowRight size={16} /></button>
          : <button type="button" className="button outline-button" onClick={props.addMusic} disabled={props.busy}><Plus size={17} /> Выбрать файлы</button>)}
      </div>}
    </div>
  );
}
