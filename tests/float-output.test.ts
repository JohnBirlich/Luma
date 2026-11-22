import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { validFloatRate } from '../src/shared/float-output';
import { DesktopFloatOutput } from '../electron/float-output';

test('Float IPC validates sample rates and never claims hardware support without the executable', async () => {
  const output = new DesktopFloatOutput();
  assert.equal(await output.available(), false);
  assert.equal(await output.start(48000), 'missing');
  for (const value of ['48000', NaN, Infinity, 47999.5, 7999, 192001]) {
    assert.equal(validFloatRate(value), false);
    assert.equal(await output.start(value), 'failed');
  }
  await output.stop();
});

test('worklet emits bounded, interleaved PCM chunks and restores credit on acknowledgement', async () => {
  const source = await readFile(new URL('../src/player/float.worklet.js', import.meta.url), 'utf8');
  const chunks: Float32Array[] = [];
  const port = { onmessage: () => {}, postMessage: (block: ArrayBuffer) => chunks.push(new Float32Array(block)) };
  const Tap = runInNewContext(`${source}\nLumaFloatTap;`, {
    sampleRate: 48000, registerProcessor: () => {}, AudioWorkletProcessor: class { port = port; },
  });
  const tap = new Tap();
  const left = new Float32Array(128).fill(.25);
  const right = new Float32Array(128).fill(-.5);
  for (let round = 0; round < 44; round++) assert.equal(tap.process([[left, right]]), true);
  assert.equal(chunks.length, 5, 'producer cannot outrun the receiver with unbounded messages');
  assert.deepEqual(Array.from(chunks[0].slice(0, 4)), [.25, -.5, .25, -.5]);
  port.onmessage();
  for (let round = 0; round < 5; round++) tap.process([[left]]);
  assert.equal(chunks.length, 6);
  assert.deepEqual(Array.from(chunks[5].slice(0, 4)), [.25, .25, .25, .25]);
});
