import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, AudioLines, Globe2, LockKeyhole, Pause, Play, RotateCw, SkipBack, SkipForward, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { readMusicLink } from '../shared/music-links';
import { VK_MUSIC_URL } from '../shared/vk';
import type { VkBounds, VkSiteAction, VkSiteState } from '../shared/vk-site';
import './vk-site.css';

const initial: VkSiteState = { phase: 'loading', host: '', back: false };
let nextView = 0;

function BrowserLink({ url, compact = false }: { url: string; compact?: boolean }) {
  const t = useText();
  const [failed, setFailed] = useState(false);
  const label = t('Открыть в браузере');
  return <><a href={url} className={compact ? 'icon-button' : 'button outline-button'} aria-label={label} title={label}
    target="_blank" rel="noopener noreferrer" onClick={(event) => {
    if (!window.luma) return;
    event.preventDefault();
    void window.luma.musicLinks.openBrowser(url).catch(() => setFailed(true));
  }}>{!compact && label} <ArrowUpRight size={15} aria-hidden="true" /></a>{failed && <small role="status">{t('Не удалось открыть ссылку.')}</small>}</>;
}

function showBounds(slot: HTMLElement, pane: Element): VkBounds | null {
  const box = slot.getBoundingClientRect(), clip = pane.getBoundingClientRect();
  const x = Math.max(box.left, clip.left, 0), y = Math.max(box.top, clip.top, 0);
  const width = Math.min(box.right, clip.right, innerWidth) - x, height = Math.min(box.bottom, clip.bottom, innerHeight) - y;
  return width >= 170 && height >= 82 ? { x, y, width, height } : null;
}

/** The VK site has its own renderer/session. This React panel contains only trusted controls. */
function SiteView({ url, close }: { url: string; close(): void }) {
  const t = useText();
  const api = window.luma?.vkSite;
  const slot = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const view = useRef<number>(0);
  const [state, setState] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const [commandError, setCommandError] = useState(false);
  useLayoutEffect(() => {
    const node = slot.current, pane = node?.closest('.main-pane');
    if (!api || !node || !pane) return;
    const id = view.current = ++nextView;
    let frame = 0;
    let last = '';
    let live = true;
    const unsubscribe = api.onState((current, next) => {
      if (!live || current !== id) return;
      if (next.phase === 'closed') { close(); return; }
      setState(next);
    });
    const layout = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const bounds = showBounds(node, pane);
        const key = JSON.stringify(bounds);
        if (key !== last) { last = key; void api.layout(id, bounds).catch(() => {}); }
      });
    };
    const resize = new ResizeObserver(layout);
    const observer = new IntersectionObserver(layout, { root: pane });
    resize.observe(node); resize.observe(pane); observer.observe(node);
    window.addEventListener('resize', layout);
    pane.addEventListener('scroll', layout, { passive: true });
    node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    closeButton.current?.focus({ preventScroll: true });
    const bounds = showBounds(node, pane);
    setState(initial); setCommandError(false);
    last = JSON.stringify(bounds);
    if (bounds) void api.open(id, url, bounds).catch(() => { if (live) setState({ ...initial, phase: 'failed' }); });
    else setState({ ...initial, phase: 'failed' });
    return () => {
      live = false;
      unsubscribe();
      cancelAnimationFrame(frame);
      resize.disconnect(); observer.disconnect();
      window.removeEventListener('resize', layout);
      pane.removeEventListener('scroll', layout);
      void api.close(id).catch(() => {});
    };
  }, [api, url, attempt, close]);
  const command = (action: VkSiteAction) => {
    if (!api) return;
    const id = view.current;
    setCommandError(false);
    void api.command(id, action).then((ok) => { if (!ok && view.current === id) setCommandError(true); })
      .catch(() => { if (view.current === id) setCommandError(true); });
  };
  const track = state.track;
  const toggle = t(track?.playing ? 'Пауза VK' : 'Воспроизвести в VK');
  return <section className="vk-site" aria-label={t('Официальный сайт VK')} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }}>
    <header className="vk-site-bar">
      <button className="icon-button" type="button" disabled={!state.back} aria-label={t('Назад по сайту VK')} title={t('Назад по сайту VK')} onClick={() => command('back')}><ArrowLeft size={17} /></button>
      <button className="icon-button" type="button" aria-label={t('Обновить страницу VK')} title={t('Обновить страницу VK')} onClick={() => state.phase === 'failed' ? setAttempt((n) => n + 1) : command('reload')}><RotateCw size={16} /></button>
      <span className="vk-site-origin" role="status"><LockKeyhole size={13} /><strong>{state.host || 'VK Музыка'}</strong>
        <small>{t(state.phase === 'loading' ? 'Загружаем…' : state.phase === 'failed' ? 'Недоступно' : 'Официальный сайт')}</small></span>
      <button className="icon-button" type="button" disabled={state.phase === 'failed'} title={t('К музыке VK')} aria-label={t('К музыке VK')} onClick={() => command('music')}><Globe2 size={17} /></button>
      <BrowserLink url={url} compact />
      <button ref={closeButton} className="icon-button" type="button" title={t('Закрыть сайт VK')} aria-label={t('Закрыть сайт VK')} onClick={close}><X size={19} /></button>
    </header>
    <div className="vk-site-transport" role="group" aria-label={t('Управление воспроизведением VK')}>
      <span className="vk-site-mark"><AudioLines size={18} aria-hidden="true" /></span>
      <div className="vk-site-track" aria-live="polite"><strong title={track?.title}>{track?.title || t('Плеер VK')}</strong>
        <small title={track?.artist}>{commandError ? t('Воспользуйтесь кнопками на сайте VK.') : track?.artist || t('Выберите трек на сайте VK.')}</small></div>
      <button data-vk-action="previous" className="icon-button" type="button" disabled={!track?.previous} title={t('Предыдущий трек VK')} aria-label={t('Предыдущий трек VK')} onClick={() => command('previous')}><SkipBack size={16} fill="currentColor" /></button>
      <button data-vk-action="toggle" className="icon-button" type="button" disabled={!track?.toggle} title={toggle} aria-label={toggle} onClick={() => command('toggle')}>
        {track?.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
      <button data-vk-action="next" className="icon-button" type="button" disabled={!track?.next} title={t('Следующий трек VK')} aria-label={t('Следующий трек VK')} onClick={() => command('next')}><SkipForward size={16} fill="currentColor" /></button>
    </div>
    <div className="vk-site-slot" ref={slot} aria-busy={state.phase === 'loading'}>
      {state.phase === 'failed' && <div className="vk-site-error" role="status"><h3>{t('Сайт VK не загрузился')}</h3><p>{t('Проверьте сеть или откройте сайт в браузере.')}</p>
        <button className="button primary-button" type="button" onClick={() => setAttempt((n) => n + 1)}>{t('Повторить')}</button><BrowserLink url={url} /></div>}
    </div>
  </section>;
}

export function VkSitePanel({ url, available, connected, open, close }: {
  url?: string; available: boolean; connected: boolean; open(url: string): void; close(): void;
}) {
  const t = useText();
  const api = window.luma?.vkSite;
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  if (url && api) return <SiteView url={url} close={close} />;
  return <section className="vk-site-intro" aria-labelledby="vk-site-title">
    <header><span className="vk-site-mark"><AudioLines size={23} aria-hidden="true" /></span><div>
      <p className="overline">{t('Отдельная сессия')}</p><h2 id="vk-site-title">{t('VK Музыка')}</h2></div></header>
    <p>{t('Войдите на официальном сайте VK. Пароль вводится только на сайте. Luma показывает трек и управление, если они доступны в плеере VK; очередь остаётся на сайте.')}</p>
    {!api && <p>{t('Сайт VK внутри Luma доступен в приложении для Windows.')}</p>}
    {!connected && <p role="status">{t('Для VK Музыки нужно подключение к интернету.')}</p>}
    <div className="vk-site-actions">
      {api && <button className="button primary-button" type="button" data-vk-open disabled={!available || resetting} onClick={() => open(VK_MUSIC_URL)}><Globe2 size={16} />{t('Открыть сайт VK')}</button>}
      <BrowserLink url={VK_MUSIC_URL} />
      {api && <button className="button ghost-button" type="button" data-vk-reset disabled={resetting} onClick={() => {
        setResetting(true); setError('');
        void api.reset().then((done) => { if (done) setError('Сессия VK очищена.'); }).catch(() => setError('Не удалось очистить сессию VK.')).finally(() => setResetting(false));
      }}>{t('Сбросить сессию VK')}</button>}
    </div>
    {api && <form className="vk-site-link" onSubmit={(event) => {
      event.preventDefault();
      const parsed = readMusicLink(link);
      if (parsed?.provider !== 'vk') { setError('Нужна обычная ссылка на трек или плейлист VK.'); return; }
      setError(''); open(parsed.url);
    }}>
      <label>{t('Ссылка на трек или плейлист VK')}<input type="text" inputMode="url" autoComplete="off" spellCheck={false} required maxLength={2048}
        placeholder="https://vk.ru/…" value={link} onChange={(event) => { setLink(event.currentTarget.value); setError(''); }} /></label>
      <button className="button outline-button" type="submit" disabled={!available || resetting || !link.trim()}>{t('Открыть в VK')}</button>
    </form>}
    {error && <p role="status">{t(error)}</p>}
  </section>;
}
