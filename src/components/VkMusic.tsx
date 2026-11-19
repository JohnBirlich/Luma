import { useText } from '../i18n/context';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, CloudOff, ImagePlus, Link2, ListMusic, LogIn, MonitorPlay, Play, Plus, Radio, RotateCw, Search, Trash2, X } from 'lucide-react';
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
  const t = useText();
  const [failed, setFailed] = useState(false);
  return <>
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => {
      if (!window.luma) return;
      event.preventDefault();
      setFailed(false);
      void window.luma.openVkLink(href).catch(() => setFailed(true));
    }}>{children}</a>
    {failed && <span className="vk-link-error" role="alert">{t("Не удалось запустить браузер. Откройте")}{" "}<code>{href}</code>{" "}{t("вручную.")}</span>}
  </>;
}

function VkWebsiteAction({ href, open, connected, kind }: {
  href: string; open(url: string): void; connected: boolean; kind: 'account' | 'playlist';
}) {
  const t = useText();
  return <button className="button primary-button" type="button" disabled={!connected} onClick={() => open(href)}>
    <MonitorPlay size={17} /> {kind === 'account' ? t("Открыть сайт VK в Luma") : t("Слушать на сайте VK")}
  </button>;
}

function VkAccount({ openWebsite, connected }: { openWebsite(url: string): void; connected: boolean }) {
  const t = useText();
  return <section className="vk-native-account" aria-labelledby="vk-account-title">
    <div className="vk-account-icon"><LogIn size={21} aria-hidden="true" /></div>
    <div className="vk-account-copy"><p className="overline">{t("Ваш аккаунт VK")}</p><h2 id="vk-account-title">{t("Моя музыка и плейлисты")}</h2>
      <p>{window.luma
        ? t("Войдите на официальной странице VK внутри Luma. Вход сохраняется. Личная музыка, миксы и рекомендации остаются на стороне VK и не доступны в очереди Luma.")
        : t("В веб-превью доступен публичный виджет. Личная музыка открывается на официальной странице внутри приложения Windows.")}</p>
    </div>
    {window.luma && <div className="vk-account-actions"><VkWebsiteAction href={VK_MUSIC_URL} open={openWebsite} connected={connected} kind="account" /></div>}
  </section>;
}

function VkFrame({ playlist }: { playlist: NamedVkPlaylist }) {
  const t = useText();
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
        <strong>{status === 'timeout' ? t("VK пока не ответил") : status === 'error' ? t("Не удалось загрузить виджет VK") : t("Загружаем плейлист из VK")}</strong>
        <span>{status === 'loading' ? t("Воспроизведение идёт через официальный плеер.") : t("Попробуйте обновить виджет или открыть его на странице VK в приложении Windows.")}</span>
      </div>}
      <iframe className={`vk-frame${status === 'loaded' ? ' vk-frame-loaded' : ''}`} src={vkWidgetUrl(playlist)}
        title={t("Плейлист VK: {0}", playlist.name)} sandbox="allow-scripts allow-same-origin" allow="autoplay; encrypted-media"
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
  openWebsite(url: string): void;
}

export function VkMusicPage({ covers, editCover, discardCover, widgetOpen, connected, toggleWidget, openWebsite }: VkMusicPageProps) {
  const t = useText();
  const [shelf, setShelf] = useState(readVkShelf);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
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
    if (!data) { setError(t("Нужна прямая ссылка на плейлист VK или код из официального генератора виджетов.")); return; }
    const key = vkPlaylistKey(data);
    const existing = shelf.playlists.find((item) => vkPlaylistKey(item) === key);
    if (key !== editorialKey && !existing && shelf.playlists.length >= MAX_VK_PLAYLISTS) {
      setError(t("Список заполнен. Уберите один из сохранённых плейлистов и попробуйте снова.")); return;
    }
    const item: VkShelfItem = { ownerId: data.ownerId, playlistId: data.playlistId,
      hash: embed?.hash ?? existing?.hash, shareKey: share?.shareKey ?? existing?.shareKey,
      name: name.trim() || existing?.name || t("Плейлист {0}", data.playlistId) };
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
    <header className="page-header"><div><p className="overline page-kicker"><span />{t("Сервисы Luma")}</p><h1>{t("VK Музыка")}</h1></div>
      <button type="button" className="button primary-button vk-add" aria-expanded={showForm} aria-controls={showForm ? 'vk-playlist-form' : undefined}
        onClick={() => { setShowForm((value) => !value); setError(''); }}>{showForm ? <X size={17} /> : <Plus size={17} />} {showForm ? t("Закрыть") : t("Импорт VK")}</button>
    </header>
    <VkAccount openWebsite={openWebsite} connected={connected} />
    {showForm && <form id="vk-playlist-form" className="vk-playlist-form vk-native-form" onSubmit={addPlaylist}>
      <p>{t("Сохраните ссылку из «Поделиться» и открывайте плейлист в VK. Для публичного предпросмотра можно добавить код из")}{" "}<VkLink className="vk-form-link" href={VK_WIDGET_DOCS_URL}>{t("генератора VK")}{" "}<ArrowUpRight size={13} /></VkLink>.</p>
      <label>{t("Название")}{" "}<span>{t("необязательно")}</span><input value={name} maxLength={70} placeholder={t("Например, Вечерний микс")} onChange={(event) => setName(event.currentTarget.value)} /></label>
      <label htmlFor="vk-widget-code">{t("Ссылка на плейлист или код виджета")}</label>
      <textarea id="vk-widget-code" required maxLength={8192} rows={2} value={code} placeholder={t("https://vk.ru/music/playlist/… или VK.Widgets.Playlist(…)")}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'vk-form-error' : undefined} spellCheck={false} onChange={(event) => { setCode(event.currentTarget.value); setError(''); }} />
      {error && <p id="vk-form-error" className="vk-form-error" role="alert">{error}</p>}
      <button className="button primary-button" type="submit">{t("Сохранить плейлист")}</button>
    </form>}
    <section className="vk-native-spotlight" aria-labelledby="vk-playlist-title">
      <Artwork imageUrl={selectedArt} className="vk-playlist-cover" />
      <div className="vk-spotlight-copy">
        <p className="overline">{selectedIsEditorial ? t("Подборка редакции VK") : t("Коллекция VK в Luma")}</p>
        <h2 id="vk-playlist-title" title={selected.name}>{selected.name}</h2>
        <p>{widget ? t("Полный плейлист открывается в VK. В публичном виджете доступна только часть записей.") : t("Сохранена ссылка. Доступ к музыке и закрытым плейлистам проверяет VK в вашем аккаунте.")}</p>
        <div className="vk-spotlight-actions">
          {window.luma && <VkWebsiteAction key={vkPlaylistKey(selected)} href={vkShelfUrl(selected)} open={openWebsite} connected={connected} kind="playlist" />}
          {widget && <button className={`button ${window.luma ? 'outline-button' : 'primary-button'} vk-widget-toggle`} type="button" disabled={!connected && !widgetOpen} onClick={() => toggleWidget(!widgetOpen)} aria-expanded={widgetOpen}>
            {widgetOpen ? <X size={16} /> : <Play size={16} fill="currentColor" />} {widgetOpen ? t("Закрыть виджет") : t("Публичный виджет")}</button>}
          <button type="button" className="button outline-button vk-copy" onClick={() => {
            void navigator.clipboard.writeText(vkShelfUrl(selected)).then(() => setCopyStatus(t("Ссылка скопирована.")), () => setCopyStatus(t("Не удалось скопировать ссылку.")));
          }}><Link2 size={16} />{" "}{t("Скопировать ссылку")}</button>
          <button type="button" className="icon-button vk-cover-button" title={t("Обложка плейлиста")} aria-label={t("Редактировать обложку плейлиста")} aria-haspopup="dialog"
            onClick={() => editCover({ key: currentCoverKey, title: selected.name, kind: 'playlist', originalUrl: original })}><ImagePlus size={17} /></button>
        </div>
        {copyStatus && <small className="vk-copy-status" role="status">{copyStatus}</small>}
      </div>
    </section>
    {!connected && <p className="online-offline" role="status"><CloudOff size={17} />{" "}{t("Устройство вне сети. Закладки VK сохранены, для воспроизведения нужна сеть.")}</p>}
    {widgetOpen && widget && <section className="vk-panel" aria-label={t("Официальный плеер плейлиста VK")}>
      <VkFrame key={`${shelf.selected}:${widget.hash}:${attempt}`} playlist={widget} />
      <footer className="vk-panel-footer"><span>{t("Виджет не использует данные входа. Полная версия — на сайте VK внутри Luma.")}</span>
        <button className="icon-button" type="button" onClick={() => setAttempt((value) => value + 1)} aria-label={t("Обновить виджет VK")} title={t("Обновить виджет VK")}><RotateCw size={17} /></button>
      </footer>
    </section>}
    <section className="vk-native-shelf" aria-labelledby="vk-shelf-title">
      <header className="section-header"><div><p className="overline">{t("Сохранено в Luma")}</p><h2 id="vk-shelf-title">{t("Плейлисты VK")}</h2></div><ListMusic size={21} /></header>
      <div className="library-search"><Search size={17} /><input aria-label={t("Поиск по плейлистам VK")} type="search" placeholder={t("Название плейлиста…")} value={query} maxLength={70} onChange={(event) => setQuery(event.currentTarget.value)} /></div>
      <ul className="vk-playlists native-playlist-grid">
        {filtered.map((playlist) => {
          const key = vkPlaylistKey(playlist);
          const art = covers.get(playlistCoverKey(key)) ?? (isVkPlaylist(playlist) ? automatic.get(vkPlaylistShareUrl(playlist)) : undefined);
          return <li className="vk-playlist-row" key={key}>
            <button className="vk-playlist-item" type="button" aria-pressed={key === shelf.selected} onClick={() => {
              if (key !== shelf.selected) { toggleWidget(false); setCopyStatus(''); }
              setShelf((previous) => ({ ...previous, selected: key }));
            }}>
              <Artwork imageUrl={art} className="vk-shelf-cover" />
              <span><strong>{playlist.name}</strong><small>{playlist.hash ? t("Виджет VK") : <><Link2 size={12} />{" "}{t("Ссылка")}</>}</small></span>
            </button>
            {key !== editorialKey && <button className="icon-button vk-remove" type="button" onClick={() => removePlaylist(key)} aria-label={t("Убрать {0} из списка", playlist.name)}><Trash2 size={15} /></button>}
          </li>;
        })}
      </ul>
      {!filtered.length && <p className="online-message">{t("Среди сохранённых плейлистов ничего не найдено.")}</p>}
    </section>
  </div>;
}

export function VkModeBar({ closeWidget, website }: { closeWidget(): void; website?: boolean }) {
  const t = useText();
  return <footer className="player-bar vk-mode-bar" aria-label={t("Источник воспроизведения")}>
    <div className="vk-mode-label"><Radio size={19} /><span><strong>{t("VK Музыка")}</strong><small>{t("Управление")}{" "}{website ? t("на сайте VK") : t("в официальном виджете")}</small></span></div>
    <button className="button outline-button" type="button" onClick={closeWidget}><X size={17} /> {website ? t("Закрыть сайт VK") : t("Закрыть виджет")}</button>
  </footer>;
}
