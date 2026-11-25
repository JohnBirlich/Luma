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

const starColors = ['#edf8ff', '#bbcaff', '#ffe3d4', '#c1feef'];
const stars = Array.from({ length: 196 }, (_, i) => {
  const x = random(), depth = .15 + random() * .85;
  const y = i % 3 ? random() : .74 - .44 * x + (random() + random() - 1) * .33;
  return { x, y, depth, phase: random() * tau, light: random(), color: starColors[i % starColors.length], beacon: i % 19 === 0 };
});

export function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, energy: number) {
  // Pixel floors survive downsampling in compact panels; a sparse layer of bright beacons
  // reveals the motion without making the entire sky sparkle at once.
  const scale = Math.min(w, h);
  const density = scale < 96 ? 72 : scale < 155 ? 112 : scale < 240 ? 150 : stars.length;
  for (let i = 0; i < density; i++) {
    const { x, y, depth, phase, light, color, beacon } = stars[i];
    const px = w * fract(x + .038 * depth * Math.sin(t * .18 + phase * .11) + .0062 * t * depth);
    const py = h * fract(y + .032 * depth * Math.cos(t * .16 + phase * .13) - .0049 * t * depth);
    const r = (.66 + depth * light ** 2 * 1.48 + Number(beacon) * .61) * Math.max(.94, Math.min(1.65, scale / 360));
    const brightness = (.64 + light * .36) * (.83 + .17 * Math.sin(phase + t * (.76 + depth)));
    ctx.fillStyle = color;
    if (r > 1.28) {
      ctx.globalAlpha = brightness * (.13 + .11 * energy); dot(ctx, px, py, 2.8 * r);
      ctx.globalAlpha = brightness * .29; dot(ctx, px, py, 1.55 * r);
    }
    if (beacon) {
      ctx.globalAlpha = brightness * .47;
      ctx.fillRect(px - r * 2.25, py - .43, r * 4.5, .86);
      ctx.fillRect(px - .43, py - r * 2.25, .86, r * 4.5);
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
    ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1.1, h * .0039);
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

/** «Спектр»: one continuous multi-colour wave that leans on the live bands. */
/** «Спектр»: a few long multi-colour lines that ride the live bands and never sit still. */
export function drawSpectrum(ctx: CanvasRenderingContext2D, w: number, h: number, frames: SpectrumFrames, t = 0, energy = 0) {
  const newest = frames[0], previous = frames[1] ?? newest;
  // Each line reads the same bands but over its own smoothing window, so the curves
  // travel together and cross without ever drawing a second set of stripes.
  const level = (u: number, lag: number) => {
    const at = Math.min(SPECTRUM_STEPS - 1, Math.max(0, u * (SPECTRUM_STEPS - 1)));
    const index = Math.min(SPECTRUM_STEPS - 2, Math.floor(at)), f = at - index, ease = f * f * (3 - 2 * f);
    const now = newest[index] + (newest[index + 1] - newest[index]) * ease;
    const was = previous[index] + (previous[index + 1] - previous[index]) * ease;
    return Math.max(0, (.8 - lag * .35) * now + (.2 + lag * .35) * was) * (1 + .22 * energy);
  };
  const steps = Math.max(64, Math.min(220, Math.round(w / 7)));
  const lines = [
    { colors: ['#ff4fa3', '#f65cff', '#8f6bff'], lift: .46, amp: .30, width: .0052, alpha: .95, phase: 0 },
    { colors: ['#38a9ff', '#5ce7ff', '#a6c8ff'], lift: .39, amp: .24, width: .0044, alpha: .88, phase: 1.3 },
    { colors: ['#ffffff', '#dbe8ff', '#b9c9ff'], lift: .55, amp: .17, width: .0034, alpha: .78, phase: 2.4 },
    { colors: ['#6bffc4', '#39d98a', '#9cffd6'], lift: .33, amp: .21, width: .0042, alpha: .72, phase: 3.6 },
  ];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'screen';
  for (const [index, line] of lines.entries()) {
    const phase = t * (.42 + index * .07) + line.phase;
    const paint = ctx.createLinearGradient(0, 0, w, 0);
    paint.addColorStop(0, line.colors[0]);
    paint.addColorStop(.5, line.colors[1]);
    paint.addColorStop(1, line.colors[2]);
    const point = (u: number) => {
      const swell = .34 + .66 * (.5 + .5 * Math.sin(u * Math.PI * 1.8 + phase));
      const ride = level(u, index * .1) * swell + .07 * Math.sin(u * Math.PI * 3.1 - phase * .8);
      return h * line.lift - h * line.amp * ride;
    };
    ctx.beginPath();
    ctx.moveTo(0, point(0));
    let here = point(0);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, next = point(u);
      ctx.quadraticCurveTo((i - .5) / steps * w, here, u * w, (here + next) * .5);
      here = next;
    }
    ctx.strokeStyle = paint;
    ctx.lineWidth = Math.max(1.6, h * line.width);
    ctx.globalAlpha = line.alpha * .38;
    ctx.shadowColor = line.colors[1];
    ctx.shadowBlur = Math.max(10, h * .07);
    ctx.stroke();
    ctx.globalAlpha = line.alpha;
    ctx.shadowBlur = Math.max(4, h * .02);
    ctx.stroke();
  }
  ctx.restore();
}

// The logarithmic frequency columns and colors of the original Spectrum scene.
const bandEdges = [1, 2, 3, 4, 6, 8, 11, 15, 21, 29, 40, 55, 76, 105, 144, 202, 279, 393];
const idleBars = [.26,.36,.34,.5,.64,.6,.84,.9,.8,.68,.64,.71,.5,.43,.49,.28,.22];
export const spectrumColumns = () => new Float32Array(bandEdges.length - 1);
interface ColumnSample { time: number; bins?: Uint8Array }

/** Read band peaks from the Web Audio analyser. On pause, ease each bar back to a short baseline. */
export function advanceColumns(bars: Float32Array, dt: number, sample?: ColumnSample) {
  const attack = -Math.expm1(-24 * dt), release = -Math.expm1(-9 * dt);
  for (let i = 0; i < bars.length; i++) {
    let target = 0;
    if (sample?.bins) {
      let energy = 0;
      for (let bin = bandEdges[i]; bin < bandEdges[i + 1]; bin++) energy = Math.max(energy, sample.bins[bin] ?? 0);
      target = .84 * (energy / 255) ** 1.22;
    } else if (sample) {
      target = idleBars[i] * (.74 + .19 * Math.sin(sample.time * (2.35 + i * .11) + i * .88));
    }
    const value = bars[i] + (target - bars[i]) * (target > bars[i] ? attack : release);
    bars[i] = value > .001 ? value : 0;
  }
}

export function ribbonPalettes(ctx: CanvasRenderingContext2D, width: number) {
  return [
    ['#2fd0ff', '#37f0c4', '#c9ffe4'],
    ['#ffb03a', '#ff3d7f', '#9b7cff'],
    ['#8f9dff', '#5fe6ff', '#b2ffe9'],
  ].map(([from, through, to]) => {
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, from);
    gradient.addColorStop(.52, through);
    gradient.addColorStop(1, to);
    return { gradient, color: through };
  });
}

/**
 * «Кристаллы»: the same 17 band levels, read as faceted shards that grow out of a
 * dark baseline, mirror across the centre and glow from the inside.
 */
export function drawCrystals(ctx: CanvasRenderingContext2D, w: number, h: number, bars: Float32Array, palette: ReturnType<typeof ribbonPalettes>, t: number) {
  const count = bars.length;
  const midX = w / 2, base = h * .92, cell = (w * .92) / count;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < count; i++) {
      const value = bars[i] ?? 0;
      const rise = Math.max(.05, value) ** .92;
      const order = side < 0 ? i : count - 1 - i;
      const x = midX + side * (cell * (.5 + order) * .52);
      const width = cell * (.42 + .16 * (1 - rise));
      const height = h * (.08 + .58 * rise);
      const lean = .12 * Math.sin(t * .7 + i * .6 + side) * width;
      const { color } = palette[i % palette.length];
      const top = base - height;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + width / 2, base - height * .55);
      ctx.lineTo(x + width / 2 - lean, base);
      ctx.lineTo(x - width / 2 - lean, base);
      ctx.lineTo(x - width / 2, base - height * .55);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, top, 0, base);
      fill.addColorStop(0, color);
      fill.addColorStop(.55, `${color}9e`);
      fill.addColorStop(1, `${color}14`);
      ctx.fillStyle = fill;
      ctx.globalAlpha = .22 + .48 * rise;
      ctx.fill();
      ctx.globalAlpha = .55 + .4 * rise;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(.8, h * .0018);
      ctx.stroke();
      // A lit point at the tip reads even when the shard is short.
      ctx.globalAlpha = .4 + .5 * rise;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, top, Math.max(1, h * .006 * (.5 + rise)), 0, Math.PI * 2);
      ctx.fill();
    }
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
      ctx.lineWidth = Math.max(1.02, r * (i % 4 === 0 ? .034 : .025)); ctx.stroke();
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
// A single apex above a square base. Rotate around the vertical axis—no tumble or stretching.
const baseCorners: readonly Vector[] = [[-.9,.6,-.9],[.9,.6,-.9],[.9,.6,.9],[-.9,.6,.9]];
const pitch = -.235, cp = Math.cos(pitch), sp = Math.sin(pitch);
export const PRISM_TURN_SECONDS = 18;

export function pyramidProjection(w: number, h: number, seconds = 0) {
  const angle = .58 + (seconds % PRISM_TURN_SECONDS) * tau / PRISM_TURN_SECONDS;
  const cy = Math.cos(angle), sy = Math.sin(angle);
  const size = Math.min(h * .46, w * .247);
  const x0 = w * (w / h > 1.45 ? .66 : .57), y0 = h * .49;
  function project([x, y, z]: Vector): Point {
    const depth = z * cy - x * sy;
    const zoom = 1 + .078 * (y * sp + depth * cp);
    return [x0 + size * zoom * (x * cy + z * sy), y0 + size * zoom * (y * cp - depth * sp)];
  }
  const apex = project([0,-.94,0]), base = baseCorners.map(project);
  const faces = base.flatMap((a, i) => {
    const b = base[(i + 1) % base.length];
    const area = (a[0] - apex[0]) * (b[1] - apex[1]) - (a[1] - apex[1]) * (b[0] - apex[0]);
    return area > 0 ? [{ a, b, index: i }] : [];
  });
  return { apex, base, faces, size };
}

function triangle(ctx: CanvasRenderingContext2D, a: Point, b: Point, c: Point) {
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath();
}

const rayColors = ['ff799b', 'ffb879', 'ffe69a', '8af4bc', '7cddff', 'c5a6ff'];
const facetColors = ['#5eb7d1bb', '#9c96e0bc', '#759ee6c0', '#b59aefad'];
export function drawPrism(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, kick: number) {
  const { apex, base, faces, size } = pyramidProjection(w, h, t);
  const floor = Math.max(...base.map((point) => point[1]));
  const light = .86 + .10 * Math.sin(t * .96) + .13 * kick;
  const shadow = ctx.createRadialGradient(apex[0], floor + size * .12, 0, apex[0], floor + size * .12, size * 1.48);
  shadow.addColorStop(0, '#546fe449'); shadow.addColorStop(.55, '#493f9952'); shadow.addColorStop(1, '#211a5100');
  ctx.save();
  ctx.fillStyle = shadow; ctx.fillRect(0, floor - size * .4, w, h - floor + size * .4);
  ctx.lineJoin = 'round';

  for (const { a, b, index } of faces) {
    const bottom: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const fill = ctx.createLinearGradient(...apex, ...bottom);
    fill.addColorStop(0, '#d6f4ffd1'); fill.addColorStop(.38, '#607dba58');
    fill.addColorStop(.75, '#5488bb6a'); fill.addColorStop(1, facetColors[index]);
    triangle(ctx, apex, a, b);
    ctx.fillStyle = fill; ctx.fill();
  }

  function ray(from: Point, to: Point, color: string, outside: boolean) {
    const beam = ctx.createLinearGradient(...from, ...to);
    beam.addColorStop(0, `#${color}${outside ? 'ff' : 'a0'}`);
    beam.addColorStop(1, `#${color}${outside ? '08' : 'f8'}`);
    ctx.strokeStyle = beam;
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to);
    ctx.lineWidth = Math.max(2.4, size * .056); ctx.globalAlpha = light * .26; ctx.stroke();
    ctx.lineWidth = Math.max(1.14, size * .014); ctx.globalAlpha = light * .89; ctx.stroke();
  }
  const beamY = apex[1] + size * .96;
  const cuts = base.map(([x, y]) => apex[0] + (x - apex[0]) * ((beamY - apex[1]) / (y - apex[1])));
  const entry: Point = [Math.min(...cuts), beamY];
  const exit: Point = [Math.max(...cuts), beamY];
  ctx.globalCompositeOperation = 'screen';
  ray(entry, [-.07 * w, beamY + .13 * h], 'c8f7ff', true);
  ray(entry, exit, 'dfebff', false);
  rayColors.forEach((color, i) => {
    const spread = (i / (rayColors.length - 1) - .52) * h * .37;
    ray(exit, [w * 1.07, exit[1] - .09 * h + spread], color, true);
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // A bright silhouette and ridges keep the shape readable throughout the turn.
  ctx.lineWidth = Math.max(1.03, size * .016);
  ctx.strokeStyle = '#ddf4ffc0';
  for (const { a, b } of faces) { triangle(ctx, apex, a, b); ctx.stroke(); }
  ctx.fillStyle = '#effcff'; dot(ctx, ...apex, Math.max(.65, size * .017));
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
  paper.addColorStop(0, '#ad9df800'); paper.addColorStop(.32, '#bcaefe9e');
  paper.addColorStop(.69, '#a1e7fcd0'); paper.addColorStop(1, '#eccbfa1a');
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = paper;
  for (let line = -2; line <= 2; line++) {
    const dy = line * gap;
    ctx.beginPath(); ctx.moveTo(x(0), y(0) + dy);
    for (let i = 1; i <= 38; i++) { const p = i / 38; ctx.lineTo(x(p), y(p) + dy); }
    ctx.globalAlpha = line === 0 ? .83 : .60; ctx.lineWidth = Math.max(1, unit * .0034); ctx.stroke();
  }

  for (const note of notes) {
    const p = fract(note.start + t * note.speed);
    const px = x(p), py = y(p) + gap * (note.lane * .84 + .46 * Math.sin(note.phase + t * 1.12));
    const depth = .71 + .39 * Math.sin(p * Math.PI);
    const scale = Math.max(5, noteSize * note.size * depth * (1 + energy * .11));
    const fade = Math.min(1, p * 7, (1 - p) * 7);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(note.phase + t * .54) * .13 - .095);
    ctx.scale(scale, scale); ctx.globalAlpha = fade * (.69 + .27 * depth);
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
