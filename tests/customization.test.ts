import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentFor, artworkTone, contrastRatio, defaultAppearance, defaultPlayback, formatCount, scheduledTheme, shouldAdvanceAfterEnd, THEMES, themeVariables, WIDGET_BACKGROUNDS } from '../src/shared/customization.js';
import { defaultKaraokeStyle } from '../src/shared/karaoke-style.js';
import { defaultAudioQuality } from '../src/shared/audio-quality.js';
import { decodePreferences, encodePreferences, RECENT_LIMIT, rememberTrack } from '../src/player/preferences.js';

test('customization reads old profiles without altering queue, volume or equalizer', () => {
  const previous = {
    volume: 0.37, lastVolume: 0.37, showDemos: false,
    equalizer: { enabled: true, preset: 'custom', preamp: -2, gains: [1, 2, 3, 4, 5] },
    queue: { order: ['local-1'], currentId: 'local-1', beforeShuffle: null, repeat: 'one' },
  };
  const { equalizer, ...rest } = decodePreferences(JSON.stringify(previous));
  const { equalizer: oldEqualizer, ...old } = previous;
  assert.deepEqual(rest, { ...old, uiLanguage: 'ru', nativeFloat: false, appearance: defaultAppearance, playback: defaultPlayback, audioQuality: defaultAudioQuality, autoLyrics: false, karaokeStyle: defaultKaraokeStyle, autoCatalogSearch: true, searchHistory: [], localFallback: false, discord: { clientId: '', enabled: false }, exportLyrics: false, resumeRepeat: 'one', resumeShuffle: false, favorites: [], disliked: [], recent: [], vkRecent: [], playlists: [], stationIds: [], onlineTracks: [], onlineRefs: [] });
  assert.equal(equalizer.enabled, oldEqualizer.enabled);
  assert.equal(equalizer.preset, oldEqualizer.preset);
  assert.equal(equalizer.preamp, oldEqualizer.preamp);
  assert.equal(equalizer.autoHeadroom, false, 'upgrading does not change the old base gain');
  assert.equal(equalizer.bands.length, 10);
  assert.deepEqual(equalizer.bands.filter(({ enabled }) => enabled).map(({ hz, type, q, gain }) => [hz, type, q, gain]), [
    [60, 'lowshelf', .9, 1], [230, 'peaking', .9, 2], [910, 'peaking', .9, 3], [3600, 'peaking', .9, 4], [14000, 'highshelf', .9, 5],
  ]);
});

test('customization persists valid choices and validates each stored field', () => {
  const appearance = { ...defaultAppearance, theme: 'pine', accent: '#16b2a6', hero: 'center', effect: 'pulse', effectStrength: 0.55, effectTempo: 'fast', audioReactive: false, nativeFullscreen: false, fullscreenQueue: false, compactSidebar: true, coverColors: false, motion: false, libraryLayout: 'grid' };
  const playback = { ...defaultPlayback, startPage: 'local', seekStep: 15, autoNext: false, autoPlay: true, crossfade: 4, rememberQueue: false, rememberRecent: false, publishTrack: false, successNotices: false };
  assert.deepEqual(decodePreferences(JSON.stringify({ appearance, playback })).appearance, appearance);
  assert.deepEqual(decodePreferences(JSON.stringify({ appearance, playback })).playback, playback);
  const malformed = decodePreferences(JSON.stringify({
    appearance: { theme: 'constructor', accent: 'url(bad)', hero: 'unknown', motion: 'false', effectTempo: 'constructor', widgetBackground: 3, dataLanguage: 'constructor', autoTheme: 1, audioReactive: 'false' },
    playback: { startPage: 'settings', seekStep: Infinity, crossfade: '2', rememberRecent: 0, publishTrack: 'false' },
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
  const cover = decodePreferences(JSON.stringify({ appearance: { hero: 'cover', effect: 'cover', motion: false }, volume: .31 }));
  assert.equal(cover.appearance.hero, 'cover');
  assert.equal(cover.appearance.effect, 'off');
  assert.equal(cover.appearance.motion, false);
  assert.equal(cover.volume, .31);
  assert.deepEqual(old.favorites, ['demo-afterimage', 'local']);
  const options = decodePreferences(JSON.stringify({ appearance: { effect: 'waves', effectStrength: 50, compactSidebar: true } }));
  assert.equal(options.appearance.effect, 'waves');
  assert.equal(options.appearance.effectStrength, 1);
  assert.equal(options.appearance.compactSidebar, true);
});

test('scene choices persist without replacing old settings', () => {
  for (const effect of ['orbits', 'prism', 'spectrum', 'columns', 'pulse', 'nebula', 'horizon', 'kaleidoscope', 'rain', 'fireworks', 'solar', 'notes', 'liquid', 'mix-flow', 'tunnel', 'off']) {
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

test('repeat and shuffle restore independently of the explicit queue, without persisting its order', () => {
  const state = { order: ['a', 'c', 'b'], beforeShuffle: ['a', 'b', 'c'], currentId: 'c', repeat: 'all' as const };
  const preferences = decodePreferences(null);
  for (const rememberQueue of [false, true]) for (const rememberShuffle of [false, true]) for (const rememberRepeat of [false, true]) {
    const stored = encodePreferences({ ...preferences, playback: { ...defaultPlayback, rememberQueue, rememberShuffle, rememberRepeat } }, state);
    const restored = decodePreferences(stored);
    assert.equal(restored.resumeRepeat, rememberRepeat ? 'all' : 'off');
    assert.equal(restored.resumeShuffle, rememberShuffle);
    if (!rememberQueue) {
      assert.equal(Object.hasOwn(JSON.parse(stored), 'queue'), false);
      assert.equal(restored.queue, undefined);
    } else {
      assert.deepEqual(restored.queue?.order, rememberShuffle ? state.order : state.beforeShuffle);
      assert.equal(restored.queue?.currentId, 'c');
      assert.equal(restored.queue?.repeat, restored.resumeRepeat);
      assert.deepEqual(restored.queue?.beforeShuffle, rememberShuffle ? state.beforeShuffle : null);
    }
  }
});

test('scheduled themes change at local day/night boundaries and compact counts are optional', () => {
  const appearance = { ...defaultAppearance, autoTheme: true, dayTheme: 'pine' as const, fullNumbers: true };
  assert.equal(scheduledTheme(appearance, 7), 'amber');
  assert.equal(scheduledTheme(appearance, 8), 'pine');
  assert.equal(scheduledTheme(appearance, 19), 'pine');
  assert.equal(scheduledTheme(appearance, 20), 'amber');
  assert.equal(scheduledTheme(defaultAppearance, 11), 'amber');
  assert.equal(formatCount(1234), '1.2к');
  assert.equal(formatCount(1234, true), '1234');
  assert.equal(formatCount(999), '999');
});


test('MacOS and every widget material round-trip while preserving artwork and motion preferences', () => {
  for (const widgetBackground of Object.keys(WIDGET_BACKGROUNDS)) {
    const { appearance } = decodePreferences(JSON.stringify({ appearance: { theme: 'macos', dayTheme: 'macos', widgetBackground, motion: false } }));
    assert.equal(appearance.theme, 'macos');
    assert.equal(appearance.dayTheme, 'macos');
    assert.equal(appearance.widgetBackground, widgetBackground);
    assert.equal(appearance.motion, false);
  }
});
