import { useText } from '../i18n/context';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, Link2, Sparkles, UserRound, ArrowRight, Disc3, Headphones, Heart, History, ImagePlus, LayoutGrid, List, ListPlus, Maximize2, MicVocal, Music2, Palette, Pause, Pencil, Play, Plus, Radio, Search, Trash2, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { connectionState, subscribeConnection } from '../data/diagnostics';
import { formatCount } from '../shared/customization';
import { musicGroups, tracksInGroup } from '../shared/mix';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import { formatTime, trackCount } from '../shared/media';
import type { OnlineTrack } from '../shared/online';
import { OnlineCredit, OnlineImport, OnlineSearch } from './OnlineMusic';
import type { CatalogSearchPreferences } from './OnlineMusic';
import { catalogQuery } from '../data/catalog-search';
import type { OnlineAction } from './OnlineMusic';
import type { Track } from '../shared/media';
import type { Appearance, LibraryLayout } from '../shared/customization';
import { musicSearchKey } from '../shared/russian';
import { Artwork } from './Artwork';
import { DislikeButton, FavoriteButton } from './FavoriteButton';
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
  disliked?: boolean;
  toggleDislike?(id: string): void;
  toggleFavorite?(id: string): void;
}

function TrackCard({ track, active, playing, row, play, add, editCover, editDetails, remove, favorite, disliked, toggleFavorite, toggleDislike }: TrackCardProps) {
  const t = useText();
  return (
    <article className={`track-card${row ? ' track-list-item' : ''}${active ? ' track-card-active' : ''}${active && playing ? ' track-card-playing' : ''}`}>
      <button type="button" className="card-play" onClick={() => play(track.id)} aria-label={`${active && playing ? t("Приостановить") : t("Воспроизвести")} ${track.title}`}>
        <div className="card-image">
          <Artwork track={track} />
          <span className="card-play-icon">{active && playing ? <Pause size={17} fill="currentColor" /> : <Play className="play-icon" size={17} fill="currentColor" />}</span>
          {add && !row && (track.demo || track.online) && <span className="card-demo">{track.online ? t("Онлайн") : t("Демо")}</span>}
        </div>
        <div className="card-text">
          <strong>{track.title}</strong>
          <small>{track.artist}{row && <span className="track-row-album"> · {track.album}</span>}{track.online && t(" · Онлайн")}</small>
        </div>
      </button>
      {add && <div className="card-details">
        <span className="track-length" title={track.album}>{!row && <>{track.album} <span aria-hidden="true">·</span> </>}{formatTime(track.duration)}</span>
        {toggleFavorite && <FavoriteButton track={track} selected={Boolean(favorite)} toggle={toggleFavorite} />}
        {toggleDislike && <DislikeButton track={track} selected={Boolean(disliked)} toggle={toggleDislike} />}
        {editDetails && !track.demo && !track.online && <button type="button" className="icon-button" onClick={() => editDetails(track.id)} title={t("Редактировать данные трека")} aria-label={t("Данные трека: {0}", track.title)} aria-haspopup="dialog"><Pencil size={15} /></button>}
        {editCover && <button type="button" className="icon-button" onClick={() => editCover(track.id)} title={t("Редактировать обложку")} aria-label={t("Обложка: {0}", track.title)} aria-haspopup="dialog"><ImagePlus size={16} /></button>}
        <button type="button" className="icon-button" onClick={() => add(track.id)} title={t("В очередь")} aria-label={t("Добавить {0} в очередь", track.title)}><ListPlus size={17} /></button>
        {remove && !track.demo && <button type="button" className="icon-button delete-button" onClick={() => remove(track.id)}
          title={track.online ? t("Убрать онлайн-ссылку") : t("Убрать из медиатеки (файл не удаляется)")} aria-label={t("Убрать {0} из медиатеки", track.title)}><Trash2 size={15} /></button>}
      </div>}
    </article>
  );
}

interface NowPlayingProps {
  track: Track | null;
  disliked: ReadonlySet<string>;
  toggleDislike(id: string): void;
  tint: string;
  appearance: Appearance;
  favorite: boolean;
  toggleFavorite(id: string): void;
  readSpectrum: ReadSpectrum;
  openAppearance(): void;
  openPresentation(): void;
  openKaraoke(): void;
  sceneVisible: boolean;
  playing: boolean;
  loading: boolean;
  position: number;
  count: number;
  toggle(): void;
  editCover(id: string): void;
  editDetails(id: string): void;
  addMusic(): void;
}

export function NowPlayingCard(props: NowPlayingProps) {
  const t = useText();
  const { track, tint, playing, appearance } = props;
  const { hero, effect, effectStrength, motion } = appearance;
  const [failedPicture, setFailedPicture] = useState<string>();
  const source = track?.backdropUrl ?? track?.artworkUrl;
  const fallback = !source || source === failedPicture;
  const artwork = fallback ? DEFAULT_ARTWORK_URL : source;
  const showPicture = !!track && effect === 'off' && (hero === 'cover' || hero === 'blur');
  const centered = hero === 'center';
  return (
    <section className="home-now" aria-labelledby="home-now-title">
      <header className="home-now-header">
        <h2 id="home-now-title">{t("Сейчас играет")}</h2>
        <div className="page-actions">
          <button type="button" className="button outline-button scene-open" onClick={props.openAppearance} aria-label={t("Оформление экрана «Сейчас играет»")} title={t("Оформление")} aria-haspopup="dialog"><Palette size={17} /></button>
          {track && !track.demo && !track.online && <button type="button" className="button outline-button track-details-button" onClick={() => props.editDetails(track.id)}
            aria-label={t("Редактировать данные трека")} title={t("Редактировать данные трека")} aria-haspopup="dialog"><Pencil size={16} /></button>}
          {track && track.online?.source !== 'broadcast' && track.online?.source !== 'audius' && <button type="button" className="button outline-button track-cover-button" onClick={() => props.editCover(track.id)}
            aria-label={t("Редактировать обложку")} title={t("Редактировать обложку")} aria-haspopup="dialog"><ImagePlus size={17} /></button>}

        </div>
      </header>
      <section aria-label={t("Текущий трек")} data-effect={effect} className={`hero hero-style-${hero}${effect !== 'off' ? ' hero-with-effect' : ''}${track?.backdropUrl && !fallback ? ' hero-wide' : ''}${!track ? ' hero-empty' : ''}`} style={{ '--hero-tone': tint, '--scene-tone': tint } as CSSProperties}>
        <SceneBackground effect={effect} tone={track ? tint : undefined} strength={effectStrength} tempo={appearance.effectTempo} animate={playing} visible={motion && props.sceneVisible} sample={appearance.audioReactive && !track?.online ? props.readSpectrum : undefined} />
        {showPicture && <img className={`hero-image${fallback ? ' hero-image-fallback' : ''}`} key={artwork} src={artwork} alt="" draggable={false}
          onError={() => { if (!fallback) setFailedPicture(source); }} />}
        {hero === 'vinyl' && <VinylRecord className="hero-disc" track={track} animate={hero === 'vinyl' && motion && playing && props.sceneVisible} />}
        <div className="hero-scrim" aria-hidden="true" />
        {centered && <Artwork track={track} className="hero-center-art" />}
        <div className="hero-content">
          <div className="hero-label"><Signal playing={playing} /> {track?.online?.source === "broadcast" ? t("Прямой эфир") : track?.demo ? t("Демо-трек") : track?.online ? t("Онлайн-трек") : track ? t("Воспроизведение") : t("Ваша коллекция")}</div>
          <h2 title={track?.title}>{track?.title ?? t("Время для музыки")}</h2>
          <div className="hero-meta">
            {track ? <><span>{track.artist}</span><span className="hero-dot" />{track.online ? <OnlineCredit track={{ online: track.online }} /> : <span>{track.album}</span>}</> : <span>{t("Добавьте аудиофайлы, чтобы начать.")}</span>}
          </div>
          <div className="hero-actions-row">
            <button type="button" className="button primary-button hero-action" aria-label={track ? props.loading ? t("Отменить загрузку") : playing ? t("Пауза") : t("Воспроизвести") : t("Добавить музыку")} onClick={track ? props.toggle : props.addMusic}>
              {track ? playing || props.loading ? <Pause size={16} fill="currentColor" /> : <Play className="play-icon" size={16} fill="currentColor" /> : <Plus size={18} />}
              <span>{track ? props.loading ? t("Отменить загрузку") : playing ? t("Пауза") : t("Воспроизвести") : t("Добавить музыку")}</span>
            </button>
            {track && <>
              <FavoriteButton track={track} selected={props.favorite} toggle={props.toggleFavorite} />
              {track.online?.source !== "broadcast" && <DislikeButton track={track} selected={props.disliked.has(track.id)} toggle={props.toggleDislike} />}
              <button type="button" className="icon-button hero-karaoke" disabled={track.online?.source === "broadcast"} onClick={props.openKaraoke} aria-label={t("Караоке")} title={t("Караоке (L)")} aria-haspopup="dialog"><MicVocal size={17} /></button>
              <button type="button" className="icon-button hero-fullscreen" onClick={props.openPresentation} aria-label={t("Развернуть текущий трек")} title={t("Во весь экран (F)")} aria-haspopup="dialog"><Maximize2 size={17} /></button>
            </>}
          </div>
        </div>
        {track && <span className="hero-index" title={t("Позиция в очереди")}><span>{formatCount(props.position, appearance.fullNumbers, t.language).padStart(2, '0')}</span><b>/</b>{formatCount(props.count, appearance.fullNumbers, t.language).padStart(2, '0')}</span>}
      </section>
    </section>
  );
}

interface LibraryPageProps extends CatalogSearchPreferences {
  visible: boolean;
  tracks: Track[];
  currentId: string | null;
  playing: boolean;
  showDemos: boolean;
  busy: boolean;
  mode: 'library' | 'search' | 'favorites' | 'recent';
  initialScope?: 'all' | 'offline';
  fullNumbers: boolean;
  favorites: ReadonlySet<string>;
  disliked: ReadonlySet<string>;
  toggleDislike(id: string): void;
  toggleFavorite(id: string): void;
  goToLibrary(): void;
  layout: LibraryLayout;
  changeLayout(layout: LibraryLayout): void;
  openHome(): void;
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
  const t = useText();
  const isLibrary = props.mode === 'library';
  const isSearch = props.mode === 'search';
  const isFavorites = props.mode === 'favorites';
  const isRecent = props.mode === 'recent';
  const connected = useSyncExternalStore(subscribeConnection, connectionState);
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
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
  const catalogTerm = isSearch ? catalogQuery(search) : '';
  const results = useMemo(() => term ? indexed.filter(({ text }) => text.includes(term)).map(({ track }) => track) : isSearch ? [] : scope, [scope, indexed, term, isSearch]);
  const isList = props.layout === 'list';
  return (
    <div className="page library-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />{isSearch ? t("Найти трек") : t("Коллекция Luma")}</p><h1>{isRecent ? t("Недавно слушали") : isFavorites ? t("Избранное") : isSearch ? t("Поиск") : t("Медиатека")}</h1></div>
        {isLibrary && <button type="button" className="button primary-button" onClick={props.addMusic} disabled={props.busy}><Plus size={18} />{" "}{t("Добавить музыку")}</button>}
      </header>
      {isRecent && <p className="recent-intro">{t("Локальные и онлайн-треки, которые играли в Luma. История хранится на устройстве.")}</p>}
      {isLibrary && <div className="collection-tabs" role="group" aria-label={t("Разделы медиатеки")}>
        <button type="button" aria-pressed={scopeId === 'all'} onClick={() => { setScope('all'); setGroupKind(undefined); setGroupId(''); }}>{t("Все треки")}{" "}<small>{formatCount(props.tracks.length, props.fullNumbers, t.language)}</small></button>
        <button type="button" aria-pressed={scopeId === 'offline'} onClick={() => setScope('offline')}>{t("Без сети")}{" "}<small>{formatCount(files.length, props.fullNumbers, t.language)}</small></button>
        <button type="button" aria-pressed={scopeId === 'online'} onClick={() => setScope('online')}>{t("Из интернета")}{" "}<small>{formatCount(online.length, props.fullNumbers, t.language)}</small></button>
      </div>}
      {isLibrary && scopeId === 'all' && !term && <div className="collection-shortcuts" aria-label={t("Каталоги медиатеки")}>
        <button type="button" onClick={props.openMixes}><span><Sparkles size={18} />{t("Микс Luma")}</span><small>{t("Подборка ваших треков")}</small></button>
        <button type="button" onClick={props.openRecent}><span><History size={18} />{t("Недавно слушали")}</span><small>{t("История на устройстве")}</small></button>
        <button type="button" onClick={props.openFavorites}><span><Heart size={18} />{t("Избранное")}</span><small>{t("Любимые треки")}</small></button>
        <button type="button" aria-pressed={groupKind === 'album'} onClick={() => { setGroupKind('album'); setGroupId(''); }}><span><Disc3 size={18} />{t("Альбомы")}</span><small>{t("Сгруппированы по тегам")}</small></button>
        <button type="button" aria-pressed={groupKind === 'artist'} onClick={() => { setGroupKind('artist'); setGroupId(''); }}><span><UserRound size={18} />{t("Исполнители")}</span><small>{t("Найти музыку артиста")}</small></button>
        <button type="button" onClick={() => setScope('online')}><span><Link2 size={18} />{t("Перенос музыки")}</span><small>{t("Добавить ссылку на запись")}</small></button>
      </div>}
      {isLibrary && scopeId === 'all' && groupKind && <label className="collection-facet">{groupKind === 'artist' ? t("Исполнитель") : t("Альбом")}
        <select aria-label={groupKind === 'artist' ? t("Исполнитель") : t("Альбом")} value={groupId} onChange={(event) => setGroupId(event.currentTarget.value)}>
          <option value="">{groupKind === 'artist' ? t("Все исполнители") : t("Все альбомы")}</option>
          {groups.map(({ id, label, count }) => <option key={id} value={id}>{label} · {formatCount(count, props.fullNumbers, t.language)}</option>)}
        </select>
      </label>}
      {isLibrary && scopeId !== 'offline' && !connected && <p className="online-offline" role="status"><CloudOff size={17} />{" "}{t("Устройство вне сети. Файлы доступны во вкладке «Без сети».")}</p>}
      {isLibrary && scopeId === 'online' && <OnlineImport disabled={props.busy} save={(track) => props.chooseOnline(track, 'save')} />}
      {isLibrary && scopeId === 'offline' && <p className="recent-intro">{t("Файлы с устройства и встроенная музыка. Онлайн-треки сюда не копируются.")}</p>}
      <div className="library-toolbar">
        <div className="library-search">
          <Search size={18} />
          <input type="search" placeholder={t("Трек, исполнитель, альбом или жанр…")} aria-label={t(isSearch ? "Поиск музыки" : "Поиск по медиатеке")} maxLength={140} value={search}
            onChange={(event) => setSearch(event.currentTarget.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
          {search && <button className="icon-button" type="button" onClick={() => setSearch('')} aria-label={t("Очистить поиск")}><X size={16} /></button>}
        </div>
        {isLibrary && scopeId !== 'online' && <button className="button outline-button demo-toggle" type="button" onClick={props.toggleDemos}
          aria-pressed={props.showDemos} aria-label={t("Демотреки")} title={t("Показать или скрыть встроенные демотреки")} disabled={props.busy}>
          <Headphones size={16} /> <span>{t("Демотреки")}</span>
        </button>}
      </div>
      {isSearch && <div className="search-scope"><span>{t(props.autoCatalogSearch ? 'Медиатека и онлайн-каталоги' : 'Поиск в медиатеке')}</span><button className="text-button" type="button" onClick={props.openHome}><Radio size={14} />{" "}{t("Вернуться на главную")}</button></div>}
      {(!isSearch || results.length > 0) && <div className="library-caption">
        <div><Disc3 size={16} />{trackCount(results.length, props.fullNumbers, t.language)}</div>
        <div className="library-actions">
          <button className="text-button library-play-all" onClick={() => props.playAll(results)} type="button" aria-label={t("Воспроизвести все")} title={t("Воспроизвести все")} disabled={!results.length}>
            <Play size={14} fill="currentColor" /> <span>{t("Воспроизвести все")}</span>
          </button>
          <div className="layout-toggle" role="group" aria-label={t("Вид медиатеки")}>
            <button className="icon-button" type="button" aria-pressed={isList} aria-label={t("Списком")} title={t("Списком")} onClick={() => props.changeLayout('list')}><List size={17} /></button>
            <button className="icon-button" type="button" aria-pressed={!isList} aria-label={t("Плиткой")} title={t("Плиткой")} onClick={() => props.changeLayout('grid')}><LayoutGrid size={16} /></button>
          </div>
        </div>
      </div>}
      {results.length ? <div className={isList ? 'track-list' : 'track-grid library-grid'}>
        {results.map((track) => <TrackCard key={track.id} track={track} active={track.id === props.currentId} playing={props.playing} row={isList}
          play={props.play} add={props.add} editCover={props.editCover} editDetails={props.editDetails} remove={props.remove} favorite={props.favorites.has(track.id)} toggleFavorite={props.toggleFavorite} disliked={props.disliked.has(track.id)} toggleDislike={props.toggleDislike} />)}
      </div> : isSearch && term ? <p className="search-local-empty">{t("В медиатеке нет совпадений.")}</p> : !isSearch && <div className="empty-library">
        <div>{isRecent ? <History size={27} /> : isFavorites ? <Heart size={27} /> : scopeId === 'online' ? <Cloud size={27} /> : <Music2 size={27} />}</div><h2>{term ? t("Ничего не нашлось") : isRecent ? t("История пока пуста") : isFavorites ? t("Сохраните любимые треки") : scopeId === 'online' ? t("Нет сохранённых онлайн-треков") : t("Здесь будет ваша музыка")}</h2>
        <p>{term ? t("Попробуйте поискать по части названия или имени исполнителя.") : isRecent ? t("Прослушанные треки появятся здесь, если в настройках включена история.") : isFavorites ? t("Нажмите на сердце рядом с треком или на экране «Сейчас играет».") : scopeId === 'online' ? t("Найдите запись в онлайн-поиске или вставьте ссылку Openverse выше.") : t("Перетащите аудиофайлы в окно или выберите их на компьютере.")}</p>
        {!term && (isFavorites || isRecent ? <button type="button" className="button outline-button" onClick={props.goToLibrary}>{t("Открыть медиатеку")}{" "}<ArrowRight size={16} /></button>
          : scopeId === 'online' ? <button type="button" className="button outline-button" onClick={props.openSearch}>{t("Открыть поиск")}{" "}<Search size={16} /></button>
          : <button type="button" className="button outline-button" onClick={props.addMusic} disabled={props.busy}><Plus size={17} />{" "}{t("Выбрать файлы")}</button>)}
      </div>}
      {isSearch && <OnlineSearch key={catalogTerm} query={search} visible={props.visible && !composing} saved={saved} disabled={props.busy} choose={props.chooseOnline}
        autoCatalogSearch={props.autoCatalogSearch} changeAutoCatalogSearch={props.changeAutoCatalogSearch} />}
    </div>
  );
}
