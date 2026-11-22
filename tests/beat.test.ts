import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialBeat, sampleBeat } from '../src/shared/beat';

test('pulse reacts to sharp low-frequency rises instead of a timer, with a short refractory period', () => {
  const beat = initialBeat();
  const spectrum = new Uint8Array(512);
  for (let i = 0; i < 8; i++) assert.equal(sampleBeat(beat, spectrum, i / 30), false);
  spectrum.fill(230, 1, 5);
  assert.equal(sampleBeat(beat, spectrum, .3), true);
  assert.ok(beat.kick > .9);
  assert.equal(sampleBeat(beat, spectrum.fill(0), .34), false);
  assert.equal(sampleBeat(beat, spectrum.fill(230, 1, 5), .38), false);
  assert.equal(sampleBeat(beat, spectrum.fill(0), .55), false);
  assert.equal(sampleBeat(beat, spectrum.fill(230, 1, 5), .6), true);
  for (let i = 1; i <= 40; i++) assert.equal(sampleBeat(beat, spectrum, .6 + i / 30), false);
  assert.ok(beat.kick < .05);
});
