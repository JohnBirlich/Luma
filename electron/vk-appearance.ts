import { readFileSync } from 'node:fs';
import { vkMusicPage, vkSiteUrl } from '../src/shared/vk-site.js';
// The extension and Luma share only this audited stylesheet. No manifest or
// browser-extension script is packaged. Luma gates the sheet by route and sign-in state
// rather than adding the extension's opt-in attribute to VK's DOM.
function readMusicOnlyStyle() {
  try {
    return readFileSync(new URL('../vk-extension/styles.css', import.meta.url), 'utf8')
      .replace('html[data-vk-music-only]', 'html');
  } catch {
    return ''; // A missing build asset must not prevent opening the official site.
  }
}

const minimal = readMusicOnlyStyle();

// Runs in Luma's isolated world. Only replace our own sheet, without editing VK's
// stylesheets, relocating its controls or reading any data from the profile link.
function setAppearance(css: string, page: string) {
  if (window.top !== window || location.origin + location.pathname !== page) return;
  const world = globalThis as typeof globalThis & { vkAppearanceSheet?: CSSStyleSheet };
  if (css) {
    if (!world.vkAppearanceSheet) {
      world.vkAppearanceSheet = new CSSStyleSheet();
      document.adoptedStyleSheets.push(world.vkAppearanceSheet);
    }
    world.vkAppearanceSheet.replaceSync(css);
  } else if (world.vkAppearanceSheet) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== world.vkAppearanceSheet);
    delete world.vkAppearanceSheet;
  }
}

export function vkAppearanceScript(href: string, signIn: boolean) {
  const page = vkSiteUrl(href);
  if (!page) return;
  const music = (page.hostname === 'vk.ru' || page.hostname === 'vk.com') && vkMusicPage(href);
  const css = music && !signIn ? minimal : '';
  return `(${setAppearance.toString()})(...${JSON.stringify([css, page.origin + page.pathname])})`;
}
