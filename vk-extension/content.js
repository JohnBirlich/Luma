(() => {
  if (window.top !== window || location.port) return;
  const musicPage = /^\/(?:audio(?:-?\d+_\d+)?\/?|audios-?\d+\/?|music(?:\/.*)?)$/;
  const marker = 'data-vk-music-only';
  let enabled;
  const apply = () => document.documentElement.toggleAttribute(marker, enabled === true && musicPage.test(location.pathname));

  // VK can change routes without replacing the document. Only our CSS gate
  // changes; no redirect, DOM cleanup, network hook, or script in VK's world.
  navigation.addEventListener('currententrychange', apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.hideMenu) return;
    enabled = changes.hideMenu.newValue !== false;
    apply();
  });
  void chrome.storage.sync.get({ hideMenu: true }).then(({ hideMenu }) => {
    enabled ??= hideMenu !== false;
    apply();
  }).catch(() => {});
})();
