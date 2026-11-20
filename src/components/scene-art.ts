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

export const SPECTRUM_STEPS = 38;
export const SPECTRUM_DEPTH = 12;
export const BAND_STARTS = Array.from({ length: SPECTRUM_STEPS + 1 }, (_, i) => Math.max(2, Math.floor(2 * 230 ** (i / SPECTRUM_STEPS))));
export type SpectrumFrames = Float32Array[];
function ambientBand(i: number, t: number) {
  const u = i / (SPECTRUM_STEPS - 1);
  return .08 + .49 * Math.exp(-((u - .24) ** 2) * 14) * (.75 + .25 * Math.sin(u * 23 + t * 2.2))
    + .33 * Math.exp(-((u - .72) ** 2) * 65) * (.68 + .32 * Math.cos(u * 26 - t * 1.8));
}
export function spectrumFrames(): SpectrumFrames {
  return Array.from({ length: SPECTRUM_DEPTH }, (_, d) => Float32Array.from({ length: SPECTRUM_STEPS }, (_, i) => ambientBand(i, -d * .25)));
}
export function advanceSpectrum(frames: SpectrumFrames, t: number, bins?: Uint8Array) {
  const previous = frames[0], row = frames.pop()!;
  for (let i = 0; i < SPECTRUM_STEPS; i++) {
    let target = ambientBand(i, t);
    if (bins) {
      let peak = 0, total = 0;
      const end = Math.max(BAND_STARTS[i] + 1, BAND_STARTS[i + 1]);
      for (let bin = BAND_STARTS[i]; bin < end; bin++) { peak = Math.max(peak, bins[bin]); total += bins[bin]; }
      target = .048 + .91 * ((peak * .65 + .35 * total / (end - BAND_STARTS[i])) / 255) ** 1.45;
    }
    row[i] = previous[i] + (target - previous[i]) * (target > previous[i] ? .62 : .28);
  }
  frames.unshift(row);
}

export function drawSpectrum(ctx: CanvasRenderingContext2D, w: number, h: number, frames: SpectrumFrames) {
  const colors = ctx.createLinearGradient(w * .05, 0, w * .94, 0);
  colors.addColorStop(0, '#f786ff'); colors.addColorStop(.36, '#aa9cfa'); colors.addColorStop(.65, '#4ce6ff'); colors.addColorStop(1, '#baffdf');
  const y = (i: number, d: number) => h * (.89 - .49 * d - frames[Math.round(d * (SPECTRUM_DEPTH - 1))][i] * (.67 - .40 * d));
  const x = (i: number, d: number) => w * (.047 + .24 * d + i / (SPECTRUM_STEPS - 1) * (.906 - .41 * d));
  // Far slices first; their filled areas are lightly veiled by the foreground ridges.
  for (let row = SPECTRUM_DEPTH - 1; row >= 0; row--) {
    const d = row / (SPECTRUM_DEPTH - 1), base = h * (.89 - .49 * d);
    const fill = ctx.createLinearGradient(0, base - h * .48, 0, base);
    fill.addColorStop(0, '#547af19c'); fill.addColorStop(1, '#17163431');
    const ridge = new Path2D();
    ridge.moveTo(x(0, d), y(0, d));
    for (let i = 1; i < SPECTRUM_STEPS; i++) ridge.lineTo(x(i, d), y(i, d));
    const shape = new Path2D(ridge); shape.lineTo(x(SPECTRUM_STEPS - 1, d), base); shape.lineTo(x(0, d), base); shape.closePath();
    ctx.fillStyle = fill; ctx.fill(shape);
    ctx.globalAlpha = (.96 - .65 * d) * .23; ctx.strokeStyle = colors; ctx.lineWidth = Math.max(2, h * .013 * (1 - .5 * d)); ctx.stroke(ridge);
    ctx.globalAlpha = .95 - .68 * d; ctx.lineWidth = Math.max(.65, h * .0033 * (1 - .5 * d)); ctx.stroke(ridge);
  }
  ctx.globalAlpha = .28; ctx.strokeStyle = '#a4b3fa'; ctx.lineWidth = .75; ctx.beginPath();
  for (let i = 0; i < SPECTRUM_STEPS; i += 3) {
    ctx.moveTo(x(i, 0), h * .91);
    for (let row = 1; row < SPECTRUM_DEPTH; row++) {
      const d = row / (SPECTRUM_DEPTH - 1); ctx.lineTo(x(i, d), h * (.91 - .49 * d));
    }
  }
  ctx.stroke(); ctx.globalAlpha = 1;
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

// Trace white light through an equilateral-ish glass wedge in its local XY plane.
// The same pose projects the extruded faces and every optical path into the scene.
type P = [number, number];
type V = [number, number, number];
const wedge: P[] = [[0,-1.02],[.99,.64],[-.99,.64]];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const along = (p: P, d: P, s: number): P => [p[0] + d[0] * s, p[1] + d[1] * s];
function hit(p: P, d: P) {
  let nearest: { p: P; n: P; distance: number } | undefined;
  for (let i = 0; i < 3; i++) {
    const a = wedge[i], edge = sub(wedge[(i + 1) % 3], a), offset = sub(a, p);
    const scale = cross(d, edge);
    if (Math.abs(scale) < .0001) continue;
    const distance = cross(offset, edge) / scale, u = cross(offset, d) / scale;
    if (u < 0 || u > 1 || distance < .0001 || (nearest && distance >= nearest.distance)) continue;
    const len = Math.hypot(...edge);
    nearest = { p: along(p, d, distance), n: [edge[1] / len, -edge[0] / len], distance };
  }
  return nearest;
}
function bend(d: P, n: P, ratio: number): P | undefined {
  const cos = -(d[0] * n[0] + d[1] * n[1]), k = 1 - ratio * ratio * (1 - cos * cos);
  if (k < 0) return;
  return along([ratio * d[0], ratio * d[1]], n, ratio * cos - Math.sqrt(k));
}
const indices = [1.445, 1.463, 1.481, 1.497, 1.514, 1.531];
const rayColors = ['ff5679', 'ffac62', 'fff094', '72ffb1', '63caff', 'bd85ff'];
const emitter: P = [-3.8, .67], incoming: P = [Math.cos(-.19), Math.sin(-.19)];
const entrance = hit(emitter, incoming)!;
const paths = indices.map((index) => {
  const inside = bend(incoming, entrance.n, 1 / index)!;
  const exit = hit(entrance.p, inside)!;
  return { exit: exit.p, out: bend(inside, [-exit.n[0], -exit.n[1]], index) };
});
const vertices: V[] = [-.33, .33].flatMap((depth) => wedge.map(([x, y]): V => [x, y, depth]));
const faces = [[0,1,2],[3,4,5],[0,3,4,1],[1,4,5,2],[2,5,3,0]];

export function drawPrism(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, kick: number) {
  const size = Math.min(h * .43, w * .27);
  const yaw = .39 + t * .34, pitch = -.25 + Math.sin(t * .27) * .22, roll = Math.sin(t * .41) * .31;
  const cx = w * .63, cy = h * .48;
  function project([x, y, z]: V): V {
    const a = x * Math.cos(yaw) + z * Math.sin(yaw), q = z * Math.cos(yaw) - x * Math.sin(yaw);
    const b = y * Math.cos(pitch) - q * Math.sin(pitch), depth = y * Math.sin(pitch) + q * Math.cos(pitch);
    // Near-orthographic rays avoid perspective discontinuities outside the visible scene.
    const zoom = 1 + Math.max(-1.2, Math.min(1.2, depth)) * .12;
    return [cx + size * zoom * (a * Math.cos(roll) - b * Math.sin(roll)), cy + size * zoom * (a * Math.sin(roll) + b * Math.cos(roll)), depth];
  }
  function ray(from: V, to: V, color: string, fade = true) {
    const gradient = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
    gradient.addColorStop(0, `#${color}ff`); gradient.addColorStop(.35, `#${color}b8`); gradient.addColorStop(1, `#${color}${fade ? '00' : 'ff'}`);
    ctx.strokeStyle = gradient; ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]);
    for (const [width, alpha] of [[.15,.10],[.055,.28],[.013,.95]]) {
      ctx.lineWidth = Math.max(.65, size * width); ctx.globalAlpha = alpha * (.85 + .15 * kick); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const projected = vertices.map(project);
  const ordered = faces.map((face, i) => ({ points: face.map((j) => projected[j]), i }))
    .sort((a, b) => a.points.reduce((sum, v) => sum + v[2], 0) / a.points.length - b.points.reduce((sum, v) => sum + v[2], 0) / b.points.length);
  function face({ points, i }: typeof ordered[number], near: boolean) {
    const wash = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
    wash.addColorStop(0, i < 2 ? '#a7edffbf' : '#cfbaff9e'); wash.addColorStop(.43, i < 2 ? '#4a9ccf25' : '#7776c841'); wash.addColorStop(1, '#a1f4ff70');
    ctx.beginPath(); points.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = wash; ctx.globalAlpha = near ? .75 : .43; ctx.fill();
    ctx.strokeStyle = near ? '#d8faffc9' : '#90c1fc57'; ctx.lineWidth = Math.max(.8, size * .013); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const point = ([x, y]: P) => project([x, y, .018]);
  ordered.slice(0, 2).forEach((f) => face(f, false));
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const entry = point(entrance.p);
  ray(entry, point(along(entrance.p, incoming, -4.5)), 'd8ffff');
  paths.forEach(({ exit, out }, i) => {
    const end = point(exit);
    ray(entry, end, rayColors[i], false);
    if (out) ray(end, point(along(exit, out, 4.6)), rayColors[i]);
  });
  ctx.restore();
  ordered.slice(2).forEach((f) => face(f, true));
}

const notes = Array.from({ length: 18 }, (_, i) => ({ x: .27 + random() * .71, y: random(), phase: random() * tau, speed: .042 + random() * .042, type: i % 3, size: .62 + random() * .58 }));
export function drawNotes(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, energy: number) {
  ctx.lineCap = 'round';
  const unit = Math.min(w, h);
  for (let line = 0; line < 5; line++) {
    ctx.beginPath(); ctx.moveTo(w * .25, h * (.85 + line * .023));
    ctx.bezierCurveTo(w * .55,h * (.18 + line * .034),w * .83,h * (.85 - line * .026),w * 1.07,h * (.08 + line * .03));
    ctx.strokeStyle = '#c5adff36'; ctx.lineWidth = Math.max(.65, unit * .002); ctx.stroke();
  }
  for (const { x, y, phase, speed, type, size } of notes) {
    const p = fract(y + t * speed), scale = unit * size * (.024 + p * .031) * (1 + energy * .14);
    const hue = type === 0 ? '#ffd1fb' : type === 1 ? '#a7e7ff' : '#ece2ff';
    ctx.save(); ctx.translate(w * (x + .06 * Math.sin(phase + p * 5)), h * (1.07 - p * 1.19)); ctx.rotate(Math.sin(phase + t * .5) * .28 - .14);
    ctx.scale(scale, scale); ctx.globalAlpha = (.53 + .38 * Math.sin(p * Math.PI)) * Math.min(1, p * 8, (1 - p) * 8);
    ctx.strokeStyle = ctx.fillStyle = hue; ctx.lineWidth = .082;
    ctx.beginPath(); ctx.ellipse(-.1,.43,.215,.145,-.35,0,tau);
    if (type === 1) ctx.stroke(); else ctx.fill();
    ctx.beginPath(); ctx.moveTo(.10,.40); ctx.lineTo(.10,-.49);
    if (type > 0) ctx.quadraticCurveTo(.25,-.32,.32,-.21);
    if (type === 2) { ctx.moveTo(.10,-.32); ctx.quadraticCurveTo(.22,-.16,.29,-.045); }
    ctx.stroke(); ctx.restore();
  }
}
