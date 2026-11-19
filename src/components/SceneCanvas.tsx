import { useEffect, useRef } from 'react';
import { initialBeat, sampleBeat } from '../shared/beat';
import type { ReadSpectrum } from '../player/useAudio';
import { FIREWORKS_FPS, sceneBufferSize, SPECTRUM_FPS } from '../shared/scene-budget';

const bands = [1, 2, 3, 4, 6, 8, 11, 15, 21, 29, 40, 55, 76, 105, 144, 202, 279, 393];
const idle = [0.26, 0.36, 0.34, 0.5, 0.64, 0.6, 0.84, 0.9, 0.8, 0.68, 0.64, 0.71, 0.5, 0.43, 0.49, 0.28, 0.22];

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
const scatter = seeded(971);
const FIREWORKS_CYCLE = 5.9;
const bursts = Array.from({ length: 6 }, (_, i) => ({
  x: [.78, .29, .87, .53, .68, .19][i], y: [.19, .32, .44, .17, .52, .22][i], phase: i * FIREWORKS_CYCLE / 6,
  color: ['#ffd4a4', '#e5affc', '#92f2e6', '#fee6a0', '#96cafc', '#faa5c7'][i],
})).map((burst) => ({ ...burst, sparks: Array.from({ length: 42 }, (_, index) => {
  const angle = index * 2 * Math.PI / 42 + (scatter() - .5) * .13;
  const speed = .32 + scatter() * .39;
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed, life: .9 + scatter() * .62 };
}) }));

function fireworks(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const size = Math.min(w * .8, h);
  ctx.lineWidth = Math.max(.9, Math.min(2.8, size / 246));
  ctx.lineCap = 'round';
  for (const { x, y, color, phase, sparks } of bursts) {
    const age = ((t + phase) % FIREWORKS_CYCLE) - .74;
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

const rainDrops = Array.from({ length: 132 }, () => ({ x: scatter(), y: scatter(), depth: scatter() }));
const reflections = Array.from({ length: 18 }, () => ({ x: .2 + scatter() * .79, y: .62 + scatter() * .34, phase: scatter() * 3 }));
const meteors = Array.from({ length: 12 }, () => ({ x: scatter(), y: scatter() * .7, phase: scatter() * 4.4, depth: scatter() }));
const fraction = (v: number) => v - Math.floor(v);

function drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.lineCap = 'round';
  for (let front = 0; front < 2; front++) {
    ctx.strokeStyle = front ? '#c3e8ff9c' : '#b4b8ecd5';
    ctx.globalAlpha = front ? .55 : .36;
    ctx.lineWidth = front ? Math.max(1, h / 414) : Math.max(.62, h / 690);
    ctx.beginPath();
    for (const { x, y, depth } of rainDrops) {
      if (Number(depth > .68) !== front) continue;
      const dx = h * (.018 + depth * .034), dy = h * (.03 + depth * .082);
      const xx = fraction(x - t * (.025 + depth * .071)) * (w + dx) - dx;
      const yy = fraction(y + t * (.6 + depth * 1.47)) * (h + dy);
      ctx.moveTo(xx + dx, yy - dy); ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#f5d0a1';
  ctx.lineWidth = Math.max(.75, w / 1460);
  for (const { x, y, phase } of reflections) {
    const age = (t + phase) % 1.28;
    if (age > .76) continue;
    const radius = (h * .01 + h * .038 * age) * (.3 + y * .8);
    ctx.globalAlpha = (1 - age / .76) * .5;
    ctx.beginPath(); ctx.ellipse(x*w, y*h, radius, radius*.19, -.04, 0, Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawMeteors(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.lineCap = 'round';
  for (const { x, y, phase, depth } of meteors) {
    const age = (t * (.78 + .29 * depth) + phase) % 4.4;
    if (age > 1.24) continue;
    const xx = (x + .30 * age - .17) * w, yy = (y + .30 * age - .18) * h;
    const tail = .08 + depth * .16;
    const fade = Math.min(1, age * 10) * (1 - age / 1.24);
    const color = ctx.createLinearGradient(xx, yy, xx - tail*w, yy - tail*h);
    color.addColorStop(0, '#fef1ff'); color.addColorStop(.26, '#b49effbb'); color.addColorStop(1, '#7b64ef00');
    ctx.strokeStyle = color; ctx.globalAlpha = fade; ctx.lineWidth = 1.15 + depth * 1.8;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx-tail*w, yy-tail*h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPulse(ctx: CanvasRenderingContext2D, w: number, h: number, ringAges: number[], kick: number, halo: CanvasGradient) {
  const radius = Math.min(h, w) * .13;
  const cx = w * .65, cy = h * .49;
  ctx.globalAlpha = .48 + .52 * kick;
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c0a9fa';
  for (const age of ringAges) {
    const expansion = radius * (1.1 + 3.9 * age);
    ctx.globalAlpha = .82 * (1 - age / 1.22);
    ctx.lineWidth = Math.max(1, radius * .065 * (1 - age / 1.47));
    ctx.beginPath(); ctx.arc(cx, cy, expansion, 0, 2 * Math.PI); ctx.stroke();
  }
  ctx.strokeStyle = '#f2e8ff'; ctx.lineWidth = Math.max(1.25, radius * .031); ctx.globalAlpha = .39 + kick * .59;
  ctx.beginPath(); ctx.arc(cx, cy, radius * (.95 + kick * .22), 0, 2 * Math.PI); ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A single bounded surface for scenes whose geometry changes each frame. */
export function SceneCanvas({ effect, tempo, sample }: { effect: 'spectrum' | 'fireworks' | 'pulse' | 'rain' | 'meteors'; tempo: number; sample?: ReadSpectrum }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const speed = useRef(tempo);
  speed.current = tempo;
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const surface = element, ctx = context;
    const bins = new Uint8Array(512);
    const beat = initialBeat();
    const onsets: number[] = [];
    const heights = Float32Array.from(idle);
    const period = 1000 / (effect === 'spectrum' || effect === 'pulse' ? SPECTRUM_FPS : FIREWORKS_FPS);
    let raf = 0, last = 0, previous = 0, t = 0;
    let palettes: CanvasGradient[] = [];
    let pulseHalo: CanvasGradient | undefined;
    const resize = new ResizeObserver(([{ contentRect }]) => {
      const { width, height } = sceneBufferSize(contentRect.width, contentRect.height, devicePixelRatio);
      if (width === surface.width && height === surface.height && palettes.length) return;
      surface.width = width;
      surface.height = height;
      pulseHalo = ctx.createRadialGradient(width * .65, height * .49, 0, width * .65, height * .49, .43 * Math.min(width, height));
      pulseHalo.addColorStop(0, '#f2c9faac'); pulseHalo.addColorStop(.3, '#c17dec65'); pulseHalo.addColorStop(1, '#873ce500');
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
        else if (effect === 'rain') drawRain(ctx, width, height, t);
        else if (effect === 'meteors') drawMeteors(ctx, width, height, t);
        else if (effect === 'pulse' && pulseHalo) {
          const seconds = now / 1000;
          const live = sample?.(bins);
          if (live && sampleBeat(beat, bins, seconds)) onsets.push(seconds);
          if (!live) beat.kick *= .82;
          while (onsets.length && seconds - onsets[0] >= 1.22) onsets.shift();
          drawPulse(ctx, width, height, onsets.map((at) => seconds - at), beat.kick, pulseHalo);
        } else {
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
