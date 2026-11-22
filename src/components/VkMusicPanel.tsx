import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowUpRight, Headphones, Link2, ListMusic, Play, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { useEmbedViewport } from '../player/useEmbedViewport';
import { editorialPlaylist, parseVkPlaylist, VK_WIDGET_DOCS_URL, VK_WIDGET_FRAME_NAME, vkPlaylistUrl, vkWidgetUrl } from '../shared/vk';
import type { VkPlaylist } from '../shared/vk';
import { SourceLink } from './OnlineMusic';
import './vk-music.css';

interface Props {
  playlist?: VkPlaylist;
  connected: boolean;
  available: boolean;
  open(playlist: VkPlaylist): void;
  close(): void;
}

export function VkMusicPanel({ playlist, connected, available, open, close }: Props) {
  const t = useText(), id = useId();
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const visiblePlaylist = available ? playlist : undefined;
  const src = visiblePlaylist && vkWidgetUrl(visiblePlaylist);
  const viewport = useEmbedViewport(src, close);
  const exampleOpen = src === vkWidgetUrl(editorialPlaylist);
  const title = exampleOpen ? t('Сегодня в плеере') : src ? t('Ваш плейлист VK') : t('Виджет плейлиста VK');
  const page = vkPlaylistUrl(visiblePlaylist ?? editorialPlaylist);

  function show(selection: VkPlaylist) {
    setInputError(false);
    setLinkError(false);
    if (vkWidgetUrl(selection) === src) viewport.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    else open(selection);
  }

  function openPlaylistPage(event: MouseEvent<HTMLAnchorElement>) {
    if (!window.luma) return;
    event.preventDefault();
    setLinkError(false);
    void window.luma.musicLinks.openBrowser(page).catch(() => setLinkError(true));
  }

  return <section className="vk-music-room" aria-labelledby={`${id}-title`}>
    <header className="vk-music-head">
      <div className="vk-music-title">
        <span aria-hidden="true" className="vk-music-mark"><Headphones size={23} /></span>
        <div><p className="overline">{t('Официальный виджет')}</p><h2 id={`${id}-title`}>{t('VK Музыка')}</h2></div>
      </div>
      <span className="vk-music-limit">{t('Первые 5 треков')}</span>
    </header>
    <div className="vk-music-grid">
      <section className="hub-shelf vk-widget-card" aria-label={t('Виджет плейлиста VK')}>
        <header className="vk-widget-head"><div>
          <h3>{title}</h3><p className="hub-note">{t('В окне Luma · Отдельно от аудиоочереди')}</p>
        </div>{src && <button type="button" className="icon-button vk-widget-stop" aria-label={t('Закрыть виджет VK')}
          title={t('Закрыть виджет VK')} onClick={() => { close(); viewport.current?.focus({ preventScroll: true }); }}><X size={17} /></button>}</header>
        <div className="vk-widget-viewport" ref={viewport} tabIndex={-1} role="group" aria-label={t('Виджет плейлиста VK')}>
          {src ? <iframe key={src} className="vk-widget-frame" name={VK_WIDGET_FRAME_NAME} title={title} src={src} sandbox="allow-scripts allow-same-origin"
            allow="encrypted-media" referrerPolicy="no-referrer" /> : <div className="vk-music-poster">
            <ListMusic size={31} aria-hidden="true" />
            <strong>{t(connected ? 'Выберите плейлист' : 'Нет подключения к интернету')}</strong>
            <p>{t(connected ? 'Откройте подборку редакции или вставьте свой код виджета.' : 'Для виджета VK нужна сеть.')}</p>
          </div>}
        </div>
        <footer className="vk-widget-foot">
          <p className="hub-note">{t(src ? 'Нажмите ▶ в виджете. Если трек недоступен, откройте плейлист на VK.'
            : 'VK разрешает слушать в виджете первые пять композиций. Доступ проверяет сам VK.')}</p>
          <a className="vk-music-link vk-full-playlist" href={page} onClick={openPlaylistPage} target="_blank" rel="noopener noreferrer">
            {t('Весь плейлист на VK')} <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          {linkError && <p className="hub-note" role="alert">{t('Не удалось открыть ссылку.')}</p>}
        </footer>
      </section>
      <section className="hub-shelf vk-widget-picker" aria-labelledby={`${id}-choose`}>
        <div><h3 id={`${id}-choose`}>{t('Плейлисты VK')}</h3><p className="hub-note">{t('Без входа в аккаунт через Luma и без покупки.')}</p></div>
        <button type="button" className="vk-widget-example" disabled={!available} onClick={() => show(editorialPlaylist)} aria-current={exampleOpen ? 'true' : undefined}>
          <span className="vk-example-icon"><Play size={15} fill="currentColor" aria-hidden="true" /></span>
          <span><strong>{t('Сегодня в плеере')}</strong><small>{t('Подборка редакции VK')}</small></span>
        </button>
        <form className="vk-widget-form" onSubmit={(event) => {
          event.preventDefault();
          if (!available) return;
          const value = parseVkPlaylist(input);
          if (!value) { setInputError(true); return; }
          setInput('');
          show(value);
        }}>
          <label htmlFor={`${id}-code`}>{t('Код или ссылка виджета VK')}</label>
          <textarea id={`${id}-code`} rows={3} maxLength={8192} required spellCheck={false} autoComplete="off"
            placeholder="VK.Widgets.Playlist(…)" value={input} aria-invalid={inputError || undefined}
            aria-describedby={`${id}-hint${inputError ? ` ${id}-error` : ''}`}
            onChange={(event) => { setInput(event.currentTarget.value); setInputError(false); }} />
          <p className="hub-note" id={`${id}-hint`}>
            {t('Обычной ссылки на плейлист недостаточно. Нужен код из генератора VK.')}{' '}
            <SourceLink url={VK_WIDGET_DOCS_URL} className="vk-music-link">{t('Генератор VK')} <ArrowUpRight size={13} aria-hidden="true" /></SourceLink>
          </p>
          {inputError && <p className="vk-widget-error" id={`${id}-error`} role="alert">{t('Не удалось распознать официальный код или ссылку виджета VK.')}</p>}
          <button type="submit" className="button outline-button" disabled={!available}><Link2 size={15} aria-hidden="true" />{t('Загрузить в плеер')}</button>
        </form>
      </section>
    </div>
    <p className="hub-note vk-widget-privacy">{t('VK загружается только после выбора плейлиста. Luma не читает аккаунт VK и не сохраняет введённый код.')}</p>
  </section>;
}
