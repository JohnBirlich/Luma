import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

interface Presentation {
  target: HTMLDivElement | null;
  opener: HTMLElement | null;
  native: boolean;
}

export function usePresentation(nativeFullscreen: boolean) {
  const [open, setOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const active = useRef<Presentation>(null);
  const latest = useRef<Presentation>(null);

  const close = useCallback(() => {
    const view = active.current;
    if (!view) return;
    active.current = null;
    const owned = view.target && document.fullscreenElement === view.target;
    // Close our UI even if the system fullscreen transition fails or is still pending.
    setOpen(false);
    const restoreFocus = () => requestAnimationFrame(() => {
      if (view.opener?.isConnected && latest.current === view && !active.current) view.opener.focus({ preventScroll: true });
    });
    restoreFocus();
    if (owned) void document.exitFullscreen().then(restoreFocus, restoreFocus);
  }, []);

  const show = useCallback(() => {
    if (active.current) return;
    const view: Presentation = {
      target: null, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null, native: false,
    };
    active.current = latest.current = view;
    // Mount the dialog during the user gesture. The player fills the window immediately,
    // including when the browser or desktop host does not allow monitor fullscreen.
    flushSync(() => setOpen(true));
    const target = view.target = stage.current;
    if (!nativeFullscreen || !target || !document.fullscreenEnabled || document.fullscreenElement) return;
    void target.requestFullscreen().then(() => {
      if (document.fullscreenElement !== target) return;
      if (active.current === view) view.native = true;
      else void document.exitFullscreen().catch(() => {});
    }).catch(() => {});
  }, [nativeFullscreen]);

  useEffect(() => {
    const sync = () => {
      const view = active.current;
      if (!view?.target) return;
      if (document.fullscreenElement === view.target) view.native = true;
      else if (view.native) close();
    };
    document.addEventListener('fullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); };
  }, [close]);

  return { open, show, close, stage };
}
