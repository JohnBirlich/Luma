import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEqualizer, effectivePreamp, EQ_BAND_COUNT, eqCurve, eqFrequencyGrid, equalizerPreset, filterHz, readEqualizer } from '../src/shared/equalizer.js';
import type { EqualizerBand, EqualizerSettings } from '../src/shared/equalizer.js';

const only = (band: Partial<EqualizerBand>): EqualizerSettings => ({
  ...defaultEqualizer, enabled: true, bands: defaultEqualizer.bands.map((entry, i) => ({ ...entry, enabled: i === 0, ...(i === 0 && band) })),
});
const near = (actual: number, expected: number, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${actual} to be within ${tolerance} dB of ${expected}`);

test('parametric settings validate filter types, ranges and enabled flags without inheriting arbitrary keys', () => {
  const restored = readEqualizer({ preset: 'constructor', enabled: 'on', preamp: -80, autoHeadroom: false, bands: [
    { type: 'constructor', enabled: false, hz: Infinity, q: 0, gain: 50 },
    { type: 'notch', hz: -2, q: 45, gain: '5' },
    { type: 'highshelf', hz: 41000, gain: NaN },
  ] });
  assert.equal(restored.preset, 'flat');
  assert.equal(restored.enabled, false);
  assert.equal(restored.preamp, -24);
  assert.equal(restored.autoHeadroom, false);
  assert.equal(restored.bands.length, EQ_BAND_COUNT);
  assert.deepEqual(restored.bands.slice(0, 3), [
    { type: 'lowshelf', enabled: false, hz: 31, q: 0.2, gain: 12 },
    { type: 'notch', enabled: true, hz: 20, q: 12, gain: 0 },
    { type: 'highshelf', enabled: true, hz: 20000, q: 0.9, gain: 0 },
  ]);
  const custom = { ...only({ hz: 432, q: 1.7, gain: -7.5, type: 'peaking' }), preset: 'custom' as const };
  assert.deepEqual(readEqualizer(JSON.parse(JSON.stringify(custom))), custom);
  assert.deepEqual(readEqualizer(null), defaultEqualizer);
});

test('frequency response shows actual gain, shelf endpoints, and a narrow notch', () => {
  const rate = 48000;
  const peak = only({ type: 'peaking', hz: 1000, gain: 6, q: 2 });
  near(eqCurve(peak, rate, [1000])[0], 6);
  assert.ok(eqCurve(peak, rate, [500])[0] < 1);
  assert.ok(eqCurve({ ...peak, bands: [{ ...peak.bands[0], q: 0.3 }] }, rate, [500])[0] > 4, 'Q changes the width');
  const low = only({ type: 'lowshelf', hz: 180, gain: 4 });
  const high = only({ type: 'highshelf', hz: 3000, gain: -5 });
  const ends = [0, rate / 2];
  const [bass, top] = eqCurve({ ...low, bands: [low.bands[0], high.bands[0]] }, rate, ends);
  near(bass, 4);
  near(top, -5);
  const notch = only({ type: 'notch', hz: 1000, q: 8, gain: 12 });
  assert.ok(eqCurve(notch, rate, [1000])[0] < -70, 'notch is a cut, independent of the gain control');
  near(eqCurve(notch, rate, [300])[0], 0);
  assert.deepEqual(eqCurve({ ...notch, enabled: false }, rate, ends), [0, 0]);
  assert.deepEqual(eqCurve({ ...notch, bands: notch.bands.map((band) => ({ ...band, enabled: false })) }, rate, [1000]), [0]);
});

test('headroom preserves stronger cuts, handles overlapping boosts and leaves bypass at unity', () => {
  const band = { type: 'peaking' as const, enabled: true, hz: 720, q: 8, gain: 8 };
  const settings = { ...defaultEqualizer, enabled: true, preamp: -3, bands: [band, { ...band, gain: 5 }] };
  near(eqCurve(settings, 48000, [720])[0], 13);
  near(effectivePreamp(settings), -13);
  assert.equal(effectivePreamp({ ...settings, preamp: -19 }), -19);
  assert.equal(effectivePreamp({ ...settings, autoHeadroom: false }), -3);
  assert.equal(effectivePreamp({ ...settings, enabled: false }), 0);
  const preset = equalizerPreset('bass', true, true);
  const frequencies = eqFrequencyGrid(1000);
  assert.ok(Math.max(...eqCurve(preset, 48000, frequencies)) + effectivePreamp(preset) < 0.1);
});

test('the graph stays finite at low device sample rates and uses the same Nyquist margin as DSP', () => {
  const rate = 32000;
  const range = eqFrequencyGrid(241, rate);
  assert.equal(range[0], 20);
  near(range.at(-1)!, filterHz(20000, rate));
  const settings = only({ type: 'notch', hz: 20000, q: 2 });
  const [center, edge] = eqCurve(settings, rate, [filterHz(20000, rate), rate / 2]);
  assert.ok(center < -70);
  near(edge, 0);
  assert.ok(eqCurve(settings, rate, range).every(Number.isFinite));
});
