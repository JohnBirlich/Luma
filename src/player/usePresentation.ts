import { useCallback, useEffect, useRef, useState } from 'react';

export function usePresentation() {
  const [open, setOpen] = useState(false);
  const visible = useRef(false);
  const ownsFullscreen = useRef(false);
  const requesting = useRef(false);

  const close = useCallback(() => {
    visible.current = false;
    setOpen(false);
    const exit = ownsFullscreen.current && document.fullscreenElement === document.documentElement;
    ownsFullscreen.current = false;
    if (exit) void document.exitFullscreen().catch(() => {});
  }, []);

  const show = useCallback(() => {
    if (visible.current) return;
    visible.current = true;
    const reveal = () => { if (visible.current) setOpen(true); };
    // Place the modal on the top layer *after* fullscreen. Otherwise fullscreen can paint
    // the main app over the modal even though it still captures focus and pointer events.
    if (requesting.current) return;
    if (!document.fullscreenEnabled || document.fullscreenElement) { reveal(); return; }
    requesting.current = true;
    void document.documentElement.requestFullscreen().then(() => {
      if (document.fullscreenElement === document.documentElement) {
        if (visible.current) ownsFullscreen.current = true;
        else void document.exitFullscreen().catch(() => {});
      }
      reveal();
    }, reveal).finally(() => { requesting.current = false; });
  }, []);

  useEffect(() => {
    const sync = () => {
      if (ownsFullscreen.current && document.fullscreenElement !== document.documentElement) close();
    };
    document.addEventListener('fullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); };
  }, [close]);

  return { open, show, close };
}
