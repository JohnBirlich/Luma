import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BookmarkPlus, ChevronRight, Compass, Play, Search, X } from 'lucide-react';
import { findOnlineTracks } from '../data/online';
import { useText } from '../i18n/context';
import { classifiedTracks, EDITORIAL, GENRES, hasGenre, mergeDiscoveryTracks, MOODS } from '../shared/discovery';
import type { DiscoveryCard } from '../shared/discovery';
import { musicGroups } from '../shared/mix';
import type { Track } from '../shared/media';
import type { OnlineTrack } from '../shared/online';
import { Shelf, Tile, TrackRows } from './MusicShelf';

type Rows = Pick<Parameters<typeof TrackRows>[0], 'currentId' | 'playing' | 'play'>;
interface DiscoveryProps extends Rows {
  tracks: Track[]; recent: Track[]; related: Track[];
  favorites: ReadonlySet<string>; disliked: ReadonlySet<string>;
  busy: boolean; connected: boolean; visible: boolean; initialTopic?: string;
  playAll(tracks: Track[], id?: string): boolean;
  save(title: string, tracks: readonly Track[]): boolean;
}

export function DiscoveryPreview({ tracks, open }: { tracks: Track[]; open(id?: string): void }) {
  const t = useText();
  return <Shelf title={t('Жанры и настроения')} action={<button type="button" className="text-button" onClick={() => open()}>{t('Показать все')}<ChevronRight size={15} /></button>}>
    <div className="hub-rail hub-topic-rail">{[GENRES[2], MOODS[0], GENRES[1], MOODS[2]].map((item) => {
      const matching = classifiedTracks(tracks, item.tags);
      return <Tile key={item.id} title={t(item.title)} color={item.color} symbol={item.mark} open onClick={() => open(item.id)}
        description={matching.length ? t('Треков: {0}', matching.length) : t('Открыть подборку')} />;
    })}</div>
  </Shelf>;
}

function TopicShelf({ name, detail, topics, selected, counts, open, children, limit = 6 }: {
  name: string; detail?: string; topics: readonly DiscoveryCard[]; selected?: DiscoveryCard;
  counts: ReadonlyMap<string, Track[]>; open(topic: DiscoveryCard): void; children: ReactNode; limit?: number;
}) {
  const t = useText();
  const [all, setAll] = useState(false);
  const shown = all ? topics : topics.slice(0, limit);
  const onShelf = selected && topics.some(({ id }) => id === selected.id);
  return <Shelf title={t(name)} detail={detail && t(detail)} action={topics.length > limit && <button type="button" className="text-button" aria-expanded={all}
    onClick={() => setAll(!all)}>{t(all ? 'Свернуть список' : 'Показать все')}<ChevronRight size={15} /></button>}>
    <div className="hub-rail hub-topic-rail">{shown.map((item) => {
      const matches = counts.get(item.id) ?? [];
      return <Tile key={item.id} open title={t(item.title)} description={item.detail ? t(item.detail) : matches.length ? t('Треков: {0}', matches.length) : t('Найти в каталоге')}
        symbol={item.mark} color={item.color} image={item.detail ? matches[0] : undefined} className={selected?.id === item.id ? 'topic-selected' : ''} onClick={() => open(item)} />;
    })}</div>
    {onShelf && children}
  </Shelf>;
}

function TopicDetail({ card, own, disliked, currentId, playing, play, connected, visible, busy, playAll, save, close }: Omit<DiscoveryProps,
  'tracks' | 'recent' | 'related' | 'favorites' | 'initialTopic'> & { card: DiscoveryCard; own: Track[]; close(): void }) {
  const t = useText();
  const [catalog, setCatalog] = useState<OnlineTrack[]>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [all, setAll] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const controller = useRef<AbortController>(null);
  const details = useRef<HTMLElement>(null);
  useEffect(() => {
    details.current?.scrollIntoView({ block: 'nearest' });
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!connected || !visible) {
      controller.current?.abort(); controller.current = null; setPending(false);
    }
  }, [visible, connected]);
  const tracks = useMemo(() => mergeDiscoveryTracks(own, connected ? catalog ?? [] : []).filter(({ id }) => !disliked.has(id)), [own, catalog, connected, disliked]);
  function playRow(id: string, toggleCurrent?: boolean) {
    if (toggleCurrent && id === currentId) { play(id, true); return; }
    playAll(tracks, id);
  }
  async function search() {
    if (!connected || !visible || pending) return;
    const query = controller.current = new AbortController();
    setPending(true); setError(false); setSaved(false); setSaveFailed(false);
    try {
      const items = await findOnlineTracks(card.query, 'jamendo', query.signal);
      if (!query.signal.aborted) setCatalog(items);
    } catch { if (!query.signal.aborted) setError(true); }
    finally { if (controller.current === query) { controller.current = null; setPending(false); } }
  }
  return <section className="topic-detail" ref={details} aria-label={t(card.title)}>
    <header className="hub-shelf-head"><div><p className="overline">{t('Подборка Luma')}</p><h3>{t(card.title)}</h3></div>
      <button type="button" className="icon-button" aria-label={t('Закрыть подборку')} onClick={close}><X size={17} /></button></header>
    <p>{t('Подбираем по тегам в медиатеке. При желании добавьте результаты поиска Jamendo.')}</p>
    <div className="topic-actions">
      <button type="button" className="button primary-button" disabled={!tracks.length || busy} onClick={() => playAll(tracks)}><Play size={15} />{t('Слушать подборку')}</button>
      <button type="button" className="button outline-button" disabled={!connected || pending} onClick={() => void search()}><Search size={15} />{t(pending ? 'Ищем…' : 'Найти в Jamendo')}</button>
      <button type="button" className="button outline-button" disabled={!tracks.length || busy || saved} onClick={() => {
        const ok = save(t(card.title), tracks); setSaved(ok); setSaveFailed(!ok);
      }}><BookmarkPlus size={16} />{t(saved ? 'Плейлист сохранён' : 'Сохранить как плейлист')}</button>
    </div>
    {pending && <p className="hub-note" role="status">{t('Ищем…')}</p>}
    {error && <p className="hub-error" role="alert">{t('Каталог сейчас недоступен. Повторите попытку позже.')}</p>}
    {catalog && !catalog.length && <p role="status">{t('Jamendo не вернул подходящих записей.')}</p>}
    {saveFailed && <p className="hub-error" role="alert">{t('Не удалось сохранить плейлист. Проверьте лимит плейлистов и онлайн-записей.')}</p>}
    {tracks.length ? <>
      <TrackRows tracks={all ? tracks : tracks.slice(0, 6)} play={playRow} currentId={currentId} playing={playing} credits disabled={busy} />
      {tracks.length > 6 && <button type="button" className="text-button" aria-expanded={all} onClick={() => setAll(!all)}>{t(all ? 'Свернуть список' : 'Показать все')} <ChevronRight size={15} /></button>}
    </> : <p className="hub-note">{t('В медиатеке пока нет записей с этими тегами.')}</p>}
  </section>;
}

export function Discovery(props: DiscoveryProps) {
  const t = useText();
  const [selected, setSelected] = useState(props.initialTopic);
  const { tracks, recent, related, favorites, currentId, playing, play } = props;
  const genres = useMemo(() => {
    const extra = musicGroups(tracks, 'genre', 30).filter(({ label }) => !GENRES.some(({ tags }) => hasGenre(label, tags)));
    return [...GENRES, ...extra.map(({ id, label }): DiscoveryCard => ({ id: `local:${id}`, title: label, query: label, tags: [label], color: 'blue', mark: '♪' }))];
  }, [tracks]);
  const topics = useMemo(() => [...genres, ...MOODS, ...EDITORIAL], [genres]);
  const counts = useMemo(() => new Map(topics.map((card) => [card.id, classifiedTracks(tracks, card.tags)])), [topics, tracks]);
  const topic = topics.find(({ id }) => id === selected);
  const detail = topic && <TopicDetail key={topic.id} {...props} card={topic} own={counts.get(topic.id) ?? []} close={() => setSelected(undefined)} />;
  const favoritesShelf = tracks.filter(({ id }) => favorites.has(id));
  const picks = related.length ? related : favoritesShelf.length ? favoritesShelf : recent;
  return <div className="browse-shelves">
    <section className="hub-shelf browse-intro"><div className="browse-mark"><Compass size={26} /></div>
      <div><p className="overline">{t('Обзор Luma')}</p><h2>{t('Что послушать?')}</h2>
        <p>{t('Жанры, настроения и подборки. Luma использует теги, избранное и историю только на этом устройстве, а не рекомендации или друзей VK.')}</p></div></section>
    <TopicShelf name="Подборки Luma" detail="Темы редакции, а не рейтинги VK." topics={EDITORIAL} counts={counts} selected={topic} open={(item) => setSelected(item.id)}>{detail}</TopicShelf>
    {picks.length > 0 && <Shelf title={t(related.length ? 'Похоже на недавнее' : 'Из вашей коллекции')} detail={t('По вашим прослушиваниям и отметкам в Luma.')}>
      <TrackRows tracks={picks.slice(0, 9)} currentId={currentId} playing={playing} play={play} strip />
    </Shelf>}
    <TopicShelf name="Жанры" topics={genres} counts={counts} selected={topic} open={(item) => setSelected(item.id)}>{detail}</TopicShelf>
    <TopicShelf name="Настроения и занятия" topics={MOODS} counts={counts} selected={topic} open={(item) => setSelected(item.id)}>{detail}</TopicShelf>
  </div>;
}
