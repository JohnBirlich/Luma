import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { advanceColumns, advanceSpectrum, drawPrism, drawStars, PRISM_TURN_SECONDS, pyramidProjection, spectrumColumns, spectrumFrames, spectrumSpan } from '../src/components/scene-art.js';
import { AMBIENT_EFFECTS, CANVAS_EFFECTS, coastSpeed, isCanvasEffect, sceneRuns } from '../src/shared/scene-motion.js';

const peak = (band: Float32Array) => Math.max(...band);

test('spectrum follows local frequency bands and gives extra lift to bass hits', () => {
  const bands = new Uint8Array(512);
  const frames = spectrumFrames();
  // A successful read of a silent signal is not an invitation to run the ambient loop.
  advanceSpectrum(frames, 1 / 30, { time: 5, bins: bands, kick: 0 });
  assert.equal(peak(frames[0]), 0);
  advanceSpectrum(frames, 1 / 30, { time: 5, bins: bands.fill(231, 1, 5), kick: 0 });
  const bass = frames[0].slice();
  assert.ok(bass[0] > .25);
  assert.equal(bass.at(-1), 0);
  const kicked = spectrumFrames();
  advanceSpectrum(kicked, 1 / 30, { time: 5, bins: bands, kick: 1 });
  assert.ok(peak(kicked[0]) > peak(bass) + .05);
  const highs = spectrumFrames();
  advanceSpectrum(highs, 1 / 30, { time: 5, bins: bands.fill(0).fill(231, 340, 420), kick: 0 });
  assert.ok(highs[0].at(-1)! > .25);
  assert.equal(highs[0][0], 0);
});

test('spectrum ridges span the canvas and settle in place to straight lines on pause', () => {
  assert.equal(CANVAS_EFFECTS.spectrum, true);
  for (const fps of [20, 30]) {
    const frames = spectrumFrames();
    const bins = new Uint8Array(512).fill(255);
    for (let i = 0; i < fps; i++) advanceSpectrum(frames, 1 / fps, { time: i / fps, bins, kick: .8 });
    const firstRow = frames[0];
    const before = peak(firstRow);
    let speed = 1;
    assert.ok(before > .9);
    advanceSpectrum(frames, 1 / fps);
    speed = coastSpeed(speed, false, 1 / fps);
    assert.equal(frames[0], firstRow, 'coasting decays the shapes but does not scroll their history');
    assert.ok(peak(firstRow) < before && peak(firstRow) > .5, 'it does not jump directly to flat');
    for (let i = 1; i < fps; i++) {
      advanceSpectrum(frames, 1 / fps);
      speed = coastSpeed(speed, false, 1 / fps);
    }
    assert.equal(speed, 0);
    assert.ok(frames.every((row) => peak(row) === 0), 'each ridge ends exactly flat');
  }
  for (const depth of [0, .5, 1]) {
    const [start, end] = spectrumSpan(depth);
    assert.ok(start >= 0 && end <= 1 && end - start > .9);
  }
});

test('the restored 17 columns respond to distinct frequency bands and release to baseline', () => {
  const bars = spectrumColumns();
  assert.equal(bars.length, 17);
  const bins = new Uint8Array(512);
  advanceColumns(bars, 1 / 30, { time: 0, bins });
  assert.equal(peak(bars), 0);
  advanceColumns(bars, 1 / 30, { time: 1, bins: bins.fill(242, 1, 4) });
  assert.ok(bars[1] > .35);
  assert.equal(bars.at(-1), 0);
  advanceColumns(bars, 1 / 30, { time: 2, bins: bins.fill(0).fill(242, 279, 390) });
  const treble = bars.at(-1)!;
  assert.ok(treble > .35 && treble > bars[1]);
  advanceColumns(bars, 1 / 30);
  assert.ok(bars.at(-1)! < treble && bars.at(-1)! > 0);
  for (let i = 0; i < 30; i++) advanceColumns(bars, 1 / 30);
  assert.equal(peak(bars), 0);
  assert.equal(CANVAS_EFFECTS.columns, true);
});

test('prism rotates a square base beneath a single upright apex, independently of the beat', () => {
  for (const [w, h] of [[1060, 340], [375, 415], [288, 110]]) {
    const initial = pyramidProjection(w, h);
    for (let time = 0; time < PRISM_TURN_SECONDS; time += .25) {
      const { apex, base, faces } = pyramidProjection(w, h, time);
      assert.deepEqual(apex, initial.apex);
      assert.equal(base.length, 4);
      assert.ok(faces.length > 0 && faces.length < 4);
      assert.ok(base.every(([x, y]) => 0 < x && x < w && apex[1] < y && y < h));
      assert.ok(apex[1] > 0);
      assert.ok(Math.min(...base.map(([x]) => x)) < apex[0] && apex[0] < Math.max(...base.map(([x]) => x)));
      assert.equal(new Set(base.map((point) => point.join(','))).size, 4);
    }
    assert.notDeepEqual(pyramidProjection(w, h, 1.5).base, initial.base);
    assert.deepEqual(pyramidProjection(w, h, PRISM_TURN_SECONDS).base, initial.base);
  }
  function geometry(time: number, kick: number) {
    const points: number[][] = [];
    const gradient = () => ({ addColorStop() {} });
    const ctx = {
      createLinearGradient: gradient, createRadialGradient: gradient, fillRect() {},
      save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {}, arc() {},
      moveTo: (...point: number[]) => points.push(point), lineTo: (...point: number[]) => points.push(point),
    } as unknown as CanvasRenderingContext2D;
    drawPrism(ctx, 1060, 340, time, kick);
    return points;
  }
  const outline = geometry(0, 0);
  assert.ok(outline.length > 10);
  assert.deepEqual(geometry(0, .98), outline);
  assert.notDeepEqual(geometry(1.5, 0), outline);
  assert.equal(isCanvasEffect('tunnel'), false);
  assert.equal(isCanvasEffect('mix-flow'), false, 'the mix banner uses CSS rather than a second canvas');
});

test('all requested scenes run at idle; transport visualizers do not', () => {
  assert.equal(AMBIENT_EFFECTS.length, 15);
  for (const effect of AMBIENT_EFFECTS) assert.ok(sceneRuns(effect, false), effect);
  for (const effect of ['spectrum', 'columns', 'pulse'] as const) {
    assert.equal(sceneRuns(effect, false), false, effect);
    assert.equal(sceneRuns(effect, true), true, effect);
  }
  assert.equal(sceneRuns('off', true), false);
});

test('compact stars have bright visible cores and change position with the idle clock', () => {
  const points = (time: number) => {
    const visible: [number, number][] = [];
    let radius = 0, x = 0, y = 0;
    const canvas = { fillStyle: '', globalAlpha: 1, beginPath() {}, fillRect() {},
      arc(a: number, b: number, r: number) { x = a; y = b; radius = r; },
      fill() { if (radius >= 1 && this.globalAlpha >= .58) visible.push([x, y]); } };
    drawStars(canvas as unknown as CanvasRenderingContext2D, 360, 188, time, 0);
    return visible;
  };
  const a = points(0), b = points(3);
  assert.ok(a.length >= 20 && b.length >= 20);
  assert.notDeepEqual(a, b);
});
