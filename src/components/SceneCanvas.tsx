import { useEffect, useRef } from 'react';
import { initialBeat, sampleBeat } from '../shared/beat';
import type { ReadSpectrum } from '../player/useAudio';
import { compactScene, sceneBufferSize, sceneFps } from '../shared/scene-budget';

import { advanceColumns, advanceSpectrum, drawAurora, drawCrystals, drawNotes, drawOrbits, drawPrism, drawSpectrum, drawStars, flattenSpectrum, ribbonPalettes, seeded, spectrumColumns, spectrumFrames } from './scene-art';
import { CANVAS_EFFECTS, coastSpeed, isAmbientEffect } from '../shared/scene-motion';
import type { CanvasEffect } from '../shared/scene-motion';

const scatter = seeded(971);
const FIREWORKS_CYCLE = 7.2;
const bursts = Array.from({ length: 6 }, (_, i) => ({
  x: [.78, .29, .87, .53, .68, .19][i], y: [.19, .32, .44, .17, .52, .22][i], phase: i * FIREWORKS_CYCLE / 6,
  color: ['#ffbd9f', '#ceaffa', '#9affef', '#ffe2a3', '#ade0ff', '#ffb0d8'][i],
})).map((burst) => ({ ...burst, sparks: Array.from({ length: 36 }, (_, index) => {
  const angle = index * 2 * Math.PI / 36 + (scatter() - .5) * .13;
  const speed = .32 + scatter() * .39;
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed, life: .9 + scatter() * .62 };
}) }));

function fireworks(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const size = Math.min(w * .8, h);
  ctx.lineWidth = Math.max(1.2, Math.min(2.9, size / 224));
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
    const tip = Math.max(1.9, size / 304);
    for (let i = 0; i < sparks.length; i += 2) {
      const spark = sparks[i];
      if (age <= spark.life) { ctx.beginPath(); ctx.arc(cx + spark.x * distance * size, cy + (spark.y * distance + drift) * size, tip / 2, 0, 2 * Math.PI); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
}

const rainDrops = Array.from({ length: 100 }, () => ({ x: scatter(), y: scatter(), depth: scatter() }));
const reflections = Array.from({ length: 12 }, () => ({ x: .2 + scatter() * .79, y: .62 + scatter() * .34, phase: scatter() * 3 }));
const meteors = Array.from({ length: 12 }, () => ({ x: scatter(), y: scatter() * .7, phase: scatter() * 4.4, depth: scatter() }));
const fraction = (v: number) => v - Math.floor(v);

function drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.lineCap = 'round';
  for (let front = 0; front < 2; front++) {
    ctx.strokeStyle = front ? '#d7f1ffcb' : '#c7ceffd5';
    ctx.globalAlpha = front ? .73 : .5;
    ctx.lineWidth = front ? Math.max(1.28, h / 370) : Math.max(.83, h / 620);
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
  ctx.lineWidth = Math.max(.95, w / 1320);
  for (const { x, y, phase } of reflections) {
    const age = (t + phase) % 1.28;
    if (age > .76) continue;
    const radius = (h * .01 + h * .038 * age) * (.3 + y * .8);
    ctx.globalAlpha = (1 - age / .76) * .5;
    ctx.beginPath(); ctx.ellipse(x*w, y*h, radius, radius*.19, -.04, 0, Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawMeteors(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, speed: number) {
  ctx.lineCap = 'round';
  const scale = Math.min(w, h), dx = .77 * scale, dy = .45 * scale;
  for (const { x, y, phase, depth } of meteors) {
    const age = (t * (.78 + .29 * depth) + phase) % 4.4;
    if (age > 1.24) continue;
    const xx = (x + .14) * w - dx * age, yy = (y - .1) * h + dy * age;
    const tail = (.11 + depth * .35) * (.57 + .43 * speed);
    const fade = Math.min(1, age * 6) * (1 - age / 1.24);
    const light = ctx.createLinearGradient(xx, yy, xx + dx * tail, yy - dy * tail);
    light.addColorStop(0, '#f4faff'); light.addColorStop(.16, '#abccffbb'); light.addColorStop(.55, '#ad8dff57'); light.addColorStop(1, '#ad8dff00');
    ctx.strokeStyle = light;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + dx * tail, yy - dy * tail);
    ctx.globalAlpha = fade * .26; ctx.lineWidth = Math.max(1.9, scale * .015 * depth); ctx.stroke();
    ctx.globalAlpha = fade; ctx.lineWidth = Math.max(1.24, scale * .0045 * depth); ctx.stroke();
    ctx.fillStyle = '#e7f5ff'; ctx.beginPath(); ctx.arc(xx, yy, Math.max(1.05, scale * .0039 * depth), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const solarSparks = Array.from({ length: 64 }, () => ({
  progress: scatter(), speed: .14 + scatter() * .16, glow: .4 + scatter() * .6,
}));

/** A wind field: all strands skim the corona, then fan out downstream. */
function drawSolar(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, glow: number) {
  const cx = w * .86, cy = h * .31, r = Math.min(w, h) * .134;
  const filament = ctx.createLinearGradient(-.06 * w, 0, cx, 0);
  filament.addColorStop(0, '#793aac00'); filament.addColorStop(.28, '#bb66ee59');
  filament.addColorStop(.67, '#ff8a7ac8'); filament.addColorStop(.9, '#ffbf88e8'); filament.addColorStop(1, '#ffddbc00');
  const corona = ctx.createRadialGradient(cx, cy, r * .65, cx, cy, r * 2.6);
  corona.addColorStop(0, '#fff1bf'); corona.addColorStop(.20, '#ffb467b9'); corona.addColorStop(.43, '#ff674c52'); corona.addColorStop(1, '#ff6d4900');
  ctx.fillStyle = corona; ctx.fillRect(cx - 2.6 * r, cy - 2.6 * r, 5.2 * r, 5.2 * r);
  ctx.lineCap = 'round';
  const count = 22;
  for (let i = 0; i < count; i++) {
    const band = (i / (count - 1) - .5) * 2, bend = Math.sin(t * .73 + i * .29);
    const start = cx - r * (.5 + .22 * Math.cos(band * 2.6));
    const x = (p: number) => start - (start + w * .15) * p;
    const y = (p: number) => cy + r * band * .86 + h * (p * p * (.38 + band * .39) - .12 * Math.sin(p * Math.PI))
      + h * .075 * p * Math.sin(p * 7.3 - t * 1.3 + band * 2.3) + bend * r * p * .15;
    ctx.strokeStyle = filament; ctx.beginPath(); ctx.moveTo(start, y(0));
    for (let j = 1; j <= 24; j++) { const p = j / 24; ctx.lineTo(x(p), y(p)); }
    ctx.globalAlpha = (.12 + .06 * glow); ctx.lineWidth = Math.max(2.8, h * .016); ctx.stroke();
    ctx.globalAlpha = .52 + .19 * glow; ctx.lineWidth = Math.max(.9, h * (.0018 + .0014 * (i % 3 === 0 ? 1 : 0))); ctx.stroke();
    // Advect short light packets rather than moving the entire filament back and forth.
    for (let k = i; k < solarSparks.length; k += count) {
      const { progress, speed, glow: bright } = solarSparks[k], p = fraction(progress + t * speed);
      const rear = Math.max(0, p - .04 - .045 * bright);
      const packet = ctx.createLinearGradient(x(rear), y(rear), x(p), y(p));
      packet.addColorStop(0, '#fdaafe00'); packet.addColorStop(.84, '#ffd5b0b8'); packet.addColorStop(1, '#ffefc6');
      ctx.beginPath(); ctx.moveTo(x(rear), y(rear)); ctx.quadraticCurveTo(x((p + rear) / 2), y((p + rear) / 2), x(p), y(p));
      ctx.lineWidth = Math.max(1.09, h * .0044 * bright); ctx.strokeStyle = packet; ctx.globalAlpha = bright * Math.sin(Math.PI * p) ** .60; ctx.stroke();
    }
  }
  // A feathered terminator covers the roots, so the wind blends into the illuminated limb.
  ctx.globalAlpha = 1;
  const planet = ctx.createRadialGradient(cx, cy, r * .87, cx, cy, r * 1.16);
  planet.addColorStop(0, '#180f24'); planet.addColorStop(.33, '#281129'); planet.addColorStop(.52, '#be664ed9');
  planet.addColorStop(.70, '#ffcf9b81'); planet.addColorStop(1, '#ffb16500');
  ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(cx, cy, r * 1.17, 0, Math.PI * 2); ctx.fill();
}

function drawPulse(ctx: CanvasRenderingContext2D, w: number, h: number, onsets: number[], now: number, kick: number, motion: number, halo: CanvasGradient) {
  const radius = Math.min(h, w) * .13;
  const cx = w * .65, cy = h * .49;
  ctx.globalAlpha = .48 + .52 * kick;
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c0a9fa';
  for (const onset of onsets) {
    const age = now - onset;
    const expansion = radius * (1.1 + 3.9 * age);
    ctx.globalAlpha = .82 * motion * (1 - age / 1.22);
    ctx.lineWidth = Math.max(1, radius * .065 * (1 - age / 1.47));
    ctx.beginPath(); ctx.arc(cx, cy, expansion, 0, 2 * Math.PI); ctx.stroke();
  }
  ctx.strokeStyle = '#f2e8ff'; ctx.lineWidth = Math.max(1.25, radius * .031); ctx.globalAlpha = .39 + kick * .59;
  ctx.beginPath(); ctx.arc(cx, cy, radius * (.95 + kick * .22), 0, 2 * Math.PI); ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Keep the scene clock across transport changes and only run animations for a visible surface. */
export function SceneCanvas({ effect, playing, enabled, tempo, sample }: {
  effect: CanvasEffect; playing: boolean; enabled: boolean; tempo: number; sample?: ReadSpectrum;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef({ playing, enabled, tempo, sample });
  const wake = useRef<() => void>(undefined);
  useEffect(() => {
    runtime.current = { playing, enabled, tempo, sample };
    wake.current?.();
  }, [playing, enabled, tempo, sample]);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const surface = element, ctx = context;
    const bins = new Uint8Array(512), beat = initialBeat();
    const onsets: number[] = [];
    const terrain = effect === 'spectrum' ? spectrumFrames() : undefined;
    const bars = effect === 'columns' ? spectrumColumns() : undefined;
    let barColors: ReturnType<typeof ribbonPalettes> | undefined;
    const reactive = !!(bars || terrain) || effect === 'pulse';
    const ambient = isAmbientEffect(effect);
    const coast = !ambient && CANVAS_EFFECTS[effect];
    let period = 1000 / sceneFps(false, reactive);
    let raf = 0, last = 0, previous = 0, t = 0, velocity = 0, elapsed = 0;
    let pulseHalo: CanvasGradient | undefined;
    function paint(dt: number) {
      const { width: w, height: h } = surface;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      elapsed += dt;
      const { playing: active, enabled: canMove, sample: read } = runtime.current;
      const live = dt > 0 && active && canMove && read?.(bins);
      const onset = live ? sampleBeat(beat, bins, elapsed) : false;
      if (!live && dt) beat.kick *= Math.exp(-dt * 8);
      if (terrain) {
        if (!canMove || (!active && !velocity)) flattenSpectrum(terrain);
        else if (dt > 0) advanceSpectrum(terrain, dt, live ? { time: t, bins, kick: beat.kick }
          : active && !read ? { time: t, kick: 0 } : undefined);
        drawSpectrum(ctx, w, h, terrain, t, beat.kick);
      } else if (bars && barColors) {
        if (!canMove || (!active && !velocity)) bars.fill(0);
        else if (dt > 0) advanceColumns(bars, dt, live ? { time: t, bins } : active && !read ? { time: t } : undefined);
        drawCrystals(ctx, w, h, bars, barColors, t);
      } else if (effect === 'pulse' && pulseHalo) {
        if (onset || (!live && runtime.current.playing && Math.floor(t / 1.25) !== Math.floor((t - dt * velocity / runtime.current.tempo) / 1.25))) onsets.push(t);
        while (onsets.length && (t - onsets[0] >= 1.22 || !velocity)) onsets.shift();
        drawPulse(ctx, w, h, onsets, t, velocity ? beat.kick : 0, velocity, pulseHalo);
      } else if (effect === 'fireworks') fireworks(ctx, w, h, t + 1.05);
      else if (effect === 'rain') drawRain(ctx, w, h, t);
      else if (effect === 'meteors') drawMeteors(ctx, w, h, t, velocity);
      else if (effect === 'solar') drawSolar(ctx, w, h, t, beat.kick);
      else if (effect === 'aurora') drawAurora(ctx, w, h, t, beat.kick);
      else if (effect === 'stars') drawStars(ctx, w, h, t, beat.kick);
      else if (effect === 'orbits') drawOrbits(ctx, w, h, t);
      else if (effect === 'prism') drawPrism(ctx, w, h, t, beat.kick);
      else if (effect === 'notes') drawNotes(ctx, w, h, t, beat.kick);
    }
    function schedule() {
      const { playing: active, enabled: canMove } = runtime.current;
      if (!canMove || (!(ambient || active) && (!coast || !velocity))) {
        if (raf) cancelAnimationFrame(raf);
        if (velocity) { velocity = 0; paint(0); }
        raf = last = previous = 0;
      } else if (!raf) {
        previous = 0;
        raf = requestAnimationFrame(draw);
      }
    }
    function draw(now: number) {
      raf = 0;
      const delta = now - last;
      if (delta >= period - 1) {
        const dt = previous ? Math.min((now - previous) / 1000, .105) : 0;
        previous = now;
        last = delta >= period ? now - delta % period : now;
        const { playing: active, enabled: canMove, tempo: factor } = runtime.current;
        const next = canMove ? coast ? coastSpeed(velocity, active, dt) : Number(ambient || active) : 0;
        t += (next + velocity) * .5 * dt / factor;
        velocity = next;
        paint(dt);
      }
      if (runtime.current.enabled && (ambient || runtime.current.playing || (coast && velocity))) raf = requestAnimationFrame(draw);
      else previous = last = 0;
    }
    const resize = new ResizeObserver(([{ contentRect }]) => {
      period = 1000 / sceneFps(compactScene(contentRect.width, contentRect.height), reactive);
      const { width, height } = sceneBufferSize(contentRect.width, contentRect.height, devicePixelRatio);
      if (width === surface.width && height === surface.height) return;
      surface.width = width;
      surface.height = height;
      if (bars && width && height) barColors = ribbonPalettes(ctx, width);
      if (effect === 'pulse' && width && height) {
        pulseHalo = ctx.createRadialGradient(width * .65, height * .49, 0, width * .65, height * .49, .45 * Math.min(width, height));
        pulseHalo.addColorStop(0, '#f1c9face'); pulseHalo.addColorStop(.28, '#b883e371'); pulseHalo.addColorStop(1, '#853ae500');
      }
      paint(0);
    });
    surface.width = surface.height = 0;
    // Observe physical pixels as well, so moving the window between displays updates the raster.
    resize.observe(surface, { box: 'device-pixel-content-box' });
    wake.current = schedule;
    schedule();
    return () => { resize.disconnect(); cancelAnimationFrame(raf); wake.current = undefined; };
  }, [effect]);
  return <canvas className="scene-canvas" ref={canvas} aria-hidden="true" />;
}
