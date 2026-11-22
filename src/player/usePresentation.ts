import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export type PresentationKind = 'player' | 'karaoke';

interface Presentation {
  target: HTMLDivElement | null;
  opener: HTMLElement | null;
  desktop: boolean;
  native: boolean;
}

export function usePresentation(nativeFullscreen: boolean) {
  const [kind, setKind] = useState<PresentationKind | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const active = useRef<Presentation>(null);
  const latest = useRef<Presentation>(null);

  const close = useCallback(() => {
    const view = active.current;
    if (!view) return;
    active.current = null;
    const owned = view.target && document.fullscreenElement === view.target;
    // Close our UI even if the system fullscreen transition fails or is still pending.
    setKind(null);
    const restoreFocus = () => requestAnimationFrame(() => {
      if (view.opener?.isConnected && latest.current === view && !active.current) view.opener.focus({ preventScroll: true });
    });
    restoreFocus();
    if (view.desktop) void window.luma?.window.setFullscreen(false).then(restoreFocus, restoreFocus);
    else if (owned) void document.exitFullscreen().then(restoreFocus, restoreFocus);
  }, []);

  const show = useCallback((mode: PresentationKind) => {
    if (active.current) { setKind(mode); return; }
    const view: Presentation = {
      target: null, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      desktop: false, native: false,
    };
    active.current = latest.current = view;
    // Mount the dialog during the user gesture. The player fills the window immediately,
    // including when the browser or desktop host does not allow monitor fullscreen.
    flushSync(() => setKind(mode));
    const target = view.target = stage.current;
    if (!nativeFullscreen || !target) return;
    if (window.luma) {
      view.desktop = true;
      // Losing permission or a platform error still leaves the in-window player usable.
      void window.luma.window.setFullscreen(true).catch(() => {});
      return;
    }
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    void target.requestFullscreen().then(() => {
      if (document.fullscreenElement !== target) return;
      if (active.current === view) view.native = true;
      else void document.exitFullscreen().catch(() => {});
    }).catch(() => {});
  }, [nativeFullscreen]);

  useEffect(() => {
    const sync = () => {
      const view = active.current;
      if (!view?.target || view.desktop) return;
      if (document.fullscreenElement === view.target) view.native = true;
      else if (view.native) close();
    };
    document.addEventListener('fullscreenchange', sync);
    const unsubscribe = window.luma?.window.onFullscreen((fullscreen) => {
      const view = active.current;
      if (!view?.desktop) return;
      if (fullscreen) view.native = true;
      else if (view.native) close();
    });
    return () => { document.removeEventListener('fullscreenchange', sync); unsubscribe?.(); };
  }, [close]);

  return { kind, show, close, stage };
}
