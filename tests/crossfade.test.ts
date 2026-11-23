import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fadeProgress, trackOverlap } from '../src/shared/crossfade.js';

test('crossfade is bounded by the setting, remaining source audio and both durations', () => {
  assert.equal(trackOverlap(4, 180, 230, 120), 4);
  assert.equal(trackOverlap(4, 240, 6), 1.5);
  assert.equal(trackOverlap(4, 240, 180, 1.18), 1.18);
  assert.equal(trackOverlap(100, 240, 180), 8);
  assert.equal(trackOverlap(4, 240, 180, .1), 0);
  for (const value of [0, NaN, Infinity, -1]) {
    assert.equal(trackOverlap(value, 180, 240), 0);
    assert.equal(trackOverlap(4, value, 240), 0);
    assert.equal(trackOverlap(4, 180, value), 0);
  }
});

test('linear stream envelope bounds gain before, during and after the overlap', () => {
  assert.equal(fadeProgress(-300, 2), 0);
  assert.equal(fadeProgress(500, 2), .25);
  assert.equal(fadeProgress(1000, 2), .5);
  assert.equal(fadeProgress(3000, 2), 1);
});
