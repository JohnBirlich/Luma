import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { EFFECT_TEMPOS } from '../shared/customization';
import type { BackgroundEffect, EffectTempo } from '../shared/customization';
import type { ReadSpectrum } from '../player/useAudio';
import { useVisualMotion } from '../player/useVisualMotion';
import oceanUrl from '../assets/scenes/ocean.webm?url';
import oceanPoster from '../assets/scenes/ocean.webp?url';
import { SceneCanvas } from './SceneCanvas';
import { isCanvasEffect } from '../shared/scene-motion';

interface SceneProps {
  effect: BackgroundEffect;
  tone?: string;
  strength?: number;
  animate?: boolean;
  visible?: boolean;
  tempo?: EffectTempo;
  sample?: ReadSpectrum;
}
const tunnelRings = Array.from({ length: 7 }, (_, index) => ({
  '--tunnel-scale': .13 + index * .15, '--tunnel-phase': index / 7,
}) as CSSProperties);

export const SceneBackground = memo(function SceneBackground({ effect, tone, strength = 0.75, animate = false, visible = true, tempo = 'normal', sample }: SceneProps) {
  const element = useRef<HTMLDivElement>(null);
  const ocean = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');
  const allowed = useVisualMotion(visible && strength > 0 && effect !== 'off');
  const enabled = allowed && inView;
  const moving = enabled && animate;
  const factor = EFFECT_TEMPOS[tempo].factor;

  useEffect(() => {
    const target = element.current;
    if (!target || !allowed || typeof IntersectionObserver === 'undefined') return;
    const visible = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > 0));
    visible.observe(target);
    return () => visible.disconnect();
  }, [allowed, effect]);
  useEffect(() => {
    const video = ocean.current;
    if (!video) return;
    video.src = oceanUrl;
    void video.play().catch(() => {});
    return () => { video.pause(); video.removeAttribute('src'); video.load(); };
  }, [moving, effect]);
  useEffect(() => {
    if (ocean.current) ocean.current.playbackRate = 1 / factor;
  }, [factor, moving, effect]);
  if (effect === 'off') return null;
  return <div className={`scene-background scene-${effect}${moving ? ' scene-moving' : ''}`} ref={element}
    data-cover-tone={effect === 'mix-flow' && tone ? '' : undefined}
    style={{ '--strength': strength, '--scene-tempo': factor, '--scene-tone': tone } as CSSProperties} aria-hidden="true">
    {effect === 'tunnel' && <div className="tunnel-depth">{tunnelRings.map((style, index) => <svg key={index} className="tunnel-frame" style={style} viewBox="0 0 300 260" focusable="false">
      <path d="M 76,5 H 224 L 296,130 224,255 H 76 L 4,130 Z" />
    </svg>)}</div>}
    {effect === 'waves' && moving && <video ref={ocean} className="scene-ocean-film" poster={oceanPoster} loop muted playsInline disablePictureInPicture preload="none" />}
    {strength > 0 && isCanvasEffect(effect) && <SceneCanvas effect={effect} enabled={enabled} playing={animate} tempo={factor} sample={sample} />}
    {effect === 'nebula' && <><i className="nebula-plate" /><i className="nebula-stars" /></>}
    {effect === 'horizon' && <><i className="scene-neon-sun" /><i className="scene-neon-floor" /><i className="scene-neon-light" /></>}
    {effect === 'kaleidoscope' && <div className="scene-chromatic"><i /><i /></div>}
    {effect === 'liquid' && <div className="scene-liquid-light" />}
    {effect === 'mix-flow' && <div className="mix-flow-light" />}
    {effect === 'rain' && <i className="rain-glass-beads" />}
  </div>;
});
