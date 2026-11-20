import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPACT_SCENE_FPS, COMPACT_SCENE_PIXELS, compactScene, sceneFps, FIREWORKS_FPS, SCENE_MAX_PIXELS, SCENE_MAX_SIDE, sceneBufferSize, SPECTRUM_FPS } from '../src/shared/scene-budget.js';

test('scene canvases cap resolution on wide, tall, and high DPI screens', () => {
  for (const [w, h, dpr] of [[3840, 2160, 2], [1920, 1080, 1], [2560, 300, 3], [320, 999, 4], [999, 320, 4]]) {
    const { width, height } = sceneBufferSize(w, h, dpr);
    assert.ok(width * height <= SCENE_MAX_PIXELS);
    assert.ok(Math.max(width, height) <= SCENE_MAX_SIDE);
    assert.ok(Math.abs(width / height - w / h) < 0.06);
  }
  assert.deepEqual(sceneBufferSize(320, 180, 1), { width: 320, height: 180 });
  assert.deepEqual(sceneBufferSize(320, 0, 2), { width: 0, height: 0 });
  assert.ok(FIREWORKS_FPS < SPECTRUM_FPS && SPECTRUM_FPS <= 30);
});


test('narrow panels and mobile canvases use a lower raster and frame budget', () => {
  for (const [w, h] of [[320, 410], [500, 300], [800, 230]]) {
    assert.equal(compactScene(w, h), true);
    const { width, height } = sceneBufferSize(w, h, 3);
    assert.ok(width * height <= COMPACT_SCENE_PIXELS);
    assert.ok(Math.max(width, height) <= 768);
  }
  assert.equal(sceneFps(true, true), COMPACT_SCENE_FPS);
  assert.equal(sceneFps(false, false), FIREWORKS_FPS);
  assert.equal(sceneFps(false, true), SPECTRUM_FPS);
});
