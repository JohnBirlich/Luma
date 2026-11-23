import { DEFAULT_ARTWORK_URL } from '../data/artwork';

const SIZE = 384;
const MAX_CACHE = 12;
const thumbnails = new Map<string, Promise<MediaImage | undefined>>();

/** Convert private luma:// and transient blob:// covers into a compact Windows media thumbnail. */
async function makeThumbnail(src: string): Promise<MediaImage | undefined> {
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    const side = Math.min(width, height);
    if (!side) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!context) return;
    context.fillStyle = '#19191f';
    context.fillRect(0, 0, SIZE, SIZE);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIZE, SIZE);
    const jpeg = canvas.toDataURL('image/jpeg', 0.88);
    if (jpeg.startsWith('data:image/jpeg;base64,')) return { src: jpeg, type: 'image/jpeg', sizes: `${SIZE}x${SIZE}` };
  } catch { /* Corrupt, moved or unreadable artwork falls back to Luma's headphones. */ }
}

function thumbnail(src: string) {
  const result = thumbnails.get(src) ?? makeThumbnail(src);
  thumbnails.delete(src);
  thumbnails.set(src, result);
  const oldest = thumbnails.keys().next().value;
  if (oldest && thumbnails.size > MAX_CACHE) thumbnails.delete(oldest);
  void result.then((image) => {
    if (!image && thumbnails.get(src) === result) thumbnails.delete(src);
  });
  return result;
}

export async function mediaArtwork(src?: string, fallback?: string): Promise<MediaImage | undefined> {
  return (src && await thumbnail(src)) || (fallback && fallback !== src && await thumbnail(fallback)) || thumbnail(DEFAULT_ARTWORK_URL);
}
