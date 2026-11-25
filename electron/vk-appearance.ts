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

/**
 * Luma's own additions to the shared sheet. They live outside its `@scope` block, which
 * only reaches descendants of the VK body, so the header shell itself stays reachable.
 */
const lumaShell = `
/* Luma draws its own transport: VK's header — including the compact player inside it —
   is never on screen. It keeps its layout and is made inert instead, so it neither
   covers the catalogue nor moves while the page scrolls. */
:is(#page_header_cont, #page_header, #top_nav,
  [class*="SpaLayout__header"], [class*="TopNavigation__root"], [class*="StickyHeader"]) {
  position: fixed !important; top: 0 !important; inset-inline-start: 0 !important; margin: 0 !important;
  /* A zero-height shell keeps the page's own flow intact while the controls inside it
     stay laid out: they are readable, but nothing is painted or covered. */
  width: 100% !important; max-width: 100% !important; height: 0 !important; min-height: 0 !important; overflow: visible !important;
  opacity: 0 !important; interactivity: inert !important;
}
:is(#page_header_cont, #page_header, #top_nav) * { interactivity: inert !important; }
/* VK's «Наверх» bubble points at its own scroll container, which Luma replaced. */
:is([aria-label="Наверх"], [title="Наверх"], [aria-label="Back to top"], [title="Back to top"],
  #stl_left, #stl_bg, #stl_btn, .stl_btn, [class*="ScrollToTop"]) { display: none !important; }
`;

// Runs in Luma's isolated world. Only replace our own sheet, without editing VK's
// stylesheets, relocating its controls or reading any data from the profile link.
function setAppearance(css: string, page: string) {
  if (window.top !== window || location.origin + location.pathname !== page) return;
  const world = globalThis as typeof globalThis & { vkAppearanceSheet?: CSSStyleSheet; vkRadioWatcher?: ReturnType<typeof setInterval> };
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
  if (world.vkRadioWatcher !== undefined) clearInterval(world.vkRadioWatcher);
  delete world.vkRadioWatcher;
  if (!css) return;
  // «Радио» is gone from the product for good, so the site's own entry point is
  // marked where it appears and hidden by the sheet. Only an accessible name that
  // is exactly the word is touched: a station card named «Радио Record» stays.
  const radio = /^(?:радио|radio)$/i;
  const mark = () => {
    for (const node of document.querySelectorAll<HTMLElement>('a[href], button, [role="tab"], [role="link"]')) {
      if (node.dataset.lumaRadio !== undefined) continue;
      const label = node.getAttribute('aria-label') ?? node.textContent ?? '';
      if (radio.test(label.replace(/\s+/gu, ' ').trim())) node.dataset.lumaRadio = '';
    }
  };
  mark();
  // VK renders its sections lazily, so watch for a bounded while and then stop.
  let runs = 0;
  world.vkRadioWatcher = setInterval(() => { mark(); if (++runs >= 40) { clearInterval(world.vkRadioWatcher); delete world.vkRadioWatcher; } }, 1_500);
}

/**
 * The sign-in screen: VK's own QR card is the only thing worth showing at any window
 * size. The header, search, business-page link and the lower text blocks are hidden,
 * and the card is scaled down instead of being cropped on a short window.
 */
const signInOnly = `
html, body { background: #101116 !important; overflow-x: hidden !important; }
/* Everything that frames the QR card: header, search, business-page link, sidebars, footer. */
#page_header_cont, #top_nav, #layout_sidebar, #side_bar, #stl_left, #stl_bg, #bottom_nav, #footer,
.Footer, .footer, [class*="Footer"], .vkuiPanelHeader, .vkuiSplitLayout__header,
.LeftMenu, #side_effects, .ChatsSidebar, [class*="ChatsSidebar"],
[class*="AuthHeader"], [class*="AuthFooter"], [class*="LoginHeader"], [class*="AuthTopLink"] { display: none !important; }
#page_wrap, #page_layout, .vkuiSplitLayout, .vkuiSplitLayout__inner { background: transparent !important; }
/* When VK renders the code as a box layer, pin that layer to the window and centre it. */
#box_layer_wrap:has(#box_layer:not(:empty)) { position: fixed !important; inset: 0 !important; z-index: 2147483000 !important;
  display: grid !important; place-items: center !important; padding: 10px !important; background: #101116 !important; }
#box_layer { max-width: min(520px, 96vw) !important; max-height: 94vh !important; overflow: auto !important;
  border-radius: 16px !important; box-shadow: 0 24px 70px #000a !important; }
.vkc__AuthRoot, [class*="AuthPage"], [class*="LoginPage"] { margin: 0 auto !important; max-width: min(520px, 96vw) !important; }
/* Short or narrow windows shrink the whole page instead of cropping the code. */
@media (max-height: 860px) { html { zoom: .92; } }
@media (max-height: 760px) { html { zoom: .84; } }
@media (max-height: 660px) { html { zoom: .74; } }
@media (max-height: 580px) { html { zoom: .64; } }
@media (max-width: 560px) { html { zoom: .9; } }
`;

export function vkAppearanceScript(href: string, signIn: boolean) {
  const page = vkSiteUrl(href);
  if (!page) return;
  const vk = page.hostname === 'vk.ru' || page.hostname === 'vk.com';
  const music = vk && vkMusicPage(href);
  const css = music && !signIn ? `${minimal}${lumaShell}\n[data-luma-radio] { display: none !important; }`
    : signIn ? signInOnly : '';
  return `(${setAppearance.toString()})(...${JSON.stringify([css, page.origin + page.pathname])})`;
}
