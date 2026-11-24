import { useSyncExternalStore } from 'react';

/**
 * Three states, because «выключено» and «не проверено» look different in the UI:
 * the diagnostics card starts grey and only turns green or red once a request
 * actually went out and came back. `navigator.onLine` alone is not evidence —
 * it reports a network interface, and on Windows it stays true behind a captive
 * portal or a dead route.
 */
export type ConnectionPhase = 'checking' | 'online' | 'offline';

const PROBE_INTERVAL = 30_000;
const listeners = new Set<() => void>();
let phase: ConnectionPhase = 'checking';
let running: Promise<ConnectionPhase> | undefined;
let watcher = false;
let timer: ReturnType<typeof setInterval> | undefined;

function publish(next: ConnectionPhase) {
  if (next === phase) return;
  phase = next;
  listeners.forEach((listener) => listener());
}

/** One probe, shared by every caller that asks while it is in flight. */
export function probeConnection(): Promise<ConnectionPhase> {
  const desktopProbe = window.luma?.probeNetwork;
  const request = (async (): Promise<ConnectionPhase> => {
    if (!navigator.onLine) return 'offline';
    if (!desktopProbe) return navigator.onLine ? 'online' : 'offline';
    try {
      const reachable = await Promise.race([
        desktopProbe(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 6_000)),
      ]);
      return reachable ? 'online' : 'offline';
    } catch {
      // The bridge failed, which says nothing about the network: fall back instead
      // of claiming the app is offline.
      return navigator.onLine ? 'online' : 'offline';
    }
  })();
  running = request;
  void request.then((result) => {
    if (running === request) running = undefined;
    publish(result);
  });
  return request;
}

/** Re-probe on demand — a user action, a window focus, or a retry button. */
export function refreshConnection() {
  return probeConnection();
}

function watch() {
  if (watcher || typeof window === 'undefined') return;
  watcher = true;
  const recheck = () => { void probeConnection(); };
  window.addEventListener('online', recheck);
  window.addEventListener('offline', recheck);
  window.addEventListener('focus', recheck);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) recheck(); });
  timer = setInterval(recheck, PROBE_INTERVAL);
  void probeConnection();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  watch();
  return () => { listeners.delete(listener); };
};
const snapshotValue = () => phase;

/** `checking` until the first answer arrives, then `online` or `offline`. */
export function useConnectionPhase(): ConnectionPhase {
  return useSyncExternalStore(subscribe, snapshotValue, snapshotValue);
}

export function connectionPhase() {
  return phase;
}

/** Only for tests: forget the probe state and stop the interval. */
export function resetConnectionWatch() {
  listeners.clear();
  phase = 'checking';
  running = undefined;
  watcher = false;
  if (timer) clearInterval(timer);
  timer = undefined;
}
