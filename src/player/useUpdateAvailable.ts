import { useEffect, useState } from 'react';
import { getAppInfo } from '../data/app-info';

/** A release rarely lands twice an hour, and the first check happens at launch. */
const POLL_MS = 45 * 60 * 1000;
/** A failed lookup is retried soon instead of waiting for the next long poll. */
const RETRY_MS = 90 * 1000;
/** Shared across every caller so the release API is asked once per launch. */
let cached: boolean | undefined;
let pending: Promise<Lookup> | undefined;
const listeners = new Set<(value: boolean) => void>();

function announce(value: boolean) {
  cached = value;
  for (const listener of listeners) listener(value);
}

/** `unknown` means the lookup could not answer: offline, suspended or throttled. */
type Lookup = 'available' | 'current' | 'unknown';

function checkOnce(): Promise<Lookup> {
  if (pending) return pending;
  const updates = window.luma?.updates;
  if (!updates) return Promise.resolve('unknown');
  pending = updates.check().then((report) => {
    announce(report.state === 'available');
    return report.state === 'available' ? 'available' : report.state === 'unavailable' ? 'unknown' : 'current';
  }, () => 'unknown' as Lookup).finally(() => { pending = undefined; });
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
    let active = true, timer = 0, retry = 0;
    // Every look at the window is a cheap moment to ask again: a release published
    // while Luma sat in the background must light the badge without a restart.
    const refresh = () => {
      window.clearTimeout(retry);
      pending = undefined;
      void checkOnce().then((lookup) => {
        // Only an answer we never got is worth repeating soon; a clear "current"
        // waits for the next long poll instead of hammering the release API.
        if (!active || lookup !== 'unknown') return;
        retry = window.setTimeout(refresh, RETRY_MS);
      });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    void getAppInfo().then((info) => {
      if (!active || info.mode !== 'desktop') return;
      listeners.add(setAvailable);
      if (cached !== undefined) setAvailable(cached);
      refresh();
      timer = window.setInterval(refresh, POLL_MS);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', refresh);
    }, () => {});
    return () => {
      active = false;
      listeners.delete(setAvailable);
      window.clearInterval(timer);
      window.clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, [enabled]);
  return available;
}
