import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { vkAppearanceScript } from '../electron/vk-appearance.js';

const extension = new URL('../vk-extension/', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, extension), 'utf8');

test('the standalone VK extension is cosmetic and has only storage permission', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const key of ['background', 'host_permissions', 'optional_host_permissions', 'optional_permissions', 'web_accessible_resources']) {
    assert.equal(key in manifest, false, key);
  }
  assert.equal(manifest.content_scripts.length, 1);
  const script = manifest.content_scripts[0];
  assert.deepEqual(script.matches, ['https://vk.com/*', 'https://vk.ru/*']);
  assert.deepEqual(script.js, ['content.js']);
  assert.deepEqual(script.css, ['styles.css']);
  assert.ok(!script.all_frames);
  for (const host of ['vk.ru', 'vk.com']) {
    for (const route of ['login', 'join', 'authcheck']) assert.ok(script.exclude_matches.includes(`https://${host}/${route}*`));
  }
  for (const file of ['background.js', 'inject.js']) assert.ok(!existsSync(new URL(file, extension)), file);
  assert.doesNotMatch(read('popup.html'), /скача|download/i);
});

test('the VK extension changes only its CSS gate on a music route, including SPA navigation and storage changes', async () => {
  const marker = 'data-vk-music-only';
  const attrs = new Set<string>();
  const location = new URL('https://vk.ru/feed');
  const window = { get top() { return this; } };
  const navigation = new EventTarget();
  let onStorageChange: ((changes: { hideMenu?: { newValue: boolean } }, area: string) => void) | undefined;
  await runInNewContext(read('content.js'), {
    window, navigation, location,
    document: { documentElement: { toggleAttribute(name: string, force: boolean) {
      assert.equal(name, marker);
      if (force) attrs.add(name); else attrs.delete(name);
    } } },
    chrome: { storage: {
      sync: { get: async (defaults: { hideMenu: boolean }) => ({ hideMenu: defaults.hideMenu }) },
      onChanged: { addListener: (listener: typeof onStorageChange) => { onStorageChange = listener; } },
    } },
  });
  const go = (path: string) => {
    const next = new URL(path, location);
    location.href = next.href;
    navigation.dispatchEvent(new Event('currententrychange'));
    assert.equal(location.href, next.href, 'no redirect');
    return attrs.has(marker);
  };
  assert.equal(attrs.has(marker), false);
  assert.equal(go('/audio?q=jazz'), true);
  assert.equal(go('/music/playlist/-42_7'), true);
  for (const path of ['/id42', '/login?to=/audio', '/authcheck', '/', '/audio.php']) assert.equal(go(path), false, path);
  assert.equal(go('/audios42'), true);
  assert.ok(onStorageChange);
  onStorageChange({ hideMenu: { newValue: false } }, 'sync');
  assert.equal(go('/audio'), false);
  onStorageChange({ hideMenu: { newValue: true } }, 'sync');
  assert.equal(attrs.has(marker), true, 're-enabled without a document reload');
});

test('Luma adopts the same cosmetic CSS without running the extension or styling other routes', () => {
  class Sheet {
    css = '';
    replaceSync(css: string) { this.css = css; }
  }
  const window = { get top() { return this; } };
  const location = new URL('https://vk.ru/audio');
  const original = new Sheet();
  const document = { adoptedStyleSheets: [original] };
  const context = { window, location, document, CSSStyleSheet: Sheet };
  const apply = (signIn = false, href = location.href) => runInNewContext(vkAppearanceScript(href, signIn)!, context);

  apply();
  assert.equal(document.adoptedStyleSheets.length, 2);
  assert.equal(document.adoptedStyleSheets[1].css, read('styles.css').replace('html[data-vk-music-only]', 'html'));
  apply(true);
  assert.deepEqual(document.adoptedStyleSheets, [original]);
  apply();
  location.pathname = '/id42';
  apply();
  assert.deepEqual(document.adoptedStyleSheets, [original]);
  apply(false, 'https://vk.ru/audio');
  assert.equal(document.adoptedStyleSheets.length, 1, 'a stale music injection cannot affect the profile');
  location.href = 'https://id.vk.ru/audio';
  apply();
  assert.equal(document.adoptedStyleSheets.length, 1, 'VK ID is never styled');
});
