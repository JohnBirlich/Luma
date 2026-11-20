import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, Bookmark, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { MAX_VK_PLAYLISTS, readVkShelf, saveVkShelf } from '../data/vk-playlists';
import { useText } from '../i18n/context';
import { playlistCoverKey } from '../shared/artwork';
import type { CoverTarget } from '../shared/artwork';
import { editorialPlaylist, parseVkPlaylist, parseVkShareLink, VK_MUSIC_URL, vkPlaylistKey, vkShelfUrl } from '../shared/vk';
import type { VkShelfItem } from '../shared/vk';
import { Artwork } from './Artwork';

export function VkExternalLink({ href, children, className = 'text-button' }: { href: string; children: ReactNode; className?: string }) {
  const t = useText();
  const [failed, setFailed] = useState(false);
  return <><a className={className} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => {
    if (!window.luma) return;
    event.preventDefault();
    setFailed(false);
    void window.luma.openVkLink(href).catch(() => setFailed(true));
  }}>{children}<ArrowUpRight size={14} aria-hidden="true" /></a>
    {failed && <span className="hub-error" role="status">{t('Не удалось открыть ссылку.')}</span>}
  </>;
}

const editorialKey = vkPlaylistKey(editorialPlaylist);
export interface BookmarkProps {
  covers: ReadonlyMap<string, string>;
  editCover(target: CoverTarget): void;
  discardCover(key: string): void;
}
export function VkBookmarks({ covers, editCover, discardCover }: BookmarkProps) {
  const t = useText();
  const [shelf, setShelf] = useState(readVkShelf);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [cleanup, setCleanup] = useState<{ busy: boolean; notice?: string }>({ busy: false });
  useEffect(() => { saveVkShelf(shelf); }, [shelf]);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const share = parseVkShareLink(value);
    const widget = share ? null : parseVkPlaylist(value);
    const parsed = share ?? widget;
    if (!parsed) { setError('Нужна прямая ссылка на плейлист VK или код из официального генератора виджетов.'); return; }
    const key = vkPlaylistKey(parsed);
    const stored = shelf.playlists.find((item) => vkPlaylistKey(item) === key);
    if (key !== editorialKey && !stored && shelf.playlists.length >= MAX_VK_PLAYLISTS) {
      setError('Список заполнен. Уберите один из сохранённых плейлистов и попробуйте снова.'); return;
    }
    const item: VkShelfItem = { ownerId: parsed.ownerId, playlistId: parsed.playlistId,
      shareKey: share?.shareKey ?? stored?.shareKey, hash: widget?.hash ?? stored?.hash,
      name: name.trim() || stored?.name || t('Плейлист {0}', parsed.playlistId) };
    setShelf({ selected: key, playlists: key === editorialKey ? shelf.playlists : stored
      ? shelf.playlists.map((row) => vkPlaylistKey(row) === key ? item : row) : [...shelf.playlists, item] });
    setValue(''); setName(''); setError(''); setOpen(false);
  }
  function remove(key: string) {
    discardCover(playlistCoverKey(key));
    setShelf((data) => ({ selected: data.selected === key ? editorialKey : data.selected,
      playlists: data.playlists.filter((row) => vkPlaylistKey(row) !== key) }));
  }
  return <section className="hub-shelf hub-bookmarks" aria-labelledby="vk-bookmarks-title">
    <header className="hub-shelf-head"><h2 id="vk-bookmarks-title"><Bookmark size={17} />{t('Закладки VK')}</h2>
      <button type="button" className="text-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="vk-bookmark-form"><Plus size={16} />{t('Импорт VK')}</button>
    </header>
    <p>{t('Плейлисты — это закладки. Вход VK ID не даёт доступ к аудиотеке: прямое воспроизведение требует отдельного разрешения VK.')}</p>
    {open && <form id="vk-bookmark-form" className="hub-bookmark-form" onSubmit={add}>
      <label>{t('Название')}<input value={name} maxLength={70} onChange={(event) => setName(event.currentTarget.value)} placeholder={t('Например, Вечерний микс')} /></label>
      <label>{t('Ссылка на плейлист или код виджета')}<textarea rows={2} required maxLength={8192} value={value} onChange={(event) => { setValue(event.currentTarget.value); setError(''); }} placeholder="https://vk.ru/music/playlist/…" /></label>
      {error && <p className="hub-error" role="alert">{t(error)}</p>}
      <button type="submit" className="button outline-button">{t('Сохранить плейлист')}</button>
    </form>}
    <ul className="hub-bookmark-list">{[editorialPlaylist, ...shelf.playlists].map((playlist) => {
      const key = vkPlaylistKey(playlist);
      const cover = playlistCoverKey(key);
      return <li key={key}>
        <Artwork imageUrl={covers.get(cover)} lazy />
        <span className="hub-bookmark-name">{key === editorialKey ? t('Пример плейлиста VK') : playlist.name}</span>
        <VkExternalLink href={vkShelfUrl(playlist)}>{t('Открыть в VK')}</VkExternalLink>
        <button type="button" className="icon-button" aria-label={t('Редактировать обложку плейлиста')} onClick={() => editCover({ key: cover, title: playlist.name, kind: 'playlist' })}><ImagePlus size={16} /></button>
        {key !== editorialKey && <button type="button" className="icon-button" aria-label={t('Убрать {0} из списка', playlist.name)} onClick={() => remove(key)}><Trash2 size={16} /></button>}
      </li>;
    })}</ul>
    <div className="hub-topline">
      <VkExternalLink href={VK_MUSIC_URL}>{t('Официальный сайт VK')}</VkExternalLink>
      {window.luma && <button className="text-button vk-cleanup" type="button" disabled={cleanup.busy} onClick={async () => {
        setCleanup({ busy: true });
        try { await window.luma?.clearLegacyVkSession(); setCleanup({ busy: false, notice: 'Данные старого сеанса VK удалены.' }); }
        catch { setCleanup({ busy: false, notice: 'Не удалось очистить данные входа VK.' }); }
      }}>{t('Удалить старые данные входа VK')}</button>}
    </div>
    {cleanup.notice && <p role="status">{t(cleanup.notice)}</p>}
  </section>;
}
