import { memo, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { EFFECT_TEMPOS } from '../shared/customization';
import type { BackgroundEffect, EffectTempo } from '../shared/customization';
import type { ReadSpectrum } from '../player/useAudio';
import { useVisualMotion } from '../player/useVisualMotion';

interface SceneProps {
  effect: BackgroundEffect;
  strength?: number;
  animate?: boolean;
  tempo?: EffectTempo;
  sample?: ReadSpectrum;
}

const wavePath = 'M-120 325 C105 330 235 -46 466 128 S825 473 1140 74';
const bands = [1, 2, 3, 4, 6, 8, 11, 14, 18, 23, 29, 36, 44, 54, 66, 81, 100, 124];
const idle = [0.26, 0.41, 0.52, 0.45, 0.69, 0.58, 0.83, 0.91, 0.72, 0.83, 0.63, 0.75, 0.52, 0.66, 0.58, 0.46, 0.6, 0.37, 0.48, 0.31, 0.43, 0.28, 0.23, 0.17];

function energy(data: Uint8Array, start: number, end: number) {
  let total = 0;
  let peak = 0;
  for (let i = start; i < end; i++) {
    total += data[i];
    peak = Math.max(data[i], peak);
  }
  return (0.5 * peak + 0.5 * total / (end - start)) / 255;
}

export const SceneBackground = memo(function SceneBackground({ effect, strength = 0.75, animate = false, tempo = 'normal', sample }: SceneProps) {
  const element = useRef<HTMLDivElement>(null);
  const moving = useVisualMotion(animate && strength > 0 && effect !== 'off');
  useEffect(() => {
    const target = element.current;
    if (!target || !moving || !sample) return;
    const read = sample;
    const nodes = target.querySelectorAll<HTMLElement>('.scene-bars > i');
    const bars = Array.from(nodes, (el, index) => ({
      el, height: 0,
      begin: bands[Math.floor(index * (bands.length - 1) / nodes.length)],
      end: bands[Math.ceil((index + 1) * (bands.length - 1) / nodes.length)],
    }));
    const buffer = new Uint8Array(128);
    let frame = 0;
    let last = -100;
    let bass = 0;
    let sparkle = 0;
    function render(now: number) {
      if (!target || document.hidden) return;
      if (now - last >= 1000 / 30 - 1) {
        last = now;
        if (read(buffer)) {
          const beat = energy(buffer, 1, 8);
          bass += (beat - bass) * (beat > bass ? 0.42 : 0.17);
          sparkle += (energy(buffer, 12, 54) - sparkle) * 0.22;
          target.style.setProperty('--energy', bass.toFixed(3));
          target.style.setProperty('--sparkle', sparkle.toFixed(3));
          for (const bar of bars) {
            const height = 0.07 + 0.93 * energy(buffer, bar.begin, bar.end) ** 1.22;
            bar.height += (height - bar.height) * (height > bar.height ? 0.54 : 0.24);
            bar.el.style.setProperty('--bar', bar.height.toFixed(3));
          }
        }
      }
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      target.style.removeProperty('--energy');
      target.style.removeProperty('--sparkle');
      bars.forEach(({ el }) => el.style.removeProperty('--bar'));
    };
  }, [effect, moving, sample]);

  if (effect === 'off') return null;
  return (
    <div className={`scene-background scene-${effect}${moving ? ' scene-moving' : ''}`} ref={element} style={{ '--strength': strength, '--scene-tempo': EFFECT_TEMPOS[tempo].factor } as CSSProperties} aria-hidden="true">
      {effect === 'aurora' && <div className="aurora-clouds"><i /><i /><i /></div>}
      {effect === 'waves' && <svg className="scene-ribbons" viewBox="0 0 1000 450" preserveAspectRatio="xMidYMid slice" fill="none">
        {Array.from({ length: 18 }, (_, i) => <path key={i} d={wavePath} transform={`translate(${i * 4} ${i * 13 - 86})`} opacity={0.22 + i * 0.039} />)}
      </svg>}
      {effect === 'stars' && <div className="star-field"><i /><i /><i /></div>}
      {effect === 'spectrum' && <div className="scene-bars">{idle.map((height, index) => <i key={index} style={{ '--idle': height } as CSSProperties} />)}</div>}
      {effect === 'pulse' && <div className="scene-pulse-rings"><i /><i /><i /><i /><i /></div>}
      {effect === 'nebula' && <div className="scene-dust"><i /><i /><i /></div>}
      {effect === 'orbits' && <div className="orbit-lines"><i /><i /><i /></div>}
      {effect === 'prism' && <div className="scene-prism-beams"><i /><i /><i /></div>}
    </div>
  );
});
