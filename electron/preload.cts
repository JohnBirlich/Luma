import electron = require('electron');
const { contextBridge, ipcRenderer, webUtils } = electron;
import type { IpcRendererEvent } from 'electron';
import type { DesktopBridge } from '../src/shared/media.js';

const bridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openOnlineLink: (url: string) => ipcRenderer.invoke('online:open-link', url),
  openReleases: () => ipcRenderer.invoke('app:releases'),
  getTracks: () => ipcRenderer.invoke('library:list'),
  chooseTracks: () => ipcRenderer.invoke('library:choose'),
  importDroppedFiles: (files) => ipcRenderer.invoke('library:drop', files.map((file) => webUtils.getPathForFile(file)).filter(Boolean)),
  removeTrack: (id) => ipcRenderer.invoke('library:remove', id),
  openVkLink: (url) => ipcRenderer.invoke('vk:open-link', url),
  getVkCover: (playlist) => ipcRenderer.invoke('vk:cover', playlist),
  diagnostics: {
    record: (event, values) => ipcRenderer.send('diagnostics:record', event, values),
    snapshot: () => ipcRenderer.invoke('diagnostics:snapshot'),
    clear: () => ipcRenderer.invoke('diagnostics:clear'),
    saveReport: () => ipcRenderer.invoke('diagnostics:save'),
    onChange: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('diagnostics:changed', listener);
      return () => ipcRenderer.removeListener('diagnostics:changed', listener);
    },
  },
  window: {
    minimize: () => { void ipcRenderer.invoke('window:minimize'); },
    toggleMaximize: () => { void ipcRenderer.invoke('window:toggle-maximize'); },
    close: () => { void ipcRenderer.invoke('window:close'); },
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (callback) => {
      const listener = (_event: IpcRendererEvent, maximized: boolean) => callback(maximized);
      ipcRenderer.on('window:maximized', listener);
      return () => ipcRenderer.removeListener('window:maximized', listener);
    },
  },
};
contextBridge.exposeInMainWorld('luma', bridge);
