import { useEffect, useState } from 'react';
import { getAppInfo } from '../data/app-info';

const POLL_MS = 6 * 60 * 60 * 1000;
/** Shared across every caller so the release API is asked once per launch. */
let cached: boolean | undefined;
let pending: Promise<boolean> | undefined;
const listeners = new Set<(value: boolean) => void>();

function announce(value: boolean) {
  cached = value;
  for (const listener of listeners) listener(value);
}

function checkOnce() {
  if (pending) return pending;
  const updates = window.luma?.updates;
  if (!updates) return Promise.resolve(false);
  pending = updates.check().then((report) => {
    const available = report.state === 'available';
    announce(available);
    return available;
  }, () => {
    pending = undefined;
    return false;
  }).finally(() => { pending = undefined; });
  return pending;
}

/**
 * True while GitHub reports a newer release than the installed build. Only a real
 * installation asks: a source build has no release to point at, and its own update
 * screen must keep answering whatever the user asks it there.
 */
export function useUpdateAvailable(enabled = true) {
  const [available, setAvailable] = useState(cached ?? false);
  useEffect(() => {
    if (!enabled || !window.luma?.updates) return;
    let active = true, timer = 0;
    void getAppInfo().then((info) => {
      if (!active || info.mode !== 'desktop') return;
      listeners.add(setAvailable);
      if (cached !== undefined) setAvailable(cached);
      else void checkOnce();
      timer = window.setInterval(() => { pending = undefined; void checkOnce(); }, POLL_MS);
    }, () => {});
    return () => {
      active = false;
      listeners.delete(setAvailable);
      window.clearInterval(timer);
    };
  }, [enabled]);
  return available;
}
