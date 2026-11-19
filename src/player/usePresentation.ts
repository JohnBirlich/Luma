import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export function usePresentation() {
  const [open, setOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const native = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    const owned = stage.current && document.fullscreenElement === stage.current;
    const previous = opener.current;
    opener.current = null;
    native.current = false;
    setOpen(false);
    const restoreFocus = () => requestAnimationFrame(() => {
      if (previous?.isConnected && !stage.current) previous.focus({ preventScroll: true });
    });
    if (owned) void document.exitFullscreen().then(restoreFocus, restoreFocus);
    else restoreFocus();
  }, []);

  const show = useCallback(() => {
    const currentStage = () => stage.current;
    if (currentStage()) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Mount the viewport-filling dialog first; keep the user gesture for the Fullscreen API.
    // Embedded previews and Electron hosts which deny or delay fullscreen still show the player.
    flushSync(() => setOpen(true));
    const target = currentStage();
    if (target && document.fullscreenEnabled && !document.fullscreenElement) {
      void target.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      if (stage.current && document.fullscreenElement === stage.current) native.current = true;
      else if (native.current) close();
    };
    document.addEventListener('fullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); };
  }, [close]);

  return { open, show, close, stage };
}
