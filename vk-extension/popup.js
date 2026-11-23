const toggle = document.getElementById('hideMenu');
void chrome.storage.sync.get({ hideMenu: true }).then(({ hideMenu }) => {
  toggle.checked = hideMenu !== false;
  toggle.disabled = false;
  toggle.addEventListener('change', () => {
    void chrome.storage.sync.set({ hideMenu: toggle.checked });
  });
});
