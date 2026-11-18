import { useMemo, useState } from 'react';
import { ArrowRight, Disc3, Headphones, ImagePlus, ListPlus, Music2, Pause, Play, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatTime, trackCount } from '../shared/media';
import type { Track } from '../shared/media';
import type { HeroStyle } from '../shared/customization';
import { Artwork } from './Artwork';
import { Signal } from './QueuePanel';

interface TrackCardProps {
  track: Track;
  active: boolean;
  playing: boolean;
  play(id: string): void;
  add?(id: string): void;
  editCover?(id: string): void;
  remove?(id: string): void;
}

function TrackCard({ track, active, playing, play, add, editCover, remove }: TrackCardProps) {
  return (
    <article className={`track-card${active ? ' track-card-active' : ''}`}>
      <button type="button" className="card-play" onClick={() => play(track.id)} aria-label={`${active && playing ? 'Приостановить' : 'Воспроизвести'} ${track.title}`}>
        <div className="card-image">
          <Artwork track={track} />
          <span className="card-play-icon">{active && playing ? <Pause size={17} fill="currentColor" /> : <Play className="play-icon" size={17} fill="currentColor" />}</span>
          {add && track.demo && <span className="card-demo">Демо</span>}
        </div>
        <div className="card-text">
          <strong>{track.title}</strong>
          <small>{track.artist}</small>
        </div>
      </button>
      {add && <div className="card-details">
        <span title={track.album}>{track.album} <span aria-hidden="true">·</span> {formatTime(track.duration)}</span>
        {editCover && <button type="button" className="icon-button" onClick={() => editCover(track.id)} title="Редактировать обложку" aria-label={`Обложка: ${track.title}`} aria-haspopup="dialog"><ImagePlus size={16} /></button>}
        <button type="button" className="icon-button" onClick={() => add(track.id)} title="В очередь" aria-label={`Добавить ${track.title} в очередь`}><ListPlus size={17} /></button>
        {remove && !track.demo && <button type="button" className="icon-button delete-button" onClick={() => remove(track.id)}
          title="Убрать из медиатеки (файл не удаляется)" aria-label={`Убрать ${track.title} из медиатеки`}><Trash2 size={15} /></button>}
      </div>}
    </article>
  );
}

interface PlayerPageProps {
  track: Track | null;
  tracks: Track[];
  tint: string;
  heroStyle: HeroStyle;
  playing: boolean;
  position: number;
  count: number;
  eqEnabled: boolean;
  toggle(): void;
  play(id: string): void;
  goToLibrary(): void;
  openEqualizer(): void;
  editCover(id: string): void;
  addMusic(): void;
}

export function PlayerPage(props: PlayerPageProps) {
  const { track, tracks, tint, playing } = props;
  const artwork = track?.backdropUrl ?? track?.artworkUrl;
  const showPicture = artwork && props.heroStyle !== 'vinyl';
  const featured = (tracks.length > 1 ? tracks.filter(({ id }) => id !== track?.id) : tracks).slice(0, 4);
  return (
    <div className="page player-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Локальный плеер</p><h1>Сейчас играет</h1></div>
        <div className="page-actions">
          {track && <button type="button" className="button outline-button track-cover-button" onClick={() => props.editCover(track.id)}
            aria-label="Редактировать обложку" title="Редактировать обложку" aria-haspopup="dialog"><ImagePlus size={17} /><span>Обложка</span></button>}
          <button type="button" className="button outline-button page-equalizer" onClick={props.openEqualizer} aria-label="Эквалайзер" title="Эквалайзер" aria-haspopup="dialog">
            <SlidersHorizontal size={17} /><span>Эквалайзер</span>{props.eqEnabled && <i className="enabled-dot" />}
          </button>
        </div>
      </header>
      <section aria-label="Текущий трек" className={`hero hero-style-${props.heroStyle}${track?.backdropUrl ? ' hero-wide' : ''}${!track ? ' hero-empty' : ''}`} style={{ '--hero-tone': tint } as CSSProperties}>
        {showPicture && <img className="hero-image" key={artwork} src={artwork} alt="" draggable={false} onError={(event) => { event.currentTarget.hidden = true; }} />}
        {props.heroStyle !== 'blur' && !showPicture && <div className="hero-disc" aria-hidden="true"><Artwork track={track} className="hero-disc-label" /></div>}
        <div className="hero-scrim" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-label"><Signal playing={playing} /> {track?.demo ? 'Демо-трек' : track ? 'Воспроизведение' : 'Ваша коллекция'}</div>
          <h2 title={track?.title}>{track?.title ?? 'Время для музыки'}</h2>
          <div className="hero-meta">
            {track ? <><span>{track.artist}</span><span className="hero-dot" /><span>{track.album}</span></> : <span>Добавьте аудиофайлы, чтобы начать.</span>}
          </div>
          <button type="button" className="button primary-button hero-action" onClick={track ? props.toggle : props.addMusic}>
            {track ? playing ? <Pause size={16} fill="currentColor" /> : <Play className="play-icon" size={16} fill="currentColor" /> : <Plus size={18} />}
            <span>{track ? playing ? 'Пауза' : 'Воспроизвести' : 'Добавить музыку'}</span>
          </button>
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
  addMusic(): void;
  toggleDemos(): void;
  play(id: string): void;
  playAll(tracks: Track[]): void;
  add(id: string): void;
  editCover(id: string): void;
  remove(id: string): void;
}

export function LibraryPage(props: LibraryPageProps) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term ? props.tracks.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(term)) : props.tracks;
  }, [props.tracks, search]);
  return (
    <div className="page library-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Коллекция</p><h1>Моя музыка</h1></div>
        <button type="button" className="button primary-button" onClick={props.addMusic} disabled={props.busy}><Plus size={18} /> Добавить музыку</button>
      </header>
      <div className="library-toolbar">
        <div className="library-search">
          <Search size={18} />
          <input type="search" placeholder="Трек, исполнитель, альбом…" aria-label="Поиск по медиатеке" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
          {search && <button className="icon-button" type="button" onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={16} /></button>}
        </div>
        <button className="button outline-button demo-toggle" type="button" onClick={props.toggleDemos} aria-pressed={props.showDemos} disabled={props.busy}>
          <Headphones size={16} /> <span>Демотреки</span>
        </button>
      </div>
      <div className="library-caption">
        <div><Disc3 size={16} />{trackCount(results.length)}</div>
        <button className="text-button" onClick={() => props.playAll(results)} type="button" disabled={!results.length}><Play size={14} fill="currentColor" /> Воспроизвести все</button>
      </div>
      {results.length ? <div className="track-grid library-grid">
        {results.map((track) => <TrackCard key={track.id} track={track} active={track.id === props.currentId} playing={props.playing} play={props.play} add={props.add} editCover={props.editCover} remove={props.remove} />)}
      </div> : <div className="empty-library">
        <div><Music2 size={27} /></div><h2>{search ? 'Ничего не нашлось' : 'Здесь будет ваша музыка'}</h2>
        <p>{search ? 'Попробуйте поискать по части названия или имени исполнителя.' : 'Перетащите аудиофайлы в окно или выберите их на компьютере.'}</p>
        {!search && <button type="button" className="button outline-button" onClick={props.addMusic} disabled={props.busy}><Plus size={17} /> Выбрать файлы</button>}
      </div>}
    </div>
  );
}
