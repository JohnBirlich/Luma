import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, AudioLines, Disc3, Heart, ImagePlus, LogIn, Plus, Radio, RotateCw, Sparkles, Trash2, X } from 'lucide-react';
import { useVkArtwork } from '../data/vk-artwork';
import { recordDiagnostic } from '../data/diagnostics';
import { MAX_VK_PLAYLISTS, readVkShelf, saveVkShelf } from '../data/vk-playlists';
import { editorialPlaylist, parseVkPlaylist, vkPlaylistKey, vkPlaylistShareUrl, vkPlaylistUrl, vkWidgetUrl, VK_MUSIC_URL, VK_WIDGET_DOCS_URL } from '../shared/vk';
import type { NamedVkPlaylist } from '../shared/vk';
import { playlistCoverKey } from '../shared/artwork';
import type { CoverTarget } from '../shared/artwork';
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
    {failed && <span className="vk-link-error" role="alert">Не удалось открыть браузер. Скопируйте адрес ссылки.</span>}
  </>;
}

function VkAccount() {
  const desktop = window.luma;
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  async function open() {
    if (!desktop || opening) return;
    setOpening(true);
    setFailed(false);
    try { await desktop.openVkWebsite(); }
    catch { setFailed(true); }
    finally { setOpening(false); }
  }

  return <section className="vk-account" aria-labelledby="vk-account-title">
    <div className="vk-account-decoration" aria-hidden="true"><AudioLines /></div>
    <div className="vk-account-copy">
      <p className="overline">Официальная страница VK</p>
      <h2 id="vk-account-title">Ваша музыка в VK</h2>
      <p>Войдите в аккаунт на сайте VK и откройте свою коллекцию, рекомендации или VK Микс. Вход и воспроизведение остаются на стороне VK.</p>
      <ul aria-label="Разделы на сайте VK"><li><Heart size={14} /> Моя музыка</li><li><Sparkles size={14} /> Для вас</li><li><Radio size={14} /> VK Микс</li></ul>
      <div className="vk-account-actions">
        {desktop ? <><button type="button" className="button vk-account-open" disabled={opening} onClick={() => void open()}><LogIn size={17} />{opening ? 'Открываем VK…' : 'Войти или открыть VK Музыку'}</button>
          <VkLink href={VK_MUSIC_URL} className="text-button">В браузере <ArrowUpRight size={15} /></VkLink></>
          : <VkLink href={VK_MUSIC_URL} className="button vk-account-open"><LogIn size={17} /> Войти или открыть VK Музыку <ArrowUpRight size={15} /></VkLink>}
      </div>
      {failed && <p className="vk-link-error" role="alert">Не удалось открыть отдельное окно VK. Попробуйте открыть его в браузере.</p>}
    </div>
  </section>;
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
}

export function VkMusicPage({ covers, editCover, discardCover }: VkMusicPageProps) {
  const [shelf, setShelf] = useState(readVkShelf);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const playlists = [editorialPlaylist, ...shelf.playlists];
  const selected = playlists.find((playlist) => vkPlaylistKey(playlist) === shelf.selected) ?? editorialPlaylist;
  const selectedIsEditorial = vkPlaylistKey(selected) === editorialKey;
  const currentCoverKey = playlistCoverKey(vkPlaylistKey(selected));
  const automatic = useVkArtwork(selected, attempt);
  const original = automatic.get(vkPlaylistShareUrl(selected));
  const selectedArt = covers.get(currentCoverKey) ?? original;
  useEffect(() => { saveVkShelf(shelf); }, [shelf]);

  function addPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = parseVkPlaylist(code);
    if (!data) {
      setError('Вставьте код из официального генератора VK. Обычной ссылки на плейлист недостаточно.');
      return;
    }
    const key = vkPlaylistKey(data);
    const existing = shelf.playlists.find((item) => vkPlaylistKey(item) === key);
    if (key !== editorialKey && !existing && shelf.playlists.length >= MAX_VK_PLAYLISTS) {
      setError('Список заполнен. Уберите один из сохранённых плейлистов и попробуйте снова.');
      return;
    }
    const item = { ...data, name: name.trim() || existing?.name || `Плейлист ${data.playlistId}` };
    setShelf({
      selected: key,
      playlists: key === editorialKey ? shelf.playlists : existing
        ? shelf.playlists.map((playlist) => vkPlaylistKey(playlist) === key ? item : playlist)
        : [...shelf.playlists, item],
    });
    setShowForm(false);
    setCode('');
    setName('');
    setError('');
  }

  function removePlaylist(key: string) {
    discardCover(playlistCoverKey(key));
    setShelf((previous) => ({
      selected: previous.selected === key ? editorialKey : previous.selected,
      playlists: previous.playlists.filter((item) => vkPlaylistKey(item) !== key),
    }));
  }

  return (
    <div className="page vk-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Онлайн-источник</p><h1>VK Музыка</h1></div>
      </header>
      <VkAccount />
      <h2 className="vk-widgets-heading">Плейлисты в виджетах</h2>
      <div className="vk-layout">
        <section className="vk-panel" aria-labelledby="vk-playlist-title">
          <header className="vk-panel-header">
            <Artwork imageUrl={selectedArt} className="vk-playlist-cover" />
            <div className="vk-panel-title">
              <p className="overline">{selectedIsEditorial ? 'Подборка редакции VK' : 'Ваш плейлист'}</p>
              <h2 id="vk-playlist-title" title={selected.name}>{selected.name}</h2>
            </div>
            <div className="vk-panel-actions">
              <button type="button" className="icon-button vk-cover-button" title="Обложка плейлиста" aria-label="Редактировать обложку плейлиста" aria-haspopup="dialog"
                onClick={() => editCover({ key: currentCoverKey, title: selected.name, kind: 'playlist', originalUrl: original })}><ImagePlus size={16} /></button>
              <VkLink href={vkPlaylistUrl(selected)} className="text-button vk-original">Плейлист в VK <ArrowUpRight size={16} /></VkLink>
            </div>
          </header>
          <VkFrame key={`${shelf.selected}:${selected.hash}:${attempt}`} playlist={selected} />
          <footer className="vk-panel-footer">
            <span>Виджет VK даёт прослушать до пяти треков. Если VK просит войти или не загружается, откройте плейлист в браузере.</span>
            <button className="icon-button" type="button" onClick={() => setAttempt((value) => value + 1)} aria-label="Обновить виджет VK" title="Обновить виджет VK"><RotateCw size={17} /></button>
          </footer>
        </section>
        <aside className="vk-shelf" aria-labelledby="vk-shelf-title">
          <header className="vk-shelf-header">
            <div><p className="overline">VK Музыка</p><h2 id="vk-shelf-title">Плейлисты</h2></div>
            <button className="icon-button vk-add" type="button" aria-expanded={showForm} aria-controls="vk-playlist-form"
              aria-label={showForm ? 'Закрыть добавление плейлиста' : 'Добавить плейлист VK'} title={showForm ? 'Закрыть' : 'Добавить плейлист'}
              onClick={() => { setShowForm((value) => !value); setError(''); }}>{showForm ? <X size={19} /> : <Plus size={19} />}</button>
          </header>
          {showForm && <form id="vk-playlist-form" className="vk-playlist-form" onSubmit={addPlaylist}>
            <p>Вставьте ссылку на ваш плейлист в <VkLink className="vk-form-link" href={VK_WIDGET_DOCS_URL}>генератор VK <ArrowUpRight size={13} /></VkLink>, затем скопируйте оттуда код виджета.</p>
            <label>Название <span>необязательно</span><input value={name} maxLength={70} placeholder="Например, Вечерний микс" onChange={(event) => setName(event.currentTarget.value)} /></label>
            <label htmlFor="vk-widget-code">Код виджета VK</label>
            <textarea id="vk-widget-code" required maxLength={8192} rows={3} value={code} placeholder="VK.Widgets.Playlist(…)"
              aria-invalid={Boolean(error)} aria-describedby={error ? 'vk-form-error' : undefined} spellCheck={false}
              onChange={(event) => { setCode(event.currentTarget.value); setError(''); }} />
            {error && <p id="vk-form-error" className="vk-form-error" role="alert">{error}</p>}
            <button className="button primary-button" type="submit">Сохранить плейлист</button>
          </form>}
          <ul className="vk-playlists">
            {playlists.map((playlist) => {
              const key = vkPlaylistKey(playlist);
              const art = covers.get(playlistCoverKey(key)) ?? automatic.get(vkPlaylistShareUrl(playlist));
              return <li className="vk-playlist-row" key={key}>
                <button className="vk-playlist-item" type="button" aria-pressed={key === shelf.selected}
                  onClick={() => setShelf((previous) => ({ ...previous, selected: key }))}>
                  <Artwork imageUrl={art} className="vk-shelf-cover" />
                  <span><strong>{playlist.name}</strong><small>{key === editorialKey ? 'Подборка VK' : 'Сохранён у вас'}</small></span>
                </button>
                {key !== editorialKey && <button className="icon-button vk-remove" type="button" onClick={() => removePlaylist(key)}
                  aria-label={`Убрать ${playlist.name} из списка`} title="Убрать из списка Luma"><Trash2 size={15} /></button>}
              </li>;
            })}
          </ul>
          {!showForm && <p className="vk-shelf-tip">Плейлисты добавляются по коду виджета. В настольном Luma обложка открытого плейлиста загружается, если VK отдаёт её публично.</p>}
        </aside>
      </div>
    </div>
  );
}

export function VkModeBar({ goToPlayer }: { goToPlayer(): void }) {
  return (
    <footer className="player-bar vk-mode-bar" aria-label="Источник воспроизведения">
      <div className="vk-mode-label"><Radio size={19} /><span><strong>VK Музыка</strong><small>Воспроизведение — на сайте или в виджете VK</small></span></div>
      <button className="button outline-button" type="button" onClick={goToPlayer}><Disc3 size={17} /> Локальный плеер</button>
    </footer>
  );
}
