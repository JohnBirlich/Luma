import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentFor, artworkTone, contrastRatio, defaultAppearance, defaultPlayback, shouldAdvanceAfterEnd, THEMES, themeVariables } from '../src/shared/customization.js';
import { decodePreferences, RECENT_LIMIT, rememberTrack } from '../src/player/preferences.js';

test('customization reads old profiles without altering queue, volume or equalizer', () => {
  const previous = {
    volume: 0.37, lastVolume: 0.37, showDemos: false,
    equalizer: { enabled: true, preset: 'custom', preamp: -2, gains: [1, 2, 3, 4, 5] },
    queue: { order: ['local-1'], currentId: 'local-1', beforeShuffle: null, repeat: 'one' },
  };
  assert.deepEqual(decodePreferences(JSON.stringify(previous)), { ...previous, appearance: defaultAppearance, playback: defaultPlayback, favorites: [], recent: [], onlineTracks: [], onlineRefs: [] });
});

test('customization persists valid choices and validates each stored field', () => {
  const appearance = { ...defaultAppearance, theme: 'pine', accent: '#16b2a6', hero: 'center', effect: 'pulse', effectStrength: 0.55, effectTempo: 'fast', audioReactive: false, nativeFullscreen: false, fullscreenQueue: false, compactSidebar: true, coverColors: false, motion: false, libraryLayout: 'grid' };
  const playback = { startPage: 'vk', seekStep: 15, autoNext: false, rememberRecent: false, publishTrack: false, successNotices: false };
  assert.deepEqual(decodePreferences(JSON.stringify({ appearance, playback })).appearance, appearance);
  assert.deepEqual(decodePreferences(JSON.stringify({ appearance, playback })).playback, playback);
  const malformed = decodePreferences(JSON.stringify({
    appearance: { theme: 'constructor', accent: 'url(bad)', hero: 'unknown', motion: 'false', effectTempo: 'constructor', audioReactive: 'false' },
    playback: { startPage: 'settings', seekStep: Infinity, rememberRecent: 0, publishTrack: 'false' },
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

test('legacy layouts remain unchanged; effect intensity and favorite IDs are validated independently', () => {
  const old = decodePreferences(JSON.stringify({ appearance: { hero: 'vinyl' }, favorites: ['demo-afterimage', 5, 'demo-afterimage', '', 'local'] }));
  assert.equal(old.appearance.hero, 'vinyl');
  assert.equal(old.appearance.effect, 'off');
  assert.deepEqual(old.favorites, ['demo-afterimage', 'local']);
  const options = decodePreferences(JSON.stringify({ appearance: { effect: 'waves', effectStrength: 50, compactSidebar: true } }));
  assert.equal(options.appearance.effect, 'waves');
  assert.equal(options.appearance.effectStrength, 1);
  assert.equal(options.appearance.compactSidebar, true);
});

test('new audio-reactive scenes persist without replacing old settings', () => {
  for (const effect of ['orbits', 'prism', 'spectrum', 'pulse', 'nebula', 'horizon', 'kaleidoscope', 'rain', 'off']) {
    const prefs = decodePreferences(JSON.stringify({ appearance: { hero: 'vinyl', effect, effectStrength: 0.6, motion: false }, volume: 0.17 }));
    assert.equal(prefs.appearance.effect, effect);
    assert.equal(prefs.appearance.hero, 'vinyl');
    assert.equal(prefs.appearance.motion, false);
    assert.equal(prefs.appearance.effectStrength, 0.6);
    assert.equal(prefs.volume, 0.17);
  }
});


test('local listening history keeps distinct played IDs, most recent first, within its cap', () => {
  const older = Array.from({ length: RECENT_LIMIT + 1 }, (_, i) => `local-${i}`);
  const { recent, favorites } = decodePreferences(JSON.stringify({ recent: ['', 22, older[0], ...older], favorites: [older.at(-1)] }));
  assert.deepEqual(recent, older.slice(0, RECENT_LIMIT));
  assert.deepEqual(favorites, [older.at(-1)]);
  const first = rememberTrack(recent, 'new');
  assert.equal(first[0], 'new');
  assert.equal(first.length, RECENT_LIMIT);
  assert.equal(rememberTrack(first, 'new'), first);
  assert.deepEqual(rememberTrack(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
});
