import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { EFFECT_TEMPOS } from '../shared/customization';
import type { BackgroundEffect, EffectTempo } from '../shared/customization';
import type { ReadSpectrum } from '../player/useAudio';
import { useVisualMotion } from '../player/useVisualMotion';
import oceanUrl from '../assets/scenes/ocean.webm?url';
import oceanPoster from '../assets/scenes/ocean.webp?url';
import { SceneCanvas } from './SceneCanvas';

interface SceneProps {
  effect: BackgroundEffect;
  strength?: number;
  animate?: boolean;
  tempo?: EffectTempo;
  sample?: ReadSpectrum;
}
const stillBars = [22, 44, 36, 54, 62, 52, 82, 89, 65, 77, 57, 50, 58, 41, 35, 46, 26];
const haloEffects = new Set<BackgroundEffect>(['aurora', 'nebula', 'prism', 'orbits', 'stars', 'solar']);

export const SceneBackground = memo(function SceneBackground({ effect, strength = 0.75, animate = false, tempo = 'normal', sample }: SceneProps) {
  const element = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const ocean = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(true);
  const allowed = useVisualMotion(animate && strength > 0 && effect !== 'off');
  const moving = allowed && inView;
  const factor = EFFECT_TEMPOS[tempo].factor;

  useEffect(() => {
    const target = element.current;
    if (!target || !allowed || typeof IntersectionObserver === 'undefined') return;
    const visible = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    visible.observe(target);
    return () => visible.disconnect();
  }, [allowed, effect]);
  useEffect(() => {
    const video = ocean.current;
    if (video) { video.playbackRate = 1 / factor; void video.play().catch(() => {}); }
  }, [factor, moving, effect]);
  useEffect(() => {
    const light = halo.current;
    if (!moving || !sample || !light) return;
    const bins = new Uint8Array(128);
    let glow = 0, shown = 0;
    // Write to one small, non-inherited opacity layer at 10 Hz. Never invalidate every scene node.
    const timer = window.setInterval(() => {
      let peak = 0;
      if (sample(bins)) for (let i = 1; i < 10; i++) peak = Math.max(peak, bins[i]);
      glow += (.7 * peak / 255 - glow) * .38;
      if (Math.abs(glow - shown) > .028) light.style.opacity = (shown = glow).toFixed(2);
    }, 100);
    return () => window.clearInterval(timer);
  }, [moving, effect, sample]);

  if (effect === 'off') return null;
  return <div className={`scene-background scene-${effect}${moving ? ' scene-moving' : ''}`} ref={element}
    style={{ '--strength': strength, '--scene-tempo': factor } as CSSProperties} aria-hidden="true">
    {effect === 'aurora' && <div className="aurora-curtain"><i /><i /></div>}
    {effect === 'waves' && moving && <video ref={ocean} className="scene-ocean-film" src={oceanUrl} poster={oceanPoster} loop muted playsInline disablePictureInPicture preload="none" />}
    {effect === 'stars' && <><i className="star-field" /><svg className="scene-constellations" viewBox="0 0 840 430" preserveAspectRatio="xMidYMid slice" fill="none">
      <path d="M95 293 219 209 304 249 398 119 515 158 607 82 712 117 M304 249 433 309 571 255 687 278" />
      <circle cx="398" cy="119" r="4"/><circle cx="607" cy="82" r="3"/><circle cx="219" cy="209" r="2.5" />
    </svg></>}
    {effect === 'spectrum' && !moving && <div className="scene-bars">{stillBars.map((height, index) => <i key={index} style={{ '--bar': height / 100 } as CSSProperties} />)}</div>}
    {moving && (effect === 'spectrum' || effect === 'fireworks' || effect === 'pulse' || effect === 'rain' || effect === 'meteors') && <SceneCanvas effect={effect} tempo={factor} sample={sample} />}
    {effect === 'pulse' && !moving && <div className="scene-pulse-still" />}
    {effect === 'nebula' && <><i className="nebula-plate" /><i className="nebula-stars" /></>}
    {effect === 'orbits' && <><i className="orbit-planet" /><div className="orbit-lines"><i /><i /></div></>}
    {effect === 'horizon' && <><i className="scene-neon-sun" /><i className="scene-neon-floor" /><i className="scene-neon-light" /></>}
    {effect === 'kaleidoscope' && <div className="scene-chromatic"><i /><i /></div>}
    {effect === 'rain' && <i className="rain-glass-beads" />}
    {effect === 'prism' && <div className="scene-prism-optics" />}
    {effect === 'solar' && <div className="scene-solar-filaments"><i /><i /></div>}
    {moving && sample && haloEffects.has(effect) && <div className="scene-audio-halo" ref={halo} />}
  </div>;
});
