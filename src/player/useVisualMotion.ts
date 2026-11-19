import { useSyncExternalStore } from 'react';

let preference: MediaQueryList | undefined;
const reduced = () => preference ??= window.matchMedia('(prefers-reduced-motion: reduce)');
const canMove = () => !document.hidden && !reduced().matches;
const still = () => false;
const noop = () => () => {};
function subscribe(update: () => void) {
  const media = reduced();
  media.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  return () => {
    media.removeEventListener('change', update);
    document.removeEventListener('visibilitychange', update);
  };
}

export function useVisualMotion(enabled: boolean) {
  return useSyncExternalStore(enabled ? subscribe : noop, enabled ? canMove : still, still);
}
