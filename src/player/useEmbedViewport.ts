import { useLayoutEffect, useRef } from 'react';

/** Third-party media only lives in the visible panel. Never resume it from a hidden frame. */
export function useEmbedViewport(key: string | undefined, close: () => void) {
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!key || !node) return;
    node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    node.focus({ preventScroll: true });
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry || node.contains(document.fullscreenElement)) return;
      if (!entry.isIntersecting || entry.boundingClientRect.width < 200) close();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [key, close]);
  return viewport;
}
