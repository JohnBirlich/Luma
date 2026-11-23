import { vkMusicPage, vkSiteUrl } from '../src/shared/vk-site.js';
import type { VkSiteAppearance } from '../src/shared/vk-site.js';

// The captured desktop shell has a native Profile link (#l_pr). Match the shell, not
// hashed VK classes, and leave public/signed-out and unrecognized layouts alone.
const desktopShell = '#layout_wrapper_root:has(> #page_header_cont #page_header)'
  + ':has(> #page_layout > * > #page_body > #spa_layout_content)'
  + ':has(> #page_layout > * > #layout_sidebar nav li#l_pr > a[href])'
  + ':not(:has(> #page_header_cont a:is([href="/join"], [href="https://vk.ru/join"], [href="https://vk.com/join"])))';

const profileOnly = `
  #layout_sidebar { flex: none !important; align-self: flex-start !important; }
  #layout_sidebar, #layout_sidebar :has(li#l_pr) {
    position: static !important; width: auto !important; height: auto !important;
    margin: 0 !important; padding: 0 !important;
  }
  #layout_sidebar :not(li#l_pr, li#l_pr *, :has(li#l_pr)), #layout_sidebar li#l_pr > :not(a[href]) {
    display: none !important;
  }
`;

function musicLayout(mode: 'profile' | 'minimal') {
  // Keep the fixed header mounted and laid out for Luma's existing DOM transport
  // fallback, but invisible and inert for pointer, focus and accessibility in VK.
  return `@supports (interactivity: inert) { @scope (${desktopShell}) {
    :scope { width: 100% !important; --spa-layout-header-height: 0px !important; }
    :scope > #page_header_cont { position: fixed !important; opacity: 0 !important; }
    :scope > #page_header_cont, :scope > #page_header_cont * { interactivity: inert !important; }
    :scope > #page_layout { width: min(100%, var(--spa-layout-width, 1076px)) !important; box-sizing: border-box; }
    :scope > #page_layout > :has(> #layout_sidebar):has(> #page_body) {
      display: flex !important; flex-direction: column !important; padding-top: 0 !important;
    }
    #page_body { width: 100% !important; min-width: 0 !important; margin-top: 0 !important; box-sizing: border-box; }
    ${mode === 'profile' ? profileOnly : '#layout_sidebar { display: none !important; }'}
  } }`;
}

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

export function vkAppearanceScript(mode: VkSiteAppearance, href: string) {
  const page = vkSiteUrl(href);
  if (!page) return;
  const css = mode !== 'standard' && (page.hostname === 'vk.ru' || page.hostname === 'vk.com') && vkMusicPage(href) ? musicLayout(mode) : '';
  return `(${setAppearance.toString()})(...${JSON.stringify([css, page.origin + page.pathname])})`;
}
