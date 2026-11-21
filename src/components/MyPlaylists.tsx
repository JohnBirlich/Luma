import { useMemo, useState } from 'react';
import { ChevronRight, FileUp, ListMusic, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { MAX_PLAYLIST_TRACKS, MAX_PLAYLISTS, playlistTitle } from '../shared/luma-playlists';
import type { LumaPlaylist } from '../shared/luma-playlists';
import type { Track } from '../shared/media';
import { musicSearchKey } from '../shared/russian';
import { Shelf, Tile, TrackRows } from './MusicShelf';

interface PlaylistsProps {
  items: LumaPlaylist[]; byId: ReadonlyMap<string, Track>; collection: Track[];
  currentId: string | null; playing: boolean; busy: boolean; connected: boolean;
  play(id: string, toggleCurrent?: boolean): void; playAll(tracks: Track[], start?: string): boolean;
  save(title: string, tracks: readonly Track[], id?: string): boolean; remove(id: string): void; openImport(): void;
}

function PlaylistEditor({ playlist, source, close, save }: {
  playlist?: LumaPlaylist; source: readonly Track[]; close(): void; save(title: string, tracks: readonly Track[], id?: string): boolean;
}) {
  const t = useText();
  const [title, setTitle] = useState(playlist?.title ?? '');
  const [selected, setSelected] = useState(new Set(playlist?.trackIds));
  const [query, setQuery] = useState('');
  const [error, setError] = useState(false);
  const key = musicSearchKey(query);
  const byId = useMemo(() => new Map(source.map((track) => [track.id, track])), [source]);
  const filtered = source.filter((track) => !key || musicSearchKey(`${track.title} ${track.artist}`).includes(key));
  const chosen = [...selected].flatMap((id) => byId.get(id) ?? []);
  return <form className="playlist-editor" aria-label={t(playlist ? 'Редактировать плейлист' : 'Создать плейлист')} onSubmit={(event) => {
    event.preventDefault();
    if (save(title, chosen, playlist?.id)) close(); else setError(true);
  }}>
    <div className="playlist-fields">
      <label>{t('Название')}<input required maxLength={64} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
      <label>{t('Найти трек для плейлиста')}<input type="search" maxLength={140} value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
    </div>
    <p>{t('Выбрано: {0} из {1}', chosen.length, MAX_PLAYLIST_TRACKS)}</p>
    <div className="playlist-picker" role="group" aria-label={t('Треки плейлиста')}>
      {filtered.slice(0, 60).map((track) => <label key={track.id}>
        <input type="checkbox" checked={selected.has(track.id)} disabled={!selected.has(track.id) && chosen.length >= MAX_PLAYLIST_TRACKS} onChange={(event) => {
          const checked = event.currentTarget.checked;
          setSelected((data) => { const next = new Set(data); if (checked) next.add(track.id); else next.delete(track.id); return next; });
        }} />
        <span><strong>{track.title}</strong><small>{track.artist}{track.demo ? ` · ${t('Демо-трек')}` : ''}</small></span>
      </label>)}
      {!filtered.length && <p>{t('Нет подходящих треков.')}</p>}
    </div>
    {filtered.length > 60 && <p>{t('Показано 60 совпадений. Уточните запрос, чтобы найти нужный трек.')}</p>}
    {error && <p className="hub-error" role="alert">{t('Не удалось сохранить плейлист. Проверьте лимит плейлистов и онлайн-записей.')}</p>}
    <div className="topic-actions">
      <button type="submit" className="button primary-button" disabled={!playlistTitle(title) || !chosen.length}>{t('Сохранить плейлист')}</button>
      <button type="button" className="button outline-button" onClick={close}>{t('Отмена')}</button>
    </div>
  </form>;
}

export function MyPlaylists({ items, byId, collection, currentId, playing, busy, connected, play, playAll, save, remove, openImport }: PlaylistsProps) {
  const t = useText();
  const [active, setActive] = useState<string>();
  const [editor, setEditor] = useState<'new' | LumaPlaylist>();
  const [confirm, setConfirm] = useState(false);
  const [all, setAll] = useState(false);
  const playlist = items.find(({ id }) => id === active);
  const tracks = playlist?.trackIds.flatMap((id) => byId.get(id) ?? []) ?? [];
  const available = tracks.filter((track) => connected || !track.online);
  const editingTracks = editor && editor !== 'new' ? editor.trackIds.flatMap((id) => byId.get(id) ?? []) : [];
  const source = editor ? [...new Map([...editingTracks, ...collection].map((track) => [track.id, track])).values()] : [];
  return <Shelf title={t('Мои плейлисты')} detail={t('Списки Luma хранятся на этом устройстве.')}
    action={<div className="playlist-import-actions">
      <button type="button" className="text-button" disabled={busy || items.length >= MAX_PLAYLISTS} onClick={openImport} aria-haspopup="dialog"><FileUp size={16} />{t('Импортировать')}</button>
      <button type="button" className="text-button" disabled={busy || !collection.length || items.length >= MAX_PLAYLISTS} onClick={() => setEditor(editor === 'new' ? undefined : 'new')}><Plus size={16} />{t('Создать плейлист')}</button>
    </div>}>
    {editor && <PlaylistEditor key={editor === 'new' ? 'new' : editor.id} close={() => setEditor(undefined)} playlist={editor === 'new' ? undefined : editor} save={save} source={source} />}
    {items.length > 0 ? <div className="hub-rail hub-topic-rail">{items.map((item, index) => <Tile key={item.id} title={item.title} description={t('Треков: {0}', item.trackIds.length)}
      color={['orchid', 'aqua', 'mango', 'blue'][index % 4]} symbol="♪" image={byId.get(item.trackIds[0])} open
      className={active === item.id ? 'topic-selected' : ''} onClick={() => { setActive(item.id); setAll(false); setConfirm(false); }} />)}</div> :
      <p>{t('Создайте список из медиатеки или сохраните подборку из «Для вас».')}</p>}
    {playlist && <section className="topic-detail" aria-label={playlist.title}>
      <header className="hub-shelf-head"><h3>{playlist.title}</h3>
        <button className="icon-button" type="button" onClick={() => setActive(undefined)} aria-label={t('Закрыть плейлист')}><X size={16} /></button></header>
      <div className="topic-actions">
        <button className="button primary-button" disabled={!available.length || busy} type="button" onClick={() => playAll(available)}><Play size={15} />{t('Слушать плейлист')}</button>
        <button className="button outline-button" type="button" disabled={busy} onClick={() => setEditor(playlist)}><Pencil size={15} />{t('Редактировать плейлист')}</button>
        <button className="button outline-button" type="button" onClick={() => setConfirm(!confirm)} aria-expanded={confirm}><Trash2 size={15} />{t('Удалить плейлист')}</button>
      </div>
      {confirm && <div className="topic-actions"><p>{t('Файлы и записи в медиатеке останутся на месте.')}</p>
        <button className="button outline-button" type="button" onClick={() => { remove(playlist.id); if (editor === playlist) setEditor(undefined); setActive(undefined); setConfirm(false); }}>{t('Удалить')}</button>
      </div>}
      {tracks.length < playlist.trackIds.length && <p>{t('Недоступных записей в списке: {0}', playlist.trackIds.length - tracks.length)}</p>}
      {!connected && available.length < tracks.length && <p>{t('Для онлайн-записей в плейлисте нужна сеть.')}</p>}
      <TrackRows tracks={all ? available : available.slice(0, 8)} currentId={currentId} playing={playing} play={play} credits disabled={busy} />
      {available.length > 8 && <button className="text-button" type="button" aria-expanded={all} onClick={() => setAll(!all)}>{t(all ? 'Свернуть список' : 'Показать все')}<ChevronRight size={15} /></button>}
    </section>}
  </Shelf>;
}
