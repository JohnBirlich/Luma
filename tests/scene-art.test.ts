import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { advanceSpectrum, drawPrism, pyramidProjection, spectrumFrames, spectrumSpan } from '../src/components/scene-art.js';
import { CANVAS_EFFECTS, coastSpeed, isCanvasEffect } from '../src/shared/scene-motion.js';

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

test('prism shows one apex over a square base, with the same outline throughout a beat', () => {
  for (const [w, h] of [[1060, 340], [375, 415], [288, 110]]) {
    const { apex, base } = pyramidProjection(w, h);
    assert.equal(base.length, 4);
    assert.ok(base.every(([x, y]) => 0 < x && x < w && apex[1] < y && y < h));
    assert.ok(apex[1] > 0);
    assert.ok(base[0][0] < apex[0] && apex[0] < base[2][0]);
    assert.equal(new Set(base.map((point) => point.join(','))).size, 4);
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
  assert.deepEqual(geometry(14, .98), outline);
  assert.equal(isCanvasEffect('mix-flow'), false, 'the mix banner uses CSS rather than a second canvas');
});
