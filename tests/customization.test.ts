import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentFor, artworkTone, contrastRatio, defaultAppearance, defaultPlayback, shouldAdvanceAfterEnd, THEMES, themeVariables } from '../src/shared/customization.js';
import { decodePreferences } from '../src/player/preferences.js';

test('customization reads old profiles without altering queue, volume or equalizer', () => {
  const previous = {
    volume: 0.37, lastVolume: 0.37, showDemos: false,
    equalizer: { enabled: true, preset: 'custom', preamp: -2, gains: [1, 2, 3, 4, 5] },
    queue: { order: ['local-1'], currentId: 'local-1', beforeShuffle: null, repeat: 'one' },
  };
  assert.deepEqual(decodePreferences(JSON.stringify(previous)), { ...previous, appearance: defaultAppearance, playback: defaultPlayback });
});

test('customization persists valid choices and validates each stored field', () => {
  const appearance = { theme: 'pine', accent: '#16b2a6', hero: 'vinyl', coverColors: false, motion: false };
  const playback = { startPage: 'vk', seekStep: 15, autoNext: false };
  assert.deepEqual(decodePreferences(JSON.stringify({ appearance, playback })).appearance, appearance);
  assert.deepEqual(decodePreferences(JSON.stringify({ appearance, playback })).playback, playback);
  const malformed = decodePreferences(JSON.stringify({
    appearance: { theme: 'constructor', accent: 'url(bad)', hero: 'unknown', motion: 'false' },
    playback: { startPage: 'settings', seekStep: Infinity },
  }));
  assert.deepEqual(malformed.appearance, defaultAppearance);
  assert.deepEqual(malformed.playback, defaultPlayback);
});

test('dark accent colors remain readable on themes and on their accent buttons', () => {
  for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    for (const color of [null, '#000000', '#001212', '#edc68c', '#08e']) {
      const appearance = { ...defaultAppearance, theme, accent: color };
      const accent = accentFor(appearance);
      assert.ok(contrastRatio(accent, THEMES[theme].raised) >= 4.5);
      assert.ok(contrastRatio(accent, themeVariables(appearance)['--accent-ink']) >= 4.5);
    }
  }
});

test('autoplay preference can stop the queue but preserves explicit repeat-one', () => {
  const off = { ...defaultPlayback, autoNext: false };
  assert.equal(shouldAdvanceAfterEnd(defaultPlayback, 'off'), true);
  assert.equal(shouldAdvanceAfterEnd(off, 'all'), false);
  assert.equal(shouldAdvanceAfterEnd(off, 'one'), true);
  assert.equal(artworkTone('track-apple'), artworkTone('track-apple'));
});
