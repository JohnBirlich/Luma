import { useState } from 'react';
import { AudioLines } from 'lucide-react';
import type { CSSProperties } from 'react';
import { trackCoverKey } from '../shared/artwork';
import { artworkTone } from '../shared/customization';
import type { Track } from '../shared/media';

interface ArtworkProps {
  track?: Track | null;
  imageUrl?: string;
  seed?: string;
  className?: string;
}

export function Artwork({ track, imageUrl, seed, className = '' }: ArtworkProps) {
  const [failed, setFailed] = useState<string>();
  const src = imageUrl ?? track?.artworkUrl;
  const hasImage = src && src !== failed;
  const tone = track?.color ?? artworkTone(seed ?? (track ? trackCoverKey(track.id) : 'luma'));
  return (
    <div className={`artwork${hasImage ? '' : ' artwork-fallback'} ${className}`} style={{ '--art-tone': tone } as CSSProperties} aria-hidden="true">
      {hasImage ? <img src={src} alt="" draggable={false} onError={() => setFailed(src)} /> : <AudioLines strokeWidth={1.35} />}
    </div>
  );
}
