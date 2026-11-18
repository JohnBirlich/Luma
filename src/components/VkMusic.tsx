import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, AudioLines, Disc3, ImagePlus, ListMusic, Plus, Radio, RotateCw, Trash2, X } from 'lucide-react';
import { MAX_VK_PLAYLISTS, readVkShelf, saveVkShelf } from '../data/vk-playlists';
import { editorialPlaylist, parseVkPlaylist, vkPlaylistKey, vkPlaylistUrl, vkWidgetUrl, VK_MUSIC_URL, VK_WIDGET_DOCS_URL } from '../shared/vk';
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

function VkFrame({ playlist }: { playlist: NamedVkPlaylist }) {
  const [status, setStatus] = useState<'loading' | 'timeout' | 'loaded'>('loading');
  useEffect(() => {
    const timer = window.setTimeout(() => setStatus((value) => value === 'loading' ? 'timeout' : value), 9000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="vk-frame-stage" aria-busy={status === 'loading'}>
      {status !== 'loaded' && <div className="vk-frame-placeholder" role="status">
        <Radio size={27} />
        <strong>{status === 'timeout' ? 'VK пока не ответил' : 'Загружаем плейлист из VK'}</strong>
        <span>{status === 'timeout' ? 'Попробуйте обновить виджет или открыть плейлист в браузере.' : 'Воспроизведение идёт через официальный плеер.'}</span>
      </div>}
      <iframe className={`vk-frame${status === 'loaded' ? ' vk-frame-loaded' : ''}`} src={vkWidgetUrl(playlist)}
        title={`Плейлист VK: ${playlist.name}`} sandbox="allow-scripts allow-same-origin" allow="autoplay; encrypted-media"
        referrerPolicy="no-referrer" tabIndex={status === 'loaded' ? undefined : -1} onLoad={() => setStatus('loaded')} onError={() => setStatus('timeout')} />
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
  const selectedArt = covers.get(currentCoverKey);
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
    setAttempt((value) => value + 1);
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
        <VkLink href={VK_MUSIC_URL} className="button outline-button vk-open-music">Открыть VK <ArrowUpRight size={16} /></VkLink>
      </header>
      <p className="vk-intro">Слушайте плейлисты VK в официальном виджете. Для всей коллекции и поиска откройте VK в браузере.</p>
      <div className="vk-layout">
        <section className="vk-panel" aria-labelledby="vk-playlist-title">
          <header className="vk-panel-header">
            {selectedArt ? <Artwork imageUrl={selectedArt} seed={currentCoverKey} className="vk-playlist-cover" /> : <div className="vk-emblem" aria-hidden="true">VK</div>}
            <div className="vk-panel-title">
              <p className="overline">{selectedIsEditorial ? 'Подборка редакции VK' : 'Ваш плейлист'}</p>
              <h2 id="vk-playlist-title" title={selected.name}>{selected.name}</h2>
            </div>
            <div className="vk-panel-actions">
              <button type="button" className="icon-button vk-cover-button" title="Обложка плейлиста" aria-label="Редактировать обложку плейлиста" aria-haspopup="dialog"
                onClick={() => editCover({ key: currentCoverKey, title: selected.name, kind: 'playlist' })}><ImagePlus size={16} /></button>
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
              const art = covers.get(playlistCoverKey(key));
              return <li className="vk-playlist-row" key={key}>
                <button className="vk-playlist-item" type="button" aria-pressed={key === shelf.selected}
                  onClick={() => setShelf((previous) => ({ ...previous, selected: key }))}>
                  {art ? <Artwork imageUrl={art} seed={key} className="vk-shelf-cover" /> :
                    <span className="vk-playlist-mark">{key === editorialKey ? <AudioLines size={18} /> : <ListMusic size={18} />}</span>}
                  <span><strong>{playlist.name}</strong><small>{key === editorialKey ? 'Подборка VK' : 'Сохранён у вас'}</small></span>
                </button>
                {key !== editorialKey && <button className="icon-button vk-remove" type="button" onClick={() => removePlaylist(key)}
                  aria-label={`Убрать ${playlist.name} из списка`} title="Убрать из списка Luma"><Trash2 size={15} /></button>}
              </li>;
            })}
          </ul>
          {!showForm && <p className="vk-shelf-tip">Добавляйте доступные плейлисты по коду виджета. Пароли и токены в Luma вводить не нужно.</p>}
        </aside>
      </div>
    </div>
  );
}

export function VkModeBar({ goToPlayer }: { goToPlayer(): void }) {
  return (
    <footer className="player-bar vk-mode-bar" aria-label="Источник воспроизведения">
      <div className="vk-mode-label"><Radio size={19} /><span><strong>VK Музыка</strong><small>Управление звуком — в виджете VK</small></span></div>
      <button className="button outline-button" type="button" onClick={goToPlayer}><Disc3 size={17} /> Локальный плеер</button>
    </footer>
  );
}
