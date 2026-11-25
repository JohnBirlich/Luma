import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { VkBounds, VkCollection, VkSiteAction, VkSiteState } from '../shared/vk-site';

const initial: VkSiteState = { phase: 'loading', host: '', back: false, signIn: false };
let nextView = 0;

interface Session {
  id: number;
  url: string;
  state: VkSiteState;
  resetting: boolean;
}

/** Own the official guest for the app's lifetime, not for the lifetime of its catalogue pane. */
export function useVkSite(onClosed: () => void) {
  const api = window.luma?.vkSite;
  const [view, setView] = useState<Session>();
  const active = useRef<Session>(undefined);
  const stopping = useRef<Promise<void>>(undefined);
  const hasSession = useCallback(() => !!active.current, []);
  const store = useCallback((session?: Session) => {
    active.current = session;
    setView(session);
  }, []);

  useLayoutEffect(() => {
    if (!api) return;
    const unsubscribe = api.onState((id, state) => {
      const session = active.current;
      if (session?.id !== id) return;
      if (state.phase === 'closed') { store(); onClosed(); }
      else store({ ...session, state });
    });
    return () => {
      unsubscribe();
      const session = active.current;
      active.current = undefined;
      if (session) void api.close(session.id).catch(() => {});
    };
  }, [api, onClosed, store]);

  const open = useCallback((url: string) => {
    if (!api) return;
    const id = ++nextView;
    store({ id, url, state: initial, resetting: false });
    void api.open(id, url, null).catch(() => {
      const session = active.current;
      if (session?.id === id) store({ ...session, state: { ...initial, phase: 'failed' } });
    });
  }, [api, store]);

  const close = useCallback(() => {
    const session = active.current;
    if (!api || !session) return stopping.current;
    store(); onClosed();
    const request = stopping.current = api.close(session.id);
    const finished = () => { if (stopping.current === request) stopping.current = undefined; };
    void request.then(finished, finished);
    return request;
  }, [api, onClosed, store]);

  const layout = useCallback((id: number, bounds: VkBounds | null, foreground: boolean) => {
    void api?.layout(id, bounds, foreground).catch(() => {});
  }, [api]);

  const command = useCallback((action: VkSiteAction, ratio?: number) => {
    const session = active.current;
    return api && session && !session.resetting ? api.command(session.id, action, ratio).catch(() => false) : Promise.resolve(false);
  }, [api]);

  /** Opens the album of the track the guest is showing. */
  const album = useCallback(() => {
    const session = active.current;
    return api && session && !session.resetting ? api.album(session.id).catch(() => false) : Promise.resolve(false);
  }, [api]);

  /** Plays a saved VK track on its own page while Luma's own screen stays in front. */
  const playTrack = useCallback((url: string) => {
    const session = active.current;
    return api && session && !session.resetting ? api.playTrack(session.id, url).catch(() => false) : Promise.resolve(false);
  }, [api]);

  /** Starts a VK catalogue entry in the guest; the page may be behind Luma at the time. */
  const collection = useCallback((kind: VkCollection, name?: string) => {
    const session = active.current;
    return api && session && !session.resetting ? api.collection(session.id, kind, name).catch(() => false) : Promise.resolve(false);
  }, [api]);

  const pause = useCallback(() => {
    const session = active.current;
    if (!session?.state.engaged) return;
    void command('pause').then((ok) => {
      // The sleep timer must stop sound even if the page has no usable pause action.
      if (!ok && active.current?.id === session.id) void close()?.catch(() => {});
    });
  }, [close, command]);

  const retry = useCallback(() => { if (active.current) open(active.current.url); }, [open]);
  const reset = useCallback(async () => {
    const session = active.current;
    if (!api || !session || session.resetting) return;
    store({ ...session, resetting: true });
    try { if (await api.reset(session.id) && active.current?.id === session.id) retry(); }
    catch (error) {
      if (active.current?.id !== session.id) return;
      store({ ...active.current, state: { ...initial, phase: 'failed' } });
      throw error;
    } finally {
      if (active.current?.id === session.id) store({ ...active.current, resetting: false });
    }
  }, [api, retry, store]);

  return { view, open, close, command, collection, playTrack, album, layout, hasSession, pause, retry, reset };
}

export type VkSiteController = ReturnType<typeof useVkSite>;
