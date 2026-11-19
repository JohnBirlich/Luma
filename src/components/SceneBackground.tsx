import { memo, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { BackgroundEffect } from '../shared/customization';
import type { ReadSpectrum } from '../player/useAudio';

interface SceneProps {
  effect: BackgroundEffect;
  strength?: number;
  animate?: boolean;
  sample?: ReadSpectrum;
}

const wavePath = 'M-140 290 C95 550 280 4 515 190 S846 369 1140 16';
const bands = [1, 2, 3, 4, 6, 8, 11, 14, 18, 23, 29, 36, 44, 54, 66, 81, 100, 124];
const idle = [0.26, 0.41, 0.52, 0.45, 0.69, 0.58, 0.83, 0.91, 0.72, 0.83, 0.63, 0.75, 0.52, 0.66, 0.58, 0.46, 0.6, 0.37, 0.48, 0.31, 0.43, 0.28, 0.23, 0.17];

export const SceneBackground = memo(function SceneBackground({ effect, strength = 0.75, animate = false, sample }: SceneProps) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = element.current;
    if (!target || !animate) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = effect === 'aurora' || effect === 'waves' || effect === 'spectrum' ? sample : undefined;
    const bars = target.querySelectorAll<HTMLElement>('.scene-bars > i');
    const buffer = new Uint8Array(128);
    let frame = 0;
    let last = 0;
    let glow = 0;
    function render(now: number) {
      if (!target) return;
      if (read && now - last >= 1000 / 24) {
        last = now;
        if (read(buffer)) {
          const bass = Math.max(...buffer.subarray(1, 7)) / 255;
          glow += (bass - glow) * 0.23;
          target.style.setProperty('--energy', glow.toFixed(3));
          bars.forEach((bar, index) => {
            const begin = bands[Math.floor(index * (bands.length - 1) / bars.length)];
            const end = Math.max(begin + 1, bands[Math.ceil((index + 1) * (bands.length - 1) / bars.length)]);
            let peak = 0;
            for (let slot = begin; slot < end; slot++) peak = Math.max(peak, buffer[slot]);
            bar.style.setProperty('--bar', (0.10 + 0.90 * (peak / 255) ** 1.45).toFixed(3));
          });
        }
      }
      frame = requestAnimationFrame(render);
    }
    function sync() {
      cancelAnimationFrame(frame);
      const running = !document.hidden && !motion.matches;
      target?.classList.toggle('scene-moving', running);
      if (running && read) frame = requestAnimationFrame(render);
      else {
        target?.style.removeProperty('--energy');
        bars.forEach((bar) => bar.style.removeProperty('--bar'));
      }
    }
    sync();
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      cancelAnimationFrame(frame);
      target.classList.remove('scene-moving');
      target.style.removeProperty('--energy');
      bars.forEach((bar) => bar.style.removeProperty('--bar'));
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [effect, animate, sample]);

  if (effect === 'off') return null;
  return (
    <div className={`scene-background scene-${effect}`} ref={element} style={{ '--strength': strength } as CSSProperties} aria-hidden="true">
      {effect === 'aurora' && <div className="aurora-clouds"><i /><i /><i /></div>}
      {effect === 'waves' && <svg className="scene-ribbons" viewBox="0 0 1000 450" preserveAspectRatio="xMidYMid slice" fill="none">
        {Array.from({ length: 14 }, (_, i) => <path key={i} d={wavePath} transform={`translate(${i * 3} ${i * 14 - 76})`} opacity={0.16 + i * 0.035} />)}
      </svg>}
      {effect === 'stars' && <div className="star-field"><i /><i /></div>}
      {effect === 'spectrum' && <div className="scene-bars">{idle.map((height, index) => <i key={index} style={{ '--idle': height } as CSSProperties} />)}</div>}
    </div>
  );
});
