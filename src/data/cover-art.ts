import { useCallback, useEffect, useRef, useState } from 'react';
import { coverMime, MAX_COVER_FILE } from '../shared/artwork';
import { recordDiagnostic } from './diagnostics';

const STORE = 'covers';
let database: Promise<IDBDatabase> | undefined;

interface CoverRecord { key: string; image: Blob }

function db() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('luma-cover-art', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cover storage is blocked'));
  });
  return database;
}

async function readAll() {
  const connection = await db();
  return new Promise<CoverRecord[]>((resolve, reject) => {
    const request = connection.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as CoverRecord[]);
    request.onerror = () => reject(request.error);
  });
}

async function write(key: string, image?: Blob): Promise<boolean> {
  try {
    const connection = await db();
    await new Promise<void>((resolve, reject) => {
      const transaction = connection.transaction(STORE, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      const store = transaction.objectStore(STORE);
      if (image) store.put({ key, image } satisfies CoverRecord);
      else store.delete(key);
    });
    return true;
  } catch { recordDiagnostic('library.coverStorage'); return false; }
}

export function useCoverArt() {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const live = useRef(new Map<string, string>());
  const touched = useRef(new Set<string>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void readAll().then((records) => {
      if (cancelled) return;
      for (const { key, image } of records) {
        if (typeof key !== 'string' || !(image instanceof Blob) || !/^image\/(webp|jpeg|png)$/.test(image.type)
          || touched.current.has(key)) continue;
        live.current.set(key, URL.createObjectURL(image));
      }
      setUrls(new Map(live.current));
    }).catch(() => { if (!cancelled) recordDiagnostic('library.coverStorage'); });
    return () => {
      cancelled = true;
      mounted.current = false;
      live.current.forEach((url) => URL.revokeObjectURL(url));
      live.current.clear();
    };
  }, []);

  const update = useCallback(async (key: string, image?: Blob) => {
    touched.current.add(key);
    const saved = await write(key, image);
    if (!mounted.current) return saved;
    const previous = live.current.get(key);
    if (image) live.current.set(key, URL.createObjectURL(image));
    else live.current.delete(key);
    if (previous) URL.revokeObjectURL(previous);
    setUrls(new Map(live.current));
    return saved;
  }, []);

  return { urls, update };
}

/** Use only a decoded, square raster; original photo metadata and filename are not stored. */
export async function prepareCover(file: File): Promise<Blob> {
  if (!file.size || file.size > MAX_COVER_FILE) throw new Error('Выберите изображение размером до 20 МБ.');
  const type = coverMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!type) throw new Error('Поддерживаются изображения JPG, PNG и WebP.');
  const url = URL.createObjectURL(file.slice(0, file.size, type));
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('Не удалось прочитать изображение. Проверьте файл.'); });
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width > 12000 || height > 12000 || width * height > 40_000_000) {
      throw new Error('Изображение слишком большое. Выберите картинку меньшего размера.');
    }
    const side = Math.min(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(side, 768);
    // Keep the thumbnail on the CPU: reading it back from the compositor can stall under playback.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Обработка изображений недоступна.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Не удалось подготовить обложку.')),
      'image/webp', 0.89,
    ));
  } finally { URL.revokeObjectURL(url); }
}
