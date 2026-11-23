import { useEffect, useState } from 'react';
import type { CredentialService, MusicServiceStatus } from '../shared/music-services';

export function useMusicServiceStatus(service: CredentialService) {
  const bridge = window.luma?.musicServices;
  const [status, setStatus] = useState<MusicServiceStatus>();
  useEffect(() => {
    if (!bridge) return;
    let active = true, notified = false;
    const unsubscribe = bridge.onChange((name, state) => {
      if (active && name === service) { notified = true; setStatus(state); }
    });
    void bridge.status(service).then((state) => { if (active && !notified) setStatus(state); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [bridge, service]);
  return { bridge, status, setStatus };
}

/** IPC adds a wrapper to Errors. Show only known, localized messages; never URLs or arbitrary provider text. */
export function providerError(error: unknown, known: readonly string[], fallback: string) {
  return error instanceof Error ? known.find((message) => error.message.endsWith(message)) ?? fallback : fallback;
}
