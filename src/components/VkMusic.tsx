import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, CloudOff, ImagePlus, Link2, ListMusic, LogIn, Play, Plus, Radio, RotateCw, Search, Trash2, X } from 'lucide-react';
import { useVkArtwork } from '../data/vk-artwork';
import { recordDiagnostic } from '../data/diagnostics';
import { MAX_VK_PLAYLISTS, readVkShelf, saveVkShelf } from '../data/vk-playlists';
import { editorialPlaylist, isVkPlaylist, parseVkPlaylist, parseVkShareLink, vkPlaylistKey, vkPlaylistShareUrl, vkShelfUrl, vkWidgetUrl, VK_MUSIC_URL, VK_WIDGET_DOCS_URL } from '../shared/vk';
import type { NamedVkPlaylist, VkShelfItem } from '../shared/vk';
import { playlistCoverKey } from '../shared/artwork';
import type { CoverTarget } from '../shared/artwork';
import { musicSearchKey } from '../shared/russian';
import { Artwork } from './Artwork';

const editorialKey = vkPlaylistKey(editorialPlaylist);

function VkLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <>
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => {
      if (!window.luma) return;
      event.preventDefault();
      setFailed(false);
      void window.luma.openVkLink(href).catch(() => setFailed(true));
    }}>{children}</a>
    {failed && <span className="vk-link-error" role="alert">Не удалось запустить браузер. Откройте <code>{href}</code> вручную.</span>}
  </>;
}

export function VkBrowserLink() {
  return <VkLink href={VK_MUSIC_URL} className="button vk-account-open"><LogIn size={17} /> Войти в VK в браузере <ArrowUpRight size={15} /></VkLink>;
}

function VkAccount() {
  return <details className="vk-native-account">
    <summary><LogIn size={16} /> Доступ к аккаунту VK</summary>
    <p>«Моя музыка», «Для вас» и VK Микс доступны на сайте VK после входа. Luma не встраивает страницу входа, не запрашивает пароль и не переносит личную библиотеку.</p>
    <VkBrowserLink />
  </details>;
}

function VkFrame({ playlist }: { playlist: NamedVkPlaylist }) {
  type Status = 'loading' | 'timeout' | 'error' | 'loaded';
  const [status, setStatus] = useState<Status>('loading');
  const when = useRef(performance.now());
  const state = useRef<Status>('loading');
  function finish(next: Exclude<Status, 'loading'>) {
    if (state.current === 'loaded' || (next !== 'loaded' && state.current !== 'loading')) return;
    state.current = next;
    recordDiagnostic(next === 'loaded' ? 'vk.loaded' : next === 'error' ? 'vk.frameError' : 'vk.timeout', { ms: performance.now() - when.current });
    setStatus(next);
  }
  useEffect(() => {
    recordDiagnostic('vk.loading');
    const timer = window.setTimeout(() => finish('timeout'), 9000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="vk-frame-stage" aria-busy={status === 'loading'}>
      {status !== 'loaded' && <div className="vk-frame-placeholder" role="status">
        <Radio size={27} />
        <strong>{status === 'timeout' ? 'VK пока не ответил' : status === 'error' ? 'Не удалось загрузить виджет VK' : 'Загружаем плейлист из VK'}</strong>
        <span>{status === 'loading' ? 'Воспроизведение идёт через официальный плеер.' : 'Попробуйте обновить виджет или открыть плейлист в браузере.'}</span>
      </div>}
      <iframe className={`vk-frame${status === 'loaded' ? ' vk-frame-loaded' : ''}`} src={vkWidgetUrl(playlist)}
        title={`Плейлист VK: ${playlist.name}`} sandbox="allow-scripts allow-same-origin" allow="autoplay; encrypted-media"
        referrerPolicy="no-referrer" tabIndex={status === 'loaded' ? undefined : -1} onLoad={() => finish('loaded')} onError={() => finish('error')} />
    </div>
  );
}

interface VkMusicPageProps {
  covers: ReadonlyMap<string, string>;
  editCover(target: CoverTarget): void;
  discardCover(key: string): void;
  widgetOpen: boolean;
  connected: boolean;
  toggleWidget(open: boolean): void;
}

export function VkMusicPage({ covers, editCover, discardCover, widgetOpen, connected, toggleWidget }: VkMusicPageProps) {
  const [shelf, setShelf] = useState(readVkShelf);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const playlists: VkShelfItem[] = [editorialPlaylist, ...shelf.playlists];
  const selected = playlists.find((playlist) => vkPlaylistKey(playlist) === shelf.selected) ?? editorialPlaylist;
  const widget = isVkPlaylist(selected) ? selected : undefined;
  const selectedIsEditorial = vkPlaylistKey(selected) === editorialKey;
  const currentCoverKey = playlistCoverKey(vkPlaylistKey(selected));
  const automatic = useVkArtwork(connected ? widget : undefined, attempt);
  const original = widget && automatic.get(vkPlaylistShareUrl(widget));
  const selectedArt = covers.get(currentCoverKey) ?? original;
  const filtered = playlists.filter((item) => musicSearchKey(item.name).includes(musicSearchKey(query)));
  useEffect(() => { saveVkShelf(shelf); }, [shelf]);

  function addPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const embed = parseVkPlaylist(code);
    const share = parseVkShareLink(code);
    const data = embed ?? share;
    if (!data) { setError('Нужна прямая ссылка на плейлист VK или код из официального генератора виджетов.'); return; }
    const key = vkPlaylistKey(data);
    const existing = shelf.playlists.find((item) => vkPlaylistKey(item) === key);
    if (key !== editorialKey && !existing && shelf.playlists.length >= MAX_VK_PLAYLISTS) {
      setError('Список заполнен. Уберите один из сохранённых плейлистов и попробуйте снова.'); return;
    }
    const item: VkShelfItem = { ownerId: data.ownerId, playlistId: data.playlistId,
      hash: embed?.hash ?? existing?.hash, shareKey: share?.shareKey ?? existing?.shareKey,
      name: name.trim() || existing?.name || `Плейлист ${data.playlistId}` };
    toggleWidget(false);
    setShelf({ selected: key, playlists: key === editorialKey ? shelf.playlists : existing
      ? shelf.playlists.map((playlist) => vkPlaylistKey(playlist) === key ? item : playlist) : [...shelf.playlists, item] });
    setShowForm(false); setQuery(''); setCode(''); setName(''); setError('');
  }

  function removePlaylist(key: string) {
    if (key === shelf.selected) toggleWidget(false);
    discardCover(playlistCoverKey(key));
    setShelf((previous) => ({ selected: previous.selected === key ? editorialKey : previous.selected,
      playlists: previous.playlists.filter((item) => vkPlaylistKey(item) !== key) }));
  }

  return <div className="page vk-page">
    <header className="page-header"><div><p className="overline page-kicker"><span />Сервисы Luma</p><h1>VK Музыка</h1></div>
      <button type="button" className="button primary-button vk-add" aria-expanded={showForm} aria-controls={showForm ? 'vk-playlist-form' : undefined}
        onClick={() => { setShowForm((value) => !value); setError(''); }}>{showForm ? <X size={17} /> : <Plus size={17} />} {showForm ? 'Закрыть' : 'Импорт VK'}</button>
    </header>
    {showForm && <form id="vk-playlist-form" className="vk-playlist-form vk-native-form" onSubmit={addPlaylist}>
      <p>Ссылку можно сохранить как закладку. Чтобы слушать доступные записи внутри Luma, вставьте код из <VkLink className="vk-form-link" href={VK_WIDGET_DOCS_URL}>генератора VK <ArrowUpRight size={13} /></VkLink>.</p>
      <label>Название <span>необязательно</span><input value={name} maxLength={70} placeholder="Например, Вечерний микс" onChange={(event) => setName(event.currentTarget.value)} /></label>
      <label htmlFor="vk-widget-code">Ссылка на плейлист или код виджета</label>
      <textarea id="vk-widget-code" required maxLength={8192} rows={2} value={code} placeholder="https://vk.ru/music/playlist/… или VK.Widgets.Playlist(…)"
        aria-invalid={Boolean(error)} aria-describedby={error ? 'vk-form-error' : undefined} spellCheck={false} onChange={(event) => { setCode(event.currentTarget.value); setError(''); }} />
      {error && <p id="vk-form-error" className="vk-form-error" role="alert">{error}</p>}
      <button className="button primary-button" type="submit">Сохранить плейлист</button>
    </form>}
    <section className="vk-native-spotlight" aria-labelledby="vk-playlist-title">
      <Artwork imageUrl={selectedArt} className="vk-playlist-cover" />
      <div className="vk-spotlight-copy">
        <p className="overline">{selectedIsEditorial ? 'Подборка редакции VK' : 'Коллекция VK в Luma'}</p>
        <h2 id="vk-playlist-title" title={selected.name}>{selected.name}</h2>
        <p>{widget ? 'Доступные записи воспроизводит официальный виджет, а не встроенная страница сайта.' : 'Ссылка сохранена в Luma. Для воспроизведения плейлиста откройте плейлист в VK или добавьте код виджета.'}</p>
        <div className="vk-spotlight-actions">
          {widget && <button className="button primary-button" type="button" disabled={!connected && !widgetOpen} onClick={() => toggleWidget(!widgetOpen)} aria-expanded={widgetOpen}>
            {widgetOpen ? <X size={16} /> : <Play size={16} fill="currentColor" />} {widgetOpen ? 'Закрыть виджет' : 'Слушать в виджете VK'}</button>}
          <VkLink href={vkShelfUrl(selected)} className="button outline-button vk-original">Плейлист в VK <ArrowUpRight size={16} /></VkLink>
          <button type="button" className="icon-button vk-cover-button" title="Обложка плейлиста" aria-label="Редактировать обложку плейлиста" aria-haspopup="dialog"
            onClick={() => editCover({ key: currentCoverKey, title: selected.name, kind: 'playlist', originalUrl: original })}><ImagePlus size={17} /></button>
        </div>
      </div>
    </section>
    {!connected && <p className="online-offline" role="status"><CloudOff size={17} /> Устройство вне сети. Закладки VK сохранены, для воспроизведения нужна сеть.</p>}
    {widgetOpen && widget && <section className="vk-panel" aria-label="Официальный плеер плейлиста VK">
      <VkFrame key={`${shelf.selected}:${widget.hash}:${attempt}`} playlist={widget} />
      <footer className="vk-panel-footer"><span>Доступ проверяет VK. Виджет и очереди Luma управляются отдельно.</span>
        <button className="icon-button" type="button" onClick={() => setAttempt((value) => value + 1)} aria-label="Обновить виджет VK" title="Обновить виджет VK"><RotateCw size={17} /></button>
      </footer>
    </section>}
    <section className="vk-native-shelf" aria-labelledby="vk-shelf-title">
      <header className="section-header"><div><p className="overline">Сохранено в Luma</p><h2 id="vk-shelf-title">Плейлисты VK</h2></div><ListMusic size={21} /></header>
      <div className="library-search"><Search size={17} /><input aria-label="Поиск по плейлистам VK" type="search" placeholder="Название плейлиста…" value={query} maxLength={70} onChange={(event) => setQuery(event.currentTarget.value)} /></div>
      <ul className="vk-playlists native-playlist-grid">
        {filtered.map((playlist) => {
          const key = vkPlaylistKey(playlist);
          const art = covers.get(playlistCoverKey(key)) ?? (isVkPlaylist(playlist) ? automatic.get(vkPlaylistShareUrl(playlist)) : undefined);
          return <li className="vk-playlist-row" key={key}>
            <button className="vk-playlist-item" type="button" aria-pressed={key === shelf.selected} onClick={() => {
              if (key !== shelf.selected) toggleWidget(false);
              setShelf((previous) => ({ ...previous, selected: key }));
            }}>
              <Artwork imageUrl={art} className="vk-shelf-cover" />
              <span><strong>{playlist.name}</strong><small>{playlist.hash ? 'Виджет VK' : <><Link2 size={12} /> Ссылка</>}</small></span>
            </button>
            {key !== editorialKey && <button className="icon-button vk-remove" type="button" onClick={() => removePlaylist(key)} aria-label={`Убрать ${playlist.name} из списка`}><Trash2 size={15} /></button>}
          </li>;
        })}
      </ul>
      {!filtered.length && <p className="online-message">Среди сохранённых плейлистов ничего не найдено.</p>}
    </section>
    <VkAccount />
  </div>;
}

export function VkModeBar({ closeWidget }: { closeWidget(): void }) {
  return <footer className="player-bar vk-mode-bar" aria-label="Источник воспроизведения">
    <div className="vk-mode-label"><Radio size={19} /><span><strong>VK Музыка</strong><small>Управление в официальном виджете</small></span></div>
    <button className="button outline-button" type="button" onClick={closeWidget}><X size={17} /> Закрыть виджет</button>
  </footer>;
}
