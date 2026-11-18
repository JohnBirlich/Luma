import { useEffect, useState } from 'react';
import { trackCoverKey } from '../shared/artwork';
import { artworkTone } from '../shared/customization';
import type { Track } from '../shared/media';

export function usePalette(track: Track | null): string {
  const [sample, setSample] = useState<{ url: string; color: string }>();
  const url = track?.artworkUrl;
  const tint = track?.color;
  useEffect(() => {
    if (!url || tint) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      try {
        context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, total = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
          const light = Math.max(...rgb);
          const saturation = light - Math.min(...rgb);
          const weight = (pixels[i + 3] / 255) * (saturation + 18) * (0.3 + 1 - Math.abs(light - 140) / 170);
          r += rgb[0] * weight; g += rgb[1] * weight; b += rgb[2] * weight; total += weight;
        }
        if (total > 0) setSample({ url, color: `rgb(${Math.round(r / total)} ${Math.round(g / total)} ${Math.round(b / total)})` });
      } catch {
        // A missing or unreadable cover falls back to the track's deterministic gradient.
      }
    };
    image.src = url;
    return () => { cancelled = true; image.onload = null; };
  }, [url, tint]);

  return tint ?? (url !== undefined && sample?.url === url ? sample.color : artworkTone(track ? trackCoverKey(track.id) : 'luma'));
}
