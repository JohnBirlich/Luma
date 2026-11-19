import { useEffect, useRef } from 'react';
import type { ReadSpectrum } from '../player/useAudio';
import { FIREWORKS_FPS, sceneBufferSize, SPECTRUM_FPS } from '../shared/scene-budget';

const bands = [1, 2, 3, 4, 6, 8, 11, 14, 18, 24, 29, 37, 45, 56, 69, 86, 105, 127];
const idle = [0.26, 0.36, 0.34, 0.5, 0.64, 0.6, 0.84, 0.9, 0.8, 0.68, 0.64, 0.71, 0.5, 0.43, 0.49, 0.28, 0.22];

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
const scatter = seeded(971);
const bursts = [
  { x: .76, y: .24, phase: 0, color: '#ffd4a4' },
  { x: .29, y: .28, phase: 2.5, color: '#e5affc' },
  { x: .87, y: .49, phase: 4.9, color: '#92f2e6' },
].map((burst) => ({ ...burst, sparks: Array.from({ length: 54 }, (_, index) => {
  const angle = index * 2 * Math.PI / 54 + (scatter() - .5) * .13;
  const speed = .31 + scatter() * .34;
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed, life: .9 + scatter() * .62 };
}) }));

function fireworks(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const size = Math.min(w * .8, h);
  ctx.lineWidth = Math.max(.9, Math.min(2.8, size / 246));
  ctx.lineCap = 'round';
  for (const { x, y, color, phase, sparks } of bursts) {
    const age = ((t + phase) % 6.65) - .74;
    const cx = w * x, cy = h * y;
    ctx.strokeStyle = color;
    if (age < 0) {
      const lift = (age + .74) / .74;
      const head = cy + (1 - lift) ** 1.3 * (h - cy);
      ctx.globalAlpha = .55 * Math.sin(lift * Math.PI);
      ctx.beginPath(); ctx.moveTo(cx, head); ctx.lineTo(cx - 3, head + size * .085); ctx.stroke();
      continue;
    }
    if (age > 1.52) continue;
    // Analytic trajectories, not accumulating particles. Batch strokes by burst instead of per spark.
    const past = Math.max(0, age - .105);
    const distance = 1 - Math.exp(-age * 1.8);
    const tailDistance = 1 - Math.exp(-past * 1.8);
    const drift = .135 * age * age, tailDrift = .135 * past * past;
    const brightness = Math.min(.98, age * 7) * (1 - age / 1.63) ** .72;
    ctx.globalAlpha = brightness;
    ctx.beginPath();
    for (const spark of sparks) {
      if (age > spark.life) continue;
      ctx.moveTo(cx + spark.x * tailDistance * size, cy + (spark.y * tailDistance + tailDrift) * size);
      ctx.lineTo(cx + spark.x * distance * size, cy + (spark.y * distance + drift) * size);
    }
    ctx.stroke();
    ctx.globalAlpha = brightness * .85;
    ctx.fillStyle = '#fff3da';
    const tip = Math.max(1.25, size / 366);
    for (let i = 0; i < sparks.length; i += 2) {
      const spark = sparks[i];
      if (age <= spark.life) ctx.fillRect(cx + spark.x * distance * size, cy + (spark.y * distance + drift) * size, tip, tip);
    }
  }
  ctx.globalAlpha = 1;
}

/** A single bounded surface for the two scenes whose geometry changes each frame. */
export function SceneCanvas({ effect, tempo, sample }: { effect: 'spectrum' | 'fireworks'; tempo: number; sample?: ReadSpectrum }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const speed = useRef(tempo);
  speed.current = tempo;
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const surface = element, ctx = context;
    const bins = new Uint8Array(128);
    const heights = Float32Array.from(idle);
    const period = 1000 / (effect === 'spectrum' ? SPECTRUM_FPS : FIREWORKS_FPS);
    let raf = 0, last = 0, previous = 0, t = 0;
    let palettes: CanvasGradient[] = [];
    const resize = new ResizeObserver(([{ contentRect }]) => {
      const { width, height } = sceneBufferSize(contentRect.width, contentRect.height, devicePixelRatio);
      if (width === surface.width && height === surface.height && palettes.length) return;
      surface.width = width;
      surface.height = height;
      palettes = ['#bda5fd', '#78d8eb', '#f5b2a7'].map((color) => {
        const gradient = ctx.createLinearGradient(0, height, 0, height * .09);
        gradient.addColorStop(0, `${color}04`);
        gradient.addColorStop(.69, `${color}b0`);
        gradient.addColorStop(1, '#fff5eb');
        return gradient;
      });
    });
    resize.observe(surface);
    function draw(now: number) {
      t += (previous ? Math.min(now - previous, 100) : 0) / (1000 * speed.current);
      previous = now;
      const elapsed = now - last;
      if (elapsed >= period - 1 && surface.width && surface.height && palettes.length) {
        last = elapsed >= period ? now - elapsed % period : now;
        const { width, height } = surface;
        ctx.clearRect(0, 0, width, height);
        if (effect === 'fireworks') fireworks(ctx, width, height, t + 1.05);
        else {
          const live = sample?.(bins);
          const slot = width * .89 / idle.length;
          const base = height * .94;
          for (let i = 0; i < idle.length; i++) {
            let target = idle[i] * (.74 + .19 * Math.sin(t * (2.35 + i * .11) + i * .88));
            if (live) {
              let energy = 0;
              for (let bin = bands[i]; bin < bands[i + 1]; bin++) energy = Math.max(energy, bins[bin]);
              target = .06 + .82 * (energy / 255) ** 1.22;
            }
            heights[i] += (target - heights[i]) * (target > heights[i] ? .56 : .29);
            const x = width * .055 + i * slot, bar = heights[i] * base;
            ctx.fillStyle = palettes[i % palettes.length];
            ctx.fillRect(x, base - bar, slot * .68, bar);
            ctx.fillStyle = '#f8efffd9';
            ctx.fillRect(x, base - bar, slot * .68, Math.max(1, height * .004));
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { resize.disconnect(); cancelAnimationFrame(raf); };
  }, [effect, sample]);
  return <canvas className="scene-canvas" ref={canvas} aria-hidden="true" />;
}
