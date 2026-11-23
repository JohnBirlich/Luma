import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, AudioLines, Globe2, LoaderCircle, LockKeyhole, Pause, Play, RotateCcw, RotateCw, ScanLine, SkipBack, SkipForward, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { formatTime } from '../shared/media';
import type { VkBounds, VkPosition, VkSiteAction, VkSiteState } from '../shared/vk-site';
import './vk-site.css';

const initial: VkSiteState = { phase: 'loading', host: '', back: false, signIn: false };
let nextView = 0;

function showBounds(slot: HTMLElement, pane: Element): VkBounds | null {
  const box = slot.getBoundingClientRect(), clip = pane.getBoundingClientRect();
  const x = Math.max(box.left, clip.left, 0), y = Math.max(box.top, clip.top, 0);
  const width = Math.min(box.right, clip.right, innerWidth) - x, height = Math.min(box.bottom, clip.bottom, innerHeight) - y;
  return width >= 170 && height >= 82 ? { x, y, width, height } : null;
}

function VkTimeline({ timeline, seek }: { timeline: VkPosition; seek(ratio: number): void }) {
  const t = useText();
  const dragging = useRef(false);
  const [draft, setDraft] = useState<number>();
  const ratio = draft ?? timeline.position / timeline.duration;
  const elapsed = formatTime(ratio * timeline.duration), total = formatTime(timeline.duration);
  function cancel() { dragging.current = false; setDraft(undefined); }
  return <div className="vk-site-timeline">
    <span>{elapsed}</span>
    <input type="range" className="range" min={0} max={1000} step={1} value={Math.round(ratio * 1000)} disabled={!timeline.seek}
      aria-label={t('Позиция воспроизведения VK')} aria-valuetext={t('{0} из {1}', elapsed, total)}
      style={{ '--filled': `${ratio * 100}%` } as CSSProperties}
      onPointerDown={() => { dragging.current = true; }} onPointerCancel={cancel} onBlur={cancel}
      onPointerUp={(event) => { if (dragging.current) seek(event.currentTarget.valueAsNumber / 1000); cancel(); }}
      onChange={(event) => { const next = event.currentTarget.valueAsNumber / 1000; if (dragging.current) setDraft(next); else seek(next); }} />
    <span>{total}</span>
  </div>;
}

/** The official QR and password screen is the site's own page inside the sandboxed view. */
function SiteView({ url, close }: { url: string; close(): void }) {
  const t = useText();
  const api = window.luma?.vkSite;
  const panel = useRef<HTMLElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const view = useRef(0);
  const [state, setState] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState('');
  useLayoutEffect(() => {
    const node = slot.current, section = panel.current, pane = node?.closest('.main-pane');
    if (!api || !node || !section || !pane) return;
    const id = view.current = ++nextView;
    let frame = 0;
    let live = true;
    const unsubscribe = api.onState((current, next) => {
      if (!live || current !== id) return;
      if (next.phase === 'closed') { close(); return; }
      setState(next);
    });
    let last = '';
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
    resize.observe(node); resize.observe(section); resize.observe(pane); observer.observe(node);
    window.addEventListener('resize', layout);
    pane.addEventListener('scroll', layout, { passive: true });
    section.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
    const bounds = showBounds(node, pane);
    last = JSON.stringify(bounds);
    setState(initial);
    void api.open(id, url, bounds).catch(() => { if (live) setState({ ...initial, phase: 'failed' }); });
    return () => {
      live = false;
      view.current = 0;
      unsubscribe();
      cancelAnimationFrame(frame);
      resize.disconnect(); observer.disconnect();
      window.removeEventListener('resize', layout);
      pane.removeEventListener('scroll', layout);
      void api.close(id).catch(() => {});
    };
  }, [api, url, attempt, close]);
  const retry = () => { setNotice(''); setAttempt((n) => n + 1); };
  const command = (action: VkSiteAction, ratio?: number) => {
    if (!api || resetting) return;
    const id = view.current;
    setNotice('');
    void api.command(id, action, ratio).then((ok) => {
      if (!ok && view.current === id) setNotice('Эта команда сейчас недоступна в плеере VK.');
    }).catch(() => { if (view.current === id) setNotice('Эта команда сейчас недоступна в плеере VK.'); });
  };
  async function reset() {
    if (!api || resetting) return;
    const id = view.current;
    setResetting(true); setNotice('');
    try { if (await api.reset(id) && view.current === id) retry(); }
    catch { if (view.current === id) { setNotice('Не удалось очистить сессию VK.'); setState({ ...initial, phase: 'failed' }); } }
    finally { if (view.current === id) setResetting(false); }
  }
  const track = state.track;
  const toggle = t(track?.playing ? 'Пауза VK' : 'Воспроизвести в VK');
  const resetLabel = t('Сбросить сессию VK');
  return <section className="vk-site" ref={panel} aria-label={t('Официальный сайт VK')} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }}>
    <header className="vk-site-bar">
      <button className="icon-button" type="button" disabled={!state.back || resetting} aria-label={t('Назад по сайту VK')} title={t('Назад по сайту VK')} onClick={() => command('back')}><ArrowLeft size={17} /></button>
      <button className="icon-button" type="button" disabled={resetting} aria-label={t('Обновить страницу VK')} title={t('Обновить страницу VK')} onClick={() => state.phase === 'failed' ? retry() : command('reload')}><RotateCw size={16} /></button>
      <span className="vk-site-origin" role="status"><LockKeyhole size={13} /><strong>{state.host || 'VK Музыка'}</strong>
        <small>{t(state.phase === 'loading' ? 'Загружаем…' : state.phase === 'failed' ? 'Недоступно' : 'Официальный сайт')}</small></span>
      <button className="icon-button" type="button" disabled={state.phase !== 'ready' || state.signIn || resetting} title={t('К музыке VK')} aria-label={t('К музыке VK')} onClick={() => command('music')}><Globe2 size={17} /></button>
      <button className="icon-button" type="button" data-vk-reset disabled={resetting || state.phase === 'loading'} title={resetLabel} aria-label={resetLabel} onClick={() => void reset()}><RotateCcw size={17} /></button>
      <button className="icon-button" type="button" title={t('Закрыть сайт VK')} aria-label={t('Закрыть сайт VK')} onClick={close}><X size={19} /></button>
    </header>
    {state.signIn ? <div className="vk-site-login">
      <span className="vk-site-mark"><ScanLine size={19} aria-hidden="true" /></span>
      <div><strong>{t('Войдите в VK по QR-коду')}</strong><p>{t('Чтобы музыка VK и Luma не мешали друг другу, войдите на официальном сайте ниже. Отсканируйте QR-код в приложении VK. Luma не читает и не отправляет данные входа — их обрабатывает сайт VK.')}</p></div>
    </div> : state.phase === 'ready' && <>
      <div className="vk-site-transport" role="group" aria-label={t('Управление воспроизведением VK')}>
        <span className="vk-site-mark"><AudioLines size={18} aria-hidden="true" /></span>
        <div className="vk-site-track" aria-live="polite"><strong title={track?.title}>{track?.title || t('Плеер VK')}</strong>
          <small title={track?.artist}>{track?.artist || t('Выберите трек на сайте VK.')}</small></div>
        <button data-vk-action="previous" className="icon-button" type="button" disabled={!track?.previous || resetting} title={t('Предыдущий трек VK')} aria-label={t('Предыдущий трек VK')} onClick={() => command('previous')}><SkipBack size={16} fill="currentColor" /></button>
        <button data-vk-action="toggle" className="icon-button" type="button" disabled={!track?.toggle || resetting} title={toggle} aria-label={toggle} onClick={() => command('toggle')}>
          {track?.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
        <button data-vk-action="next" className="icon-button" type="button" disabled={!track?.next || resetting} title={t('Следующий трек VK')} aria-label={t('Следующий трек VK')} onClick={() => command('next')}><SkipForward size={16} fill="currentColor" /></button>
      </div>
      {track?.timeline && <VkTimeline key={`${track.artist}\n${track.title}`} timeline={track.timeline} seek={(ratio) => command('seek', ratio)} />}
    </>}
    {notice && <p role="status" className="vk-site-notice">{t(notice)}</p>}
    <div className="vk-site-slot" ref={slot} aria-busy={state.phase === 'loading' || resetting}>
      {state.phase === 'loading' && <p className="vk-site-loading" role="status"><LoaderCircle size={16} aria-hidden="true" />{t('Загружаем сайт VK…')}</p>}
      {state.phase === 'failed' && <div className="vk-site-error" role="status"><h3>{t('Сайт VK не загрузился')}</h3><p>{t('Проверьте сеть и повторите попытку.')}</p>
        <button className="button primary-button" type="button" onClick={retry}>{t('Повторить')}</button></div>}
    </div>
  </section>;
}

export function VkSitePanel({ url, connected, close }: { url?: string; connected: boolean; close(): void }) {
  const t = useText();
  const api = window.luma?.vkSite;
  if (url && api) return <SiteView url={url} close={close} />;
  return <p className="vk-site-placeholder" role="status">{t(!api ? 'Сайт VK внутри Luma доступен в приложении для Windows.'
    : !connected ? 'Для VK Музыки нужно подключение к интернету.' : 'Выберите вкладку VK Музыка, чтобы открыть сайт.')}</p>;
}
