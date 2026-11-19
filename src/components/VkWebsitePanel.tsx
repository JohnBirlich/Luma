import { useText } from '../i18n/context';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Globe2, LockKeyhole, RotateCw, X } from 'lucide-react';
import type { VkWebsiteState } from '../shared/vk';

const initial: VkWebsiteState = { host: '', loading: true, failed: false, canGoBack: false };

/** The site occupies this measured slot; the trusted toolbar and nav stay outside it. */
export function VkWebsitePanel({ url, close }: { url: string; close(): void }) {
  const t = useText();
  const slot = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const api = window.luma?.vk;
  useEffect(() => {
    const element = slot.current;
    if (!api || !element) return;
    let active = true;
    let frame = 0;
    const bounds = () => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const unsubscribe = api.onState((next) => { if (active) setState(next); });
    const observe = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; void api.layout(bounds()).catch(() => undefined); });
    };
    const resize = new ResizeObserver(observe);
    resize.observe(element);
    window.addEventListener('resize', observe);
    closeButton.current?.focus();
    setState(initial);
    void api.open(url, bounds()).catch(() => { if (active) setState({ ...initial, loading: false, failed: true }); });
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('resize', observe);
      cancelAnimationFrame(frame);
      resize.disconnect();
      void api.close().catch(() => undefined);
    };
  }, [api, url, attempt]);
  const command = (action: 'back' | 'reload' | 'return') => { void api?.command(action).catch(() => setState({ ...initial, loading: false, failed: true })); };
  return <section className="vk-site-page" aria-label={t("Официальный сайт VK")} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }}>
    <header className="vk-site-toolbar">
      <button className="icon-button" type="button" title={t("Назад по сайту VK")} aria-label={t("Назад по сайту VK")} disabled={!state.canGoBack} onClick={() => command('back')}><ArrowLeft size={17} /></button>
      <button className="icon-button" type="button" title={t("Обновить страницу VK")} aria-label={t("Обновить страницу VK")} onClick={() => state.failed ? setAttempt((n) => n + 1) : command('reload')}><RotateCw size={16} /></button>
      <div className="vk-site-origin" role="status"><LockKeyhole size={14} /><span>{state.host || t("VK Музыка")}</span>
        <small>{state.loading ? t("Загружаем…") : state.failed ? t("Недоступно") : t("Официальный сайт")}</small></div>
      <button className="button outline-button vk-site-home" type="button" onClick={() => command('return')}><Globe2 size={15} />{" "}{t("К музыке")}</button>
      <button ref={closeButton} className="icon-button" type="button" title={t("Закрыть сайт VK")} aria-label={t("Закрыть сайт VK")} onClick={close}><X size={19} /></button>
    </header>
    <div className="vk-site-slot" ref={slot} aria-busy={state.loading}>
      {state.failed && <div className="empty-library" role="status"><div><Globe2 size={23} /></div><h2>{t("Сайт VK не загрузился")}</h2>
        <p>{t("Проверьте сеть и попробуйте снова. Данные входа не изменены.")}</p>
        <button className="button outline-button" type="button" onClick={() => setAttempt((n) => n + 1)}>{t("Повторить")}</button></div>}
    </div>
  </section>;
}
