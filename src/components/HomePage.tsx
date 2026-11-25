import { memo, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AudioLines, ChevronRight, Headphones, Link2, ListEnd, Play, Plus, Search, Settings2, X } from 'lucide-react';
import { useText } from '../i18n/context';
import type { Track } from '../shared/media';
import type { VkCollection } from '../shared/vk-site';
import { makeMix } from '../shared/mix';
import type { MixType } from '../shared/mix';
import { HUB_QUEUE_LIMIT, hubMusic } from '../shared/music-hub';
import type { OnlineTrack } from '../shared/online';
import { musicSearchKey, searchWords } from '../shared/russian';
import { SearchHistory } from './SearchHistory';
import type { SearchHistoryProps } from './SearchHistory';
import { OnlineSearch } from './OnlineMusic';
import type { CatalogSearchPreferences } from './OnlineMusic';
import { catalogQuery } from '../data/catalog-search';
import type { OnlineAction } from './OnlineMusic';
import { Shelf, Tile, TrackRows } from './MusicShelf';
import { Discovery } from './Discovery';
import { MyPlaylists } from './MyPlaylists';
import type { LumaPlaylist } from '../shared/luma-playlists';
import { SceneBackground } from './SceneBackground';

import { RadioStations } from './RadioStations';
import type { RadioBrowserStation } from '../shared/radio-browser';
import { VkSitePanel } from './VkSitePanel';
import { VkHistoryRows } from './VkHistory';
import type { VkHistoryActions } from './VkHistory';
import type { VkHistoryEntry } from '../shared/vk-history';
import type { VkSiteController } from '../player/useVkSite';

// The strip only keeps music: radio opens from the sidebar shortcut and updates
// live in Settings, where the release screen already belongs.
const TABS = { home: 'Для вас', mine: 'Моя музыка', vk: 'VK Музыка' } as const;
export type HomeTab = keyof typeof TABS | 'radio';
interface HomeProps extends CatalogSearchPreferences, SearchHistoryProps {
  tab: HomeTab;
  query: string;
  selectTab(tab: HomeTab): void;
  setQuery(value: string): void;
  nowPlaying: ReactNode;
  lyrics: ReactNode;
  tracks: Track[];
  recent: Track[];
  vkRecent: readonly VkHistoryEntry[];
  openRecent(): void;
  openVkRecent?(url: string): void;
  vkActions?: VkHistoryActions;
  /** VK Music playback for the mix and «Собрано в Luma» tiles, once the VK account is signed in. */
  playVkCollection?(kind: VkCollection, name?: string): Promise<boolean>;
  stationIds: ReadonlySet<string>;
  saveStation(id: string): void;
  tuneDiscoveredStation(station: RadioBrowserStation): void;
  loading: boolean;
  openVkTopic?(kind: VkCollection, name?: string): Promise<boolean>;
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
  playCatalog(tracks: Track[], start?: string): boolean;
  playlists: LumaPlaylist[];
  playlistTracks: ReadonlyMap<string, Track>;
  savePlaylist(title: string, tracks: readonly Track[], existingId?: string): boolean;
  removePlaylist(id: string): void;
  openPlaylistImport(): void;
  openMusicLink(): void;
  vkSite?: VkSiteController;
  searchVk?(query: string): void;
  closeVk(): void;
  sharePlaylist(title: string, tracks: readonly Track[]): void;
  seedFavorites(tracks: readonly Track[]): void;
  openFavorites(): void;
  chooseOnline(track: OnlineTrack, action: OnlineAction): void;
  openLibrary(): void;
  addMusic(): void;
}

export const HomePage = memo(function HomePage(props: HomeProps) {
  const t = useText();
  const { tracks, recent, disliked, favorites, saved, visible, connected, currentId, playing, play, playMix, addMusic, openLibrary, playCatalog } = props;
  const { tab, query, setQuery, selectTab, vkSite, closeVk } = props;
  const vkTab = tab === 'vk';
  const [composing, setComposing] = useState(false);
  const [tune, setTune] = useState(false);
  const [mixType, setMixType] = useState<MixType>('library');
  const [justFiles, setJustFiles] = useState(false);
  const formInput = useRef<HTMLInputElement>(null);
  const data = useMemo(() => hubMusic(tracks, recent, disliked, !connected || justFiles, favorites), [tracks, recent, disliked, connected, justFiles, favorites]);
  const discoveryTracks = useMemo(() => [...data.personal, ...data.demos], [data]);
  const sources = data.personal.length ? data.personal : data.demos;
  const demoMix = !data.personal.length && data.demos.length > 0;
  const mine = useMemo(() => tracks.filter(({ demo }) => !demo), [tracks]);
  const searchIndex = useMemo(() => tracks.map((track) => ({ track,
    text: musicSearchKey([track.title, track.artist, track.album, ...(track.genres ?? [])].join(' ')) })), [tracks]);
  const term = musicSearchKey(query);
  const catalogTerm = catalogQuery(query);
  const found = useMemo(() => {
    if (!term) return [];
    const words = searchWords(term);
    const result: Track[] = [];
    for (const { track, text } of searchIndex) {
      if (words.length && words.every((word) => text.includes(word))) result.push(track);
      if (result.length >= 30) break;
    }
    return result;
  }, [term, searchIndex]);
  const favoriteOptions = sources.some(({ id }) => favorites.has(id));
  const mixReady = mixType === 'favorites' ? favoriteOptions : mixType === 'recent' ? !!data.history.length : !!sources.length;
  const rows = { play, playAll: playCatalog, currentId, playing };

  /** VK first, Luma's own mix only when VK has nothing to start. */
  function playVkOr(kind: VkCollection, fallback: () => void) {
    if (!props.playVkCollection) { fallback(); return; }
    void props.playVkCollection(kind).then((ok) => { if (!ok) fallback(); });
  }
  function mix(type: MixType) {
    playMix(makeMix(sources, { type, favorites, recent: data.history, offline: !connected || justFiles, disliked,
      seed: Math.floor(Math.random() * (2 ** 32)) }));
  }
  return <div className={`page home-page${vkTab && vkSite?.view ? ' home-page-vk' : ''}`}>
    <header className="hub-masthead">
      {!vkTab && <div className="hub-heading"><div>
        <p className="overline page-kicker"><span />{t('Ваша коллекция')}</p>
        <h1>{t('Главная')}</h1>
      </div><div className="hub-search"><Search size={18} aria-hidden="true" /><input ref={formInput} type="search" aria-label={t('Поиск музыки')} placeholder={t('Поиск музыки')} maxLength={140} value={query}
        onKeyDown={(event) => { if (event.key === 'Enter' && !composing && !event.nativeEvent.isComposing) props.rememberSearch(query); }}
        onChange={(event) => setQuery(event.currentTarget.value)} onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)} />{query && <button type="button" className="icon-button" aria-label={t('Очистить поиск')} onClick={() => { setQuery(''); formInput.current?.focus(); }}><X size={14} /></button>}</div></div>}
      <div className="hub-topline"><nav aria-label={t('Разделы на главной')} className="hub-tabs">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((id) => <button type="button" key={id} data-home-tab={id} aria-current={tab === id && !term ? 'page' : undefined} onClick={() => selectTab(id)}>{t(TABS[id])}</button>)}
      </nav><div className="hub-top-actions">
        <button type="button" className="icon-button" disabled={props.busy} onClick={addMusic}
          aria-label={t('Добавить музыку')} title={t('Добавить музыку (Ctrl+O)')}><Plus size={18} aria-hidden="true" /></button>
        <button type="button" className="icon-button" data-playlist-import aria-haspopup="dialog" disabled={props.busy} onClick={props.openPlaylistImport}
          aria-label={t('Импорт из сервисов')} title={t('Импорт из сервисов')}><ListEnd size={18} aria-hidden="true" /></button>
        <button type="button" className="icon-button" data-open-music-link aria-haspopup="dialog" onClick={props.openMusicLink}
          aria-label={t('Открыть музыкальную ссылку')} title={t('Открыть музыкальную ссылку')}><Link2 size={17} /></button>
      </div></div>
    </header>
    {!vkTab && <SearchHistory history={props.searchHistory} select={(value) => { setQuery(value); props.rememberSearch(value); formInput.current?.focus(); }} clear={props.clearSearchHistory} />}
    {term ? <OnlineSearch key={catalogTerm} query={query} visible={visible && !composing} saved={saved} disabled={props.busy} choose={props.chooseOnline}
      library={found} playLibrary={(id) => play(id, true)} remember={props.rememberSearch} searchVk={props.searchVk}
      renderLibrary={(items) => items.length > 0 || !found.length ? <Shelf title={t('В вашей медиатеке')}>
        {items.length ? <TrackRows {...rows} playAll={undefined} play={(id) => { props.rememberSearch(query); play(id, true); }} tracks={items} />
          : <p className="hub-note">{t('В медиатеке нет совпадений.')}</p>}
      </Shelf> : null}
      autoCatalogSearch={props.autoCatalogSearch} changeAutoCatalogSearch={props.changeAutoCatalogSearch} /> : <>
      {tab === 'home' && <>
        <div className="hub-lead">{props.nowPlaying}<section className="hub-hero" aria-labelledby="hub-mix-title">
          <SceneBackground effect="mix-flow" strength={1} animate={props.motion} visible={visible && props.motion} />
          <div className="hub-hero-inner"><p className="overline hub-hero-kicker"><AudioLines size={14} /> {t('Музыка Luma')} <span /> {demoMix ? t('Демоколлекция') : t('На этом устройстве')}</p>
            <h2 id="hub-mix-title">{t('Слушать микс Luma')}</h2>
            <p>{props.playVkCollection ? t('Микс VK по вашим вкусам — играет здесь, в Luma.')
              : demoMix ? t('Попробуйте плеер на встроенной коллекции.') : t('Подборка из вашей музыки, избранного и истории.')}</p>
            <div className="hub-hero-controls">
              <button type="button" className="hub-hero-play" onClick={() => playVkOr('mix', () => mix(mixType))} disabled={props.busy || (!props.playVkCollection && !mixReady)} aria-label={t('Слушать микс Luma')}><Play size={22} fill="currentColor" /></button>
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
        </section></div>
        {props.lyrics}
        <Shelf title={t('Мои треки')} detail={!mine.length && data.demos.length ? t('Пока здесь встроенные демотреки.') : undefined} action={<button type="button" className="text-button" onClick={() => selectTab('mine')}>{t('Показать все')}<ChevronRight size={15} /></button>}>
          {(mine.length || data.demos.length) ? <TrackRows {...rows} tracks={(mine.length ? mine : data.demos).slice(0, 9)} strip />
            : <p className="hub-note">{t('Добавьте аудиофайлы, чтобы начать.')}</p>}
        </Shelf>
        <Shelf title={t('Собрано в Luma')} detail={t('Подборки без передачи истории на сервер.')}>
          <div className="hub-rail hub-mix-rail">
            <Tile title={t('Для вас')} description={props.playVkCollection ? t('Микс Luma для вас') : demoMix ? t('Демоколлекция') : t('По вашим прослушиваниям')} color="blue"
              onClick={() => playVkOr('for-you', () => mix('library'))} disabled={props.busy || (!props.playVkCollection && !sources.length)} />
            <Tile title={t('Открытия')} description={props.playVkCollection ? t('Новинки Luma') : t('Ещё не звучали')} color="orchid"
              onClick={() => playVkOr('new', () => playMix(data.discoveries.slice(0, HUB_QUEUE_LIMIT)))} disabled={props.busy || (!props.playVkCollection && !data.discoveries.length)} />
            <Tile title={t('Недавнее')} description={props.playVkCollection ? t('История Luma') : t('Снова в очереди')} color="aqua"
              onClick={() => playVkOr('recent', () => mix('recent'))} disabled={props.busy || (!props.playVkCollection && !data.history.length)} />
            <Tile title={t('Избранное')} description={props.playVkCollection ? t('Избранное в Luma') : t('Треки, отмеченные сердцем')} color="rose"
              onClick={() => playVkOr('favorites', () => mix('favorites'))} disabled={props.busy || (!props.playVkCollection && !favoriteOptions)} />
          </div>
        </Shelf>
        {props.vkRecent.length > 0 && <Shelf title={t('Недавно в VK Музыке')}
          action={<button type="button" className="text-button" onClick={props.openRecent}>{t('Вся история')}<ChevronRight size={15} /></button>}>
          <VkHistoryRows entries={props.vkRecent.slice(0, 4)} open={props.openVkRecent} actions={props.vkActions} />
        </Shelf>}
        <Discovery tracks={discoveryTracks} recent={data.history} related={data.related} seed={data.seed} favorites={favorites} disliked={disliked}
          {...rows} busy={props.busy} visible={visible} connected={connected} playAll={props.playCatalog} save={props.savePlaylist}
          openVkTopic={props.openVkTopic ? (kind, name) => props.openVkTopic!(kind, name) : undefined} />
      </>}
      {tab === 'mine' && <>
        <MyPlaylists items={props.playlists} byId={props.playlistTracks} collection={tracks} {...rows} busy={props.busy}
          connected={connected} playAll={props.playCatalog} save={props.savePlaylist} remove={props.removePlaylist} openImport={props.openPlaylistImport}
          share={props.sharePlaylist} seedFavorites={props.seedFavorites} openFavorites={props.openFavorites} />
        <Shelf title={t('Мои треки')} action={<button type="button" className="text-button" onClick={openLibrary}>{t('Медиатека')}<ChevronRight size={15} /></button>}>
          {mine.length ? <TrackRows {...rows} tracks={mine.slice(0, 24)} /> : <p className="hub-note">{t('Добавьте аудиофайлы, чтобы начать.')}</p>}
        </Shelf>
        {!mine.length && data.demos.length > 0 && <Shelf title={t('Демоколлекция')}><TrackRows {...rows} tracks={data.demos} strip /></Shelf>}
      </>}
      {tab === 'radio' && <RadioStations saved={props.stationIds} activeId={currentId} loading={props.loading} playing={playing} busy={props.busy}
        connected={connected} toggleSave={props.saveStation} play={play} tuneDiscovered={props.tuneDiscoveredStation} />}
      {tab === 'vk' && <VkSitePanel controller={vkSite} connected={connected} close={closeVk} />}
    </>}
    {!vkTab && <footer className="hub-footer"><Headphones size={14} />{t('Для миксов Luma не нужен аккаунт.')}</footer>}
  </div>;
});
