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
  const steps = Math.max(56, Math.min(160, Math.round(w / 9)));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineJoin = 'round';
  // Every curtain is one smooth sheet: its top hem rises and falls in wide folds and
  // both ends pinch to nothing, so no column, seam or hard band can show.
  const trace = (top: (u: number) => number, hem: (u: number) => number) => {
    ctx.beginPath();
    ctx.moveTo(0, top(0));
    let here = top(0);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, next = top(u);
      ctx.quadraticCurveTo((i - .5) / steps * w, here, u * w, (here + next) * .5);
      here = next;
    }
    for (let i = steps; i >= 0; i--) {
      const u = i / steps, next = hem(u);
      ctx.quadraticCurveTo((i + .5) / steps * w, next, u * w, next);
    }
    ctx.closePath();
  };
  for (let layer = 0; layer < 3; layer++) {
    const drift = t * (.3 - layer * .045);
    const light = layer === 1 ? '188,142,255' : layer === 2 ? '96,198,255' : '98,255,190';
    const strength = (layer === 0 ? .8 : .52) * (1 + .2 * Math.min(1, energy));
    const base = h * (.5 + .1 * layer);
    const hem = (u: number) => base + h * (.1 * Math.sin(u * 4.6 - drift + layer * .9) + .03 * Math.sin(u * 9 + drift * 1.2) - .12 * u);
    const height = (u: number) => h * (.26 + .1 * Math.sin(u * 2.4 + drift * .7 + layer)
      + .06 * Math.sin(u * 4.1 - drift * .9) + .04 * Math.sin(u * 7.3 + drift * 1.5 + layer * 1.4)) * (1 + .1 * energy);
    const taper = (u: number) => Math.sin(Math.PI * u) ** .6;
    const top = (u: number) => hem(u) - height(u) * taper(u);
    const paint = ctx.createLinearGradient(0, 0, w, 0);
    paint.addColorStop(0, `rgba(${light},0)`);
    paint.addColorStop(.18, `rgba(${light},${strength * .3})`);
    paint.addColorStop(.46, `rgba(${light},${strength * .62})`);
    paint.addColorStop(.74, `rgba(${light},${strength * .34})`);
    paint.addColorStop(1, `rgba(${light},0)`);
    for (const [spread, alpha] of [[.016, .22], [0, 1]] as const) {
      const inner = (u: number) => top(u) - h * spread * taper(u);
      trace(inner, (u) => hem(u) + h * spread * taper(u));
      ctx.fillStyle = paint;
      ctx.globalAlpha = alpha * (spread ? 1 : .92);
      ctx.shadowColor = `rgba(${light},.6)`;
      ctx.shadowBlur = spread ? Math.max(14, h * .07) : Math.max(6, h * .03);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    // A lit crest along the upper hem: the sheet's edge, not a border.
    ctx.beginPath();
    ctx.moveTo(0, top(0));
    let crest = top(0);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, next = top(u);
      ctx.quadraticCurveTo((i - .5) / steps * w, crest, u * w, (crest + next) * .5);
      crest = next;
    }
    const rim = ctx.createLinearGradient(0, 0, w, 0);
    rim.addColorStop(0, `rgba(${light},0)`);
    rim.addColorStop(.45, `rgba(${light},${Math.min(.8, strength * .85)})`);
    rim.addColorStop(1, `rgba(${light},0)`);
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, h * .0032);
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
export function drawSpectrum(ctx: CanvasRenderingContext2D, w: number, h: number, frames: SpectrumFrames, t = 0, energy = 0) {
  const newest = frames[0], previous = frames[1] ?? newest;
  // Both the newest bands and the one before them feed the silhouette, so the wave
  // glides between frames instead of stepping with the analyser's 48 bands.
  const level = (u: number) => {
    const at = Math.min(SPECTRUM_STEPS - 1, Math.max(0, u * (SPECTRUM_STEPS - 1)));
    const index = Math.min(SPECTRUM_STEPS - 2, Math.floor(at)), f = at - index, ease = f * f * (3 - 2 * f);
    const now = newest[index] + (newest[index + 1] - newest[index]) * ease;
    const was = previous[index] + (previous[index + 1] - previous[index]) * ease;
    // A gentle travelling swell keeps the ribbon alive between beats.
    const swell = .06 + .04 * Math.sin(u * 6.2 - t * .9);
    return Math.max(0, .74 * now + .26 * was) * (1 + .17 * energy) + swell * .35;
  };
  const layers = [
    { palette: ['#7b4dff', '#ff5fc8', '#ffd166'], lift: .60, size: .30, alpha: .55 },
    { palette: ['#2f8bff', '#59f2ff', '#a8ffcf'], lift: .53, size: .24, alpha: .42 },
    { palette: ['#ff3d7f', '#c86bff', '#7ee8ff'], lift: .46, size: .18, alpha: .34 },
  ];
  const samples = Math.max(48, Math.min(180, Math.round(w / 9)));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [index, layer] of layers.entries()) {
    const phase = t * (.5 + index * .16) + index * 1.7;
    const mid = h * layer.lift, amp = h * layer.size;
    const crest = (u: number) => {
      const wave = .72 + .28 * Math.sin(u * Math.PI * 2.2 + phase) * Math.sin(u * Math.PI);
      return mid - amp * (level(u) * 1.35 + .12) * wave;
    };
    const hem = (u: number) => {
      const wave = .74 + .26 * Math.cos(u * Math.PI * 1.7 - phase * .8);
      return mid + amp * (.42 + .5 * level(u)) * wave;
    };
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, layer.palette[0]);
    gradient.addColorStop(.5, layer.palette[1]);
    gradient.addColorStop(1, layer.palette[2]);
    ctx.beginPath();
    ctx.moveTo(-2, crest(0));
    let here = crest(0);
    for (let i = 1; i <= samples; i++) {
      const u = i / samples, next = crest(u);
      ctx.quadraticCurveTo((i - .5) / samples * w, here, u * w, (here + next) * .5);
      here = next;
    }
    for (let i = samples; i >= 0; i--) {
      const u = i / samples, next = hem(u);
      ctx.quadraticCurveTo((i + .5) / samples * w, next, u * w, next);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.globalAlpha = layer.alpha;
    ctx.shadowColor = layer.palette[1];
    ctx.shadowBlur = Math.max(6, h * .05);
    ctx.fill();
    ctx.shadowBlur = 0;
    // A bright crest line keeps the wave readable on busy covers.
    ctx.beginPath();
    ctx.moveTo(0, crest(0));
    here = crest(0);
    for (let i = 1; i <= samples; i++) {
      const u = i / samples, next = crest(u);
      ctx.quadraticCurveTo((i - .5) / samples * w, here, u * w, (here + next) * .5);
      here = next;
    }
    ctx.strokeStyle = gradient;
    ctx.globalAlpha = Math.min(1, layer.alpha + .38);
    ctx.lineWidth = Math.max(1, h * .0055);
    ctx.lineJoin = 'round';
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
 * «Ленты»: the same band levels, read as three mirrored ribbons that travel
 * sideways, pinch at both ends and light up where the track has energy.
 */
export function drawRibbons(ctx: CanvasRenderingContext2D, w: number, h: number, bars: Float32Array, palette: ReturnType<typeof ribbonPalettes>, t: number) {
  const midY = h * .5, steps = 128;
  // Smooth the 17 bands into one continuous envelope instead of 17 hard steps.
  const level = (u: number) => {
    const at = u * (bars.length - 1), index = Math.min(bars.length - 2, Math.floor(at)), f = at - index;
    const a = bars[index] || 0, b = bars[index + 1] || 0;
    return .1 + .9 * (a + (b - a) * (f * f * (3 - 2 * f)));
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let ribbon = 0; ribbon < palette.length; ribbon++) {
    const { gradient, color } = palette[ribbon];
    const phase = t * (.62 + ribbon * .17) + ribbon * 2.2;
    const span = h * (.24 - ribbon * .045);
    const shift = (ribbon - 1) * h * .21;
    const tops: number[][] = [], bottoms: number[][] = [];
    for (let step = 0; step <= steps; step++) {
      const u = step / steps;
      const wave = Math.sin(u * Math.PI * (2.1 + ribbon * .45) + phase) * .5
        + Math.sin(u * Math.PI * 5.3 - phase * 1.25) * .21;
      const taper = Math.sin(Math.PI * u) ** .72;
      const amp = Math.max(h * .004, span * level(u) * (.42 + .58 * (wave + 1) / 2) * taper);
      const x = u * w;
      tops.push([x, midY + shift - amp]);
      bottoms.push([x, midY + shift + amp * .82]);
    }
    ctx.beginPath();
    ctx.moveTo(tops[0][0], tops[0][1]);
    for (let i = 1; i < tops.length; i++) ctx.lineTo(tops[i][0], tops[i][1]);
    for (let i = bottoms.length - 1; i >= 0; i--) ctx.lineTo(bottoms[i][0], bottoms[i][1]);
    ctx.closePath();
    ctx.globalAlpha = .30 - ribbon * .05;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.globalAlpha = .9 - ribbon * .16;
    ctx.strokeStyle = gradient;
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(4, h * .03);
    ctx.lineWidth = Math.max(1, h * (.0045 - ribbon * .0008));
    ctx.beginPath();
    ctx.moveTo(tops[0][0], tops[0][1]);
    for (let i = 1; i < tops.length; i++) ctx.lineTo(tops[i][0], tops[i][1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bottoms[0][0], bottoms[0][1]);
    for (let i = 1; i < bottoms.length; i++) ctx.lineTo(bottoms[i][0], bottoms[i][1]);
    ctx.stroke();
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
