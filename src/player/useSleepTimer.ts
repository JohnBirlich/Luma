import { useCallback, useEffect, useRef, useState } from 'react';
import { sleepDeadline } from '../shared/sleep-timer';
import type { SleepMinutes } from '../shared/sleep-timer';

/** Deadlines are absolute so a suspended PC does not extend the timer. Nothing is persisted. */
export function useSleepTimer(pause: () => void, onExpired: () => void) {
  const [deadline, setDeadline] = useState<number>();
  const active = useRef<number>(undefined);
  const change = useCallback((minutes?: SleepMinutes) => {
    active.current = minutes === undefined ? undefined : sleepDeadline(minutes, Date.now());
    setDeadline(active.current);
  }, []);
  const expire = useCallback(() => {
    if (active.current === undefined || active.current > Date.now()) return false;
    change(); pause(); onExpired();
    return true;
  }, [change, pause, onExpired]);
  useEffect(() => {
    if (deadline === undefined) return;
    let timeout: number;
    const check = () => {
      window.clearTimeout(timeout);
      if (expire() || active.current !== deadline) return;
      timeout = window.setTimeout(check, Math.max(0, deadline - Date.now()));
    };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearTimeout(timeout); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [deadline, expire]);
  return { deadline, change, expire };
}
