import { vkMusicPage, vkSiteUrl } from '../src/shared/vk-site.js';
import type { VkSiteAppearance } from '../src/shared/vk-site.js';

// The captured desktop shell has a native Profile link (#l_pr). Match the shell, not
// hashed VK classes, and leave public/signed-out and unrecognized layouts alone.
const desktopShell = '#layout_wrapper_root:has(> #page_header_cont #page_header)'
  + ':has(> #page_layout > * > #page_body > #spa_layout_content)'
  + ':has(> #page_layout > * > #layout_sidebar nav li#l_pr > a[href])'
  + ':not(:has(> #page_header_cont a:is([href="/join"], [href="https://vk.ru/join"], [href="https://vk.com/join"])))';

// Keep the fixed header laid out for Luma's DOM transport fallback when hidden.
// Opacity on the container keeps its controls measurable; inertness keeps them out
// of pointer, keyboard and accessibility navigation without changing VK's DOM.
const hiddenHeader = (shell: string) => `
  ${shell} > #page_header_cont { position: fixed !important; opacity: 0 !important; }
  ${shell} > #page_header_cont, ${shell} > #page_header_cont * { interactivity: inert !important; }
`;

const profileOnly = `
  :scope { width: 100% !important; --spa-layout-header-height: 0px !important; }
  ${hiddenHeader(':scope')}
  :scope > #page_layout { width: min(100%, var(--spa-layout-width, 1076px)) !important; box-sizing: border-box; }
  :scope > #page_layout > :has(> #layout_sidebar):has(> #page_body) {
    display: flex !important; flex-direction: column !important; padding-top: 0 !important;
  }
  #page_body { width: 100% !important; min-width: 0 !important; margin-top: 0 !important; box-sizing: border-box; }
  #layout_sidebar { flex: none !important; align-self: flex-start !important; }
  #layout_sidebar, #layout_sidebar :has(li#l_pr) {
    position: static !important; width: auto !important; height: auto !important;
    margin: 0 !important; padding: 0 !important;
  }
  #layout_sidebar :not(li#l_pr, li#l_pr *, :has(li#l_pr)), #layout_sidebar li#l_pr > :not(a[href]) {
    display: none !important;
  }
`;

const headerPath = '> #page_header_cont > #page_header_wrap > #page_header';
const playerSlot = ':is(#top_audio_layer_place, #top_audio_player)';
const inlinePlayer = ':is(.audio_page_player, .audio_page_player2, [data-testid="audio-player"], [data-testid="music-player"], [data-testid="MusicPlayer"])'
  + ':not(:empty, [hidden], [hidden] *, [aria-hidden="true"], [aria-hidden="true"] *)';
const compactPlayer = `:has(${headerPath} > li ${playerSlot})`
  + `:not(:has(> #page_layout > * > #page_body ${inlinePlayer}))`;

// Only size the desktop shell, not individual tabs/cards or carousels. If VK
// renders its player inside the page, leave it there. Otherwise reuse the native
// music slot in the header (it can be just a launcher before the first play).
// The unpacked browser extension has its own stylesheet; Luma never loads it.
const minimal = `
  :scope {
    --luma-vk-music-gutter: clamp(6px, 1vw, 16px);
    --spa-layout-with-scrollbar-width: 100% !important;
    --spa-layout-width: 100% !important;
    --spa-layout-sidebar-width: 0px !important;
    --spa-layout-contnet-width: 100% !important;
    --spa-layout-header-height: 0px !important;
    width: 100% !important;
  }
  :scope > #page_layout {
    width: 100% !important; min-width: 0 !important; max-width: none !important;
    margin: 0 !important; padding: 0 var(--luma-vk-music-gutter) !important; box-sizing: border-box !important;
  }
  :scope > #page_layout > :has(> #layout_sidebar):has(> #page_body) {
    display: block !important; padding-top: 0 !important;
    & > #layout_sidebar { display: none !important; }
    & > #page_body, & > #page_body > #spa_layout_content {
      width: 100% !important; min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important;
    }
    & > #page_body { margin: 0 !important; }
  }
  ${hiddenHeader(`:scope:not(${compactPlayer})`)}
  :scope${compactPlayer} > #page_header_cont {
    position: relative !important; inset: auto !important; width: auto !important; height: auto !important;
    margin: 0 var(--luma-vk-music-gutter) var(--luma-vk-music-gutter) !important;
    border-radius: var(--vkui--size_border_radius_paper--regular, 10px);
    & > #page_header_wrap, & > #page_header_wrap > #page_header {
      width: 100% !important; min-width: 0 !important; max-width: 100% !important;
      height: auto !important; margin: 0 !important; box-sizing: border-box !important;
    }
    & #page_header {
      display: flex !important; align-items: center !important; min-height: var(--header-height, 48px);
      padding: 0 var(--luma-vk-music-gutter) !important; background: transparent !important;
    }
    & #page_header > :not(li:has(${playerSlot})) { display: none !important; }
    & #page_header > li:has(${playerSlot}) { flex: 1 1 auto !important; min-width: 0 !important; }
  }
`;

function musicLayout(mode: 'profile' | 'minimal') {
  return `@supports (interactivity: inert) { @scope (${desktopShell}) { ${mode === 'profile' ? profileOnly : minimal} } }`;
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
