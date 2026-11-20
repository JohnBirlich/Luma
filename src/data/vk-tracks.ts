import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VK_TRACK_FILE, parseVkTracks, readVkTracks } from '../shared/vk-tracks';
import type { VkTrack } from '../shared/vk-tracks';

const STORE = 'lists';
const KEY = 'tracks';
const empty: readonly VkTrack[] = [];
let database: Promise<IDBDatabase> | undefined;

function db() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('luma-vk-tracks', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('VK list storage is blocked'));
  });
  return database;
}

async function read() {
  const connection = await db();
  return new Promise<VkTrack[]>((resolve, reject) => {
    const request = connection.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(readVkTracks(request.result));
    request.onerror = () => reject(request.error);
  });
}

async function write(items: VkTrack[]) {
  const connection = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    if (items.length) store.put(items, KEY);
    else store.delete(KEY);
  });
}

async function load(file: File) {
  const extension = /\.(csv|txt)$/i.exec(file.name)?.[1].toLowerCase();
  if (extension !== 'csv' && extension !== 'txt') throw new Error('Выберите файл CSV или TXT, а не архив или ссылку.');
  if (file.size > MAX_VK_TRACK_FILE) throw new Error('Выберите CSV или TXT размером до 2 МБ.');
  const buffer = await file.arrayBuffer().catch(() => { throw new Error('Не удалось открыть файл списка VK.'); });
  return parseVkTracks(new Uint8Array(buffer), extension);
}

export function useVkTracks() {
  const [items, setItems] = useState<VkTrack[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number>();
  const writing = useRef(false);
  useEffect(() => {
    let disposed = false;
    void read().then((rows) => { if (!disposed) setItems(rows); }, () => {
      if (!disposed) setError('Не удалось открыть локальный список VK. Попробуйте перезапустить Luma.');
    });
    return () => { disposed = true; };
  }, []);
  const update = useCallback(async (file?: File) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true); setError(undefined); setSaved(undefined);
    try {
      const next = file ? await load(file) : [];
      await write(next).catch(() => { throw new Error('Не удалось сохранить список VK на этом устройстве.'); });
      setItems(next);
      setSaved(next.length);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось открыть файл списка VK.');
    } finally { writing.current = false; setBusy(false); }
  }, []);
  return { items: items ?? empty, ready: items !== undefined, busy, error, saved, update };
}

export type VkTracksState = ReturnType<typeof useVkTracks>;
