// Small Canvas 2D studies. The caller owns the clock, resolution budget and motion policy.
const tau = 2 * Math.PI;
const fract = (n: number) => n - Math.floor(n);
export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
const random = seeded(42013);

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, tau); ctx.fill();
}

const starColors = ['#d9efff', '#a5b7fd', '#ffdcd1'];
const stars = Array.from({ length: 224 }, (_, i) => {
  const x = random(), depth = .15 + random() * .85;
  const y = i % 3 ? random() : .74 - .44 * x + (random() + random() - 1) * .33;
  return { x, y, depth, phase: random() * tau, light: random(), color: starColors[i % 3] };
});

export function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, energy: number) {
  // Independent depth planes follow slightly different arcs. Bright points get round halos, not crosses.
  const scale = Math.min(w, h);
  for (const { x, y, depth, phase, light, color } of stars) {
    const px = w * fract(x + .024 * depth * Math.sin(t * .12 + phase * .1) + .0028 * t * depth);
    const py = h * fract(y + .027 * depth * Math.cos(t * .11 + phase * .11) - .002 * t * depth);
    const r = (.37 + depth * (light ** 4) * 1.36) * Math.max(.64, scale / 430);
    const brightness = (.36 + light * .60) * (.83 + .17 * Math.sin(phase + t * (1 + depth)));
    ctx.fillStyle = color;
    if (r > 1.16) {
      ctx.globalAlpha = brightness * (.12 + .1 * energy); dot(ctx, px, py, r * 3.2);
      ctx.globalAlpha *= 1.9; dot(ctx, px, py, r * 1.72);
    }
    ctx.globalAlpha = brightness; dot(ctx, px, py, r);
  }
  ctx.globalAlpha = 1;
}

export function drawAurora(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, energy: number) {
  const count = Math.min(160, Math.max(64, Math.floor(w / 5)));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let layer = 0; layer < 3; layer++) {
    const x0 = -w * .12, span = w * 1.25, dt = t * (.38 - layer * .055);
    const offset = .43 + .13 * layer;
    const edge = (u: number) => h * (offset + .13 * Math.sin(u * 7 - dt + layer) + .045 * Math.sin(u * 18 + dt + layer) - .20 * u);
    const light = layer === 1 ? '180,133,255' : layer === 2 ? '78,186,255' : '86,255,183';
    // Follow a curved lower hem with overlapping vertical folds, each fading into the sky.
    for (let i = 0; i <= count; i++) {
      const u = i / count, x = x0 + u * span, y = edge(u);
      const folds = .58 + .29 * Math.sin(u * (33 + layer * 6) + dt * 1.7) + .13 * Math.sin(u * 105 - dt * 2);
      const height = h * (.18 + .37 * folds + .09 * Math.sin(u * 5 + dt));
      const strength = (layer === 0 ? .71 : .44) * (1 + .22 * energy) * Math.sin(Math.PI * u) ** .6;
      const glow = ctx.createLinearGradient(x, y - height, x, y + h * .025);
      glow.addColorStop(0, `rgba(${light},0)`);
      glow.addColorStop(.52, `rgba(${light},${strength * folds * .22})`);
      glow.addColorStop(.88, `rgba(${light},${strength * (.30 + .7 * folds)})`);
      glow.addColorStop(1, `rgba(${light},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.moveTo(x - span / count, y + h * .025);
      ctx.lineTo(x + span / count, y + h * .025);
      ctx.lineTo(x + span / count + h * .075, y - height);
      ctx.lineTo(x - span / count + h * .075, y - height); ctx.fill();
    }
    const rim = ctx.createLinearGradient(0, 0, w, 0);
    rim.addColorStop(0, `rgba(${light},0)`); rim.addColorStop(.46, `rgba(${light},.48)`); rim.addColorStop(1, `rgba(${light},.08)`);
    ctx.strokeStyle = rim; ctx.lineWidth = Math.max(.8, h * .0035);
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const u = i / count;
      if (!i) ctx.moveTo(x0, edge(u)); else ctx.lineTo(x0 + u * span, edge(u));
    }
    ctx.stroke();
  }
  ctx.restore();
}

export const SPECTRUM_STEPS = 48;
export const SPECTRUM_DEPTH = 10;
const bandStarts = Array.from({ length: SPECTRUM_STEPS + 1 }, (_, i) => Math.floor(420 ** (i / SPECTRUM_STEPS)));
export type SpectrumFrames = Float32Array[];
export const spectrumFrames = (): SpectrumFrames => Array.from({ length: SPECTRUM_DEPTH }, () => new Float32Array(SPECTRUM_STEPS));
export const flattenSpectrum = (frames: SpectrumFrames) => frames.forEach((row) => row.fill(0));

interface SpectrumSample { time: number; kick: number; bins?: Uint8Array }

/** Time-based attack/release. With playback stopped, every ridge eases in place to a flat line. */
export function advanceSpectrum(frames: SpectrumFrames, dt: number, sample?: SpectrumSample) {
  const release = Math.exp(-8 * dt);
  if (!sample) {
    for (const row of frames) for (let i = 0; i < row.length; i++) {
      const value = row[i] * release;
      row[i] = value > .002 ? value : 0;
    }
    return;
  }
  const { time, kick, bins } = sample;
  const previous = frames[0], row = frames.pop()!;
  const attack = 1 - Math.exp(-22 * dt);
  for (let i = 0; i < SPECTRUM_STEPS; i++) {
    const u = i / (SPECTRUM_STEPS - 1);
    let target: number;
    if (bins) {
      let peak = 0, total = 0;
      const from = bandStarts[i], end = Math.max(from + 1, bandStarts[i + 1]);
      for (let bin = from; bin < end; bin++) {
        const value = bins[bin] ?? 0;
        peak = Math.max(peak, value); total += value;
      }
      const band = ((.55 * peak + .45 * total / (end - from)) / 255) ** 1.48;
      const accent = Math.exp(-18 * (u - .26) ** 2) * kick * .23;
      target = Math.min(1, band * .91 + accent);
    } else {
      // Decorative motion for the preview or when no audio analyser is available.
      target = .08 + .22 * Math.sin(Math.PI * u) ** 2 * (.73 + .27 * Math.sin(u * 16 - time * 2.2))
        + .09 * Math.sin(u * 9 + time * 1.4) ** 2;
    }
    row[i] = previous[i] + (target - previous[i]) * (target > previous[i] ? attack : 1 - release);
  }
  frames.unshift(row);
}

export function spectrumSpan(depth: number): readonly [number, number] {
  return [.018 + .036 * depth, .987 - .031 * depth];
}

export function drawSpectrum(ctx: CanvasRenderingContext2D, w: number, h: number, frames: SpectrumFrames) {
  const light = ctx.createLinearGradient(0, 0, w, 0);
  light.addColorStop(0, '#a26cfa'); light.addColorStop(.26, '#fba5f8'); light.addColorStop(.55, '#a4b9ff');
  light.addColorStop(.81, '#63ecff'); light.addColorStop(1, '#a7ffd8');
  ctx.save(); ctx.strokeStyle = light; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'screen';
  for (let row = frames.length - 1; row >= 0; row--) {
    const depth = row / (frames.length - 1), base = h * (.91 - .53 * depth);
    const shape = frames[row];
    const [start, end] = spectrumSpan(depth);
    const step = w * (end - start) / (SPECTRUM_STEPS - 1), offset = start * w;
    const y = (i: number) => {
      const u = i / (SPECTRUM_STEPS - 1);
      const smooth = .6 * shape[i] + .2 * (shape[Math.max(0, i - 1)] + shape[Math.min(SPECTRUM_STEPS - 1, i + 1)]);
      return base - h * (.52 - .24 * depth) * smooth * (.65 + .35 * Math.sin(Math.PI * u));
    };
    ctx.beginPath(); ctx.moveTo(offset, y(0));
    let here = y(0);
    for (let i = 1; i < SPECTRUM_STEPS; i++) {
      const next = y(i);
      ctx.quadraticCurveTo(offset + (i - 1) * step, here, offset + (i - .5) * step, (here + next) * .5);
      here = next;
    }
    ctx.lineTo(end * w, here);
    const core = Math.max(1, h * (.0055 - .0021 * depth));
    ctx.globalAlpha = .19 - .08 * depth; ctx.lineWidth = core * 4; ctx.stroke();
    ctx.globalAlpha = .93 - .41 * depth; ctx.lineWidth = core; ctx.stroke();
  }
  ctx.restore();
}

export function drawOrbits(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const r = Math.min(h * .252, w * .22), x = w * .66, y = h * .52;
  const angle = -.27 + .11 * Math.sin(t * .33), tilt = .39 + .072 * Math.sin(t * .27);
  function rings(front: boolean) {
    for (let i = 0; i < 23; i++) {
      const rr = r * (1.18 + .042 * i + (i > 12 ? .11 : 0));
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * tilt, angle, front ? 0 : Math.PI, front ? Math.PI : tau);
      ctx.strokeStyle = i % 4 === 0 ? '#f7d6a3a0' : i > 13 ? '#96aef26c' : '#d2b7bc91';
      ctx.lineWidth = Math.max(.85, r * (i % 4 === 0 ? .034 : .025)); ctx.stroke();
    }
  }
  function moons(front: boolean) {
    for (let i = 0; i < 3; i++) {
      const a = t * (.48 - i * .10) + i * 2.6 + 1.1;
      const rr = r * (1.58 + i * .32), u = rr * Math.cos(a), v = rr * tilt * Math.sin(a);
      if ((v >= 0) !== front) continue;
      const xx = x + u * Math.cos(angle) - v * Math.sin(angle), yy = y + u * Math.sin(angle) + v * Math.cos(angle);
      const size = Math.max(1.2, r * (.048 + i * .018));
      ctx.fillStyle = '#bcd8ff3b'; dot(ctx, xx, yy, size * 2);
      const shade = ctx.createRadialGradient(xx - size / 3, yy - size / 3, 0, xx, yy, size);
      shade.addColorStop(0, '#fff4dd'); shade.addColorStop(1, '#7888b2'); ctx.fillStyle = shade; dot(ctx, xx, yy, size);
    }
  }
  rings(false); moons(false);
  const light = ctx.createRadialGradient(x - r * .43, y - r * .5, r * .04, x + r * .17, y + r * .17, r * 1.19);
  light.addColorStop(0, '#fff3d4'); light.addColorStop(.41, '#b9a1cc'); light.addColorStop(.71, '#716896'); light.addColorStop(1, '#111329');
  ctx.fillStyle = light; dot(ctx, x, y, r);
  ctx.save(); ctx.clip(); ctx.translate(x, y); ctx.rotate(angle);
  const belts = ctx.createLinearGradient(-r, 0, r, r * .35);
  belts.addColorStop(0, '#f9d8bb75'); belts.addColorStop(.6, '#e3c1d52e'); belts.addColorStop(1, '#7261a900');
  ctx.strokeStyle = belts;
  for (let i = 0; i < 17; i++) {
    const dy = (i / 8 - 1) * r, offset = r * Math.sin(t * .53 + i * 1.7) * .035;
    ctx.globalAlpha = .41 + .42 * Math.sin(i * 1.87) ** 2;
    ctx.lineWidth = .75 + r * (.08 + .048 * Math.cos(i * 3.3));
    ctx.beginPath(); ctx.moveTo(-r, dy - offset); ctx.quadraticCurveTo(-r * .06, dy + r * .34, r, dy + offset); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#a7bef65b'; ctx.lineWidth = Math.max(.7, r * .013); ctx.beginPath(); ctx.arc(x, y, r, 0, tau); ctx.stroke();
  rings(true); moons(true);
}

type Point = [number, number];
type Vector = [number, number, number];
// A square base and a single apex, viewed from above and to one side. No animated pose.
const baseCorners: readonly Vector[] = [[-.9,.6,-.9],[.9,.6,-.9],[.9,.6,.9],[-.9,.6,.9]];
const yaw = .58, pitch = -.24;
const aim = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)] as const;

export function pyramidProjection(w: number, h: number) {
  const [cy, sy, cp, sp] = aim;
  const size = Math.min(h * .46, w * .247);
  const x0 = w * (w / h > 1.45 ? .66 : .57), y0 = h * .49;
  function project([x, y, z]: Vector): Point {
    const depth = z * cy - x * sy;
    const zoom = 1 + .078 * (y * sp + depth * cp);
    return [x0 + size * zoom * (x * cy + z * sy), y0 + size * zoom * (y * cp - depth * sp)];
  }
  return { apex: project([0,-.94,0]), base: baseCorners.map(project), size };
}

function triangle(ctx: CanvasRenderingContext2D, a: Point, b: Point, c: Point) {
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath();
}

const rayColors = ['ff799b', 'ffb879', 'ffe69a', '8af4bc', '7cddff', 'c5a6ff'];
export function drawPrism(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, kick: number) {
  const { apex, base: [left, , right, ridge], size } = pyramidProjection(w, h);
  const light = .85 + .10 * Math.sin(t * .96) + .13 * kick;
  const shadow = ctx.createRadialGradient(apex[0], ridge[1] + size * .16, 0, apex[0], ridge[1] + size * .16, size * 1.7);
  shadow.addColorStop(0, '#546fe44d'); shadow.addColorStop(.55, '#493f9952'); shadow.addColorStop(1, '#211a5100');
  ctx.save();
  ctx.fillStyle = shadow; ctx.fillRect(0, ridge[1] - size * .4, w, h - ridge[1] + size * .4);

  const cool = ctx.createLinearGradient(...apex, ...left);
  cool.addColorStop(0, '#bde9fcba'); cool.addColorStop(.4, '#538bdd52'); cool.addColorStop(1, '#567ccead');
  const warm = ctx.createLinearGradient(...ridge, ...apex);
  warm.addColorStop(0, '#ab8bf9c8'); warm.addColorStop(.42, '#867bd06b'); warm.addColorStop(.76, '#54abc150'); warm.addColorStop(1, '#d4f4ffc9');
  triangle(ctx, apex, left, ridge); ctx.fillStyle = cool; ctx.fill();
  triangle(ctx, apex, ridge, right); ctx.fillStyle = warm; ctx.fill();

  function ray(from: Point, to: Point, color: string, outside: boolean) {
    const beam = ctx.createLinearGradient(...from, ...to);
    beam.addColorStop(0, `#${color}${outside ? 'ff' : 'a0'}`);
    beam.addColorStop(1, `#${color}${outside ? '08' : 'f8'}`);
    ctx.strokeStyle = beam;
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to);
    ctx.lineWidth = Math.max(2.4, size * .057); ctx.globalAlpha = light * .24; ctx.stroke();
    ctx.lineWidth = Math.max(.9, size * .0125); ctx.globalAlpha = light * .89; ctx.stroke();
  }
  const facetPoint = (a: Point, b: Point, weights: readonly [number, number, number]): Point => [
    apex[0] * weights[0] + a[0] * weights[1] + b[0] * weights[2],
    apex[1] * weights[0] + a[1] * weights[1] + b[1] * weights[2],
  ];
  const entry = facetPoint(left, ridge, [.36,.50,.14]);
  const exit = facetPoint(ridge, right, [.29,.13,.58]);
  ctx.globalCompositeOperation = 'screen';
  ray(entry, [-.08 * w, entry[1] + .12 * h], 'bdf8ff', true);
  ray(entry, exit, 'dce9ff', false);
  rayColors.forEach((color, i) => {
    const spread = (i / (rayColors.length - 1) - .52) * h * .37;
    ray([exit[0], exit[1] + size * .007 * i], [w * 1.07, exit[1] - .10 * h + spread], color, true);
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // One silhouette and a central ridge make the pyramid readable in a tiny preview as well.
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(...apex); ctx.lineTo(...left); ctx.lineTo(...ridge); ctx.lineTo(...right); ctx.closePath();
  ctx.lineWidth = Math.max(.8, size * .016); ctx.strokeStyle = '#dcf7ffd6'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(...apex); ctx.lineTo(...ridge);
  ctx.lineWidth = Math.max(.62, size * .012); ctx.strokeStyle = '#e9e1ffca'; ctx.stroke();
  ctx.fillStyle = '#effcff'; dot(ctx, ...apex, Math.max(.65, size * .014));
  ctx.restore();
}

const noteColors = ['#f1c4ff', '#a9ebff', '#ffe0ae', '#d2ceff'];
const notes = Array.from({ length: 17 }, (_, i) => ({
  start: i / 17, phase: random() * tau, speed: .085 + random() * .034, lane: (i % 5) - 2,
  type: i % 3, size: .70 + random() * .46, color: noteColors[i % noteColors.length],
}));

/** Quarter note, eighth note and a beamed pair; draw glyphs instead of relying on font coverage. */
function noteGlyph(ctx: CanvasRenderingContext2D, type: number) {
  function head(x: number, y: number) {
    ctx.beginPath(); ctx.ellipse(x, y, .201, .131, -.34, 0, tau); ctx.fill();
  }
  function stem(x: number, y: number, end: number) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, end); ctx.stroke();
  }
  ctx.lineWidth = .080;
  if (type === 2) {
    head(-.34,.40); stem(-.171,.37,-.43);
    head(.25,.23); stem(.419,.20,-.59);
    ctx.beginPath(); ctx.moveTo(-.211,-.44); ctx.lineTo(.459,-.61);
    ctx.lineTo(.459,-.445); ctx.lineTo(-.211,-.275); ctx.closePath(); ctx.fill();
    return;
  }
  head(-.10, .37); stem(.069, .34, -.51);
  if (type === 1) {
    ctx.beginPath(); ctx.moveTo(.044,-.52); ctx.bezierCurveTo(.12,-.31,.49,-.29,.35,.075);
    ctx.bezierCurveTo(.37,-.18,.18,-.19,.044,-.33); ctx.closePath(); ctx.fill();
  }
}

export function drawNotes(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, energy: number) {
  const unit = Math.min(w, h);
  const x = (p: number) => w * (.11 + p * .95);
  const y = (p: number) => h * (.88 - p * .65 + .101 * Math.sin(p * tau - 1.2));
  const gap = Math.max(3, Math.min(h * .034, w * .028));
  const noteSize = Math.min(unit * .109, w * .071);
  const paper = ctx.createLinearGradient(x(0), 0, x(1), 0);
  paper.addColorStop(0, '#ad9df800'); paper.addColorStop(.32, '#ad9df875');
  paper.addColorStop(.69, '#8bdafca0'); paper.addColorStop(1, '#eccbfa1a');
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = paper;
  for (let line = -2; line <= 2; line++) {
    const dy = line * gap;
    ctx.beginPath(); ctx.moveTo(x(0), y(0) + dy);
    for (let i = 1; i <= 38; i++) { const p = i / 38; ctx.lineTo(x(p), y(p) + dy); }
    ctx.globalAlpha = line === 0 ? .83 : .60; ctx.lineWidth = Math.max(.74, unit * .0032); ctx.stroke();
  }

  for (const note of notes) {
    const p = fract(note.start + t * note.speed);
    const px = x(p), py = y(p) + gap * (note.lane * .84 + .46 * Math.sin(note.phase + t * 1.12));
    const depth = .71 + .39 * Math.sin(p * Math.PI);
    const scale = Math.max(3.4, noteSize * note.size * depth * (1 + energy * .11));
    const fade = Math.min(1, p * 7, (1 - p) * 7);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(note.phase + t * .54) * .13 - .095);
    ctx.scale(scale, scale); ctx.globalAlpha = fade * (.58 + .29 * depth);
    ctx.fillStyle = ctx.strokeStyle = note.color;
    ctx.shadowColor = note.color; ctx.shadowBlur = Math.min(14, scale * (.37 + energy * .16));
    noteGlyph(ctx, note.type); ctx.restore();
    if (note.type !== 2) {
      ctx.fillStyle = note.color; ctx.globalAlpha = fade * (.22 + energy * .26);
      dot(ctx, px - scale * 1.04, py + scale * .20, Math.max(.65, scale * .042));
      dot(ctx, px + scale * .71, py - scale * .63, Math.max(.5, scale * .028));
    }
  }
  ctx.restore();
}
