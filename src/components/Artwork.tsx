import { useState } from 'react';
import { AudioLines } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Track } from '../shared/media';

export function Artwork({ track, className = '' }: { track?: Track | null; className?: string }) {
  const [failed, setFailed] = useState<string>();
  const src = track?.artworkUrl;
  return (
    <div className={`artwork ${className}`} style={{ '--art-tone': track?.color ?? '#86635b' } as CSSProperties} aria-hidden="true">
      {src && src !== failed ? <img src={src} alt="" draggable={false} onError={() => setFailed(src)} /> : <AudioLines strokeWidth={1.35} />}
    </div>
  );
}
