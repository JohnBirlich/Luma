import electron = require('electron');
const { contextBridge, ipcRenderer, webUtils } = electron;
import type { IpcRendererEvent } from 'electron';
import type { DesktopBridge } from '../src/shared/media.js';
import type { LastFmStatus } from '../src/shared/lastfm.js';

const bridge: DesktopBridge = {
  setUiLanguage: (language) => ipcRenderer.invoke('ui:language', language),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  searchCommunity: (id, query, source) => ipcRenderer.invoke('online:search-community', id, query, source),
  cancelCatalogSearch: (id) => ipcRenderer.invoke('online:cancel-search', id),
  openOnlineLink: (url: string) => ipcRenderer.invoke('online:open-link', url),
  openReleases: () => ipcRenderer.invoke('app:releases'),
  getAudioFormat: (id) => ipcRenderer.invoke('library:audio-format', id),
  getTracks: () => ipcRenderer.invoke('library:list'),
  chooseTracks: () => ipcRenderer.invoke('library:choose'),
  importDroppedFiles: (files) => ipcRenderer.invoke('library:drop', files.map((file) => webUtils.getPathForFile(file)).filter(Boolean)),
  removeTrack: (id) => ipcRenderer.invoke('library:remove', id),
  openVkLink: (url) => ipcRenderer.invoke('vk:open-link', url),
  clearLegacyVkSession: () => ipcRenderer.invoke('vk:reset'),
  lyrics: { lookup: (query) => ipcRenderer.invoke('lyrics:lookup', query), local: (id) => ipcRenderer.invoke('lyrics:local', id), openEdition: (url) => ipcRenderer.invoke('lyrics:edition', url) },
  exportMp3: (track, withLyrics) => ipcRenderer.invoke('online:export-mp3', track, withLyrics),
  recognition: {
    search: (query, locale) => ipcRenderer.invoke('metadata:search', query, locale),
    hasAcoustid: () => ipcRenderer.invoke('metadata:has-acoustid'),
    identify: (fingerprint) => ipcRenderer.invoke('metadata:identify', fingerprint),
    openSource: (url) => ipcRenderer.invoke('metadata:open-link', url),
  },
  floatOutput: {
    available: () => ipcRenderer.invoke('float:available'),
    start: (rate) => ipcRenderer.invoke('float:start', rate),
    stop: () => ipcRenderer.invoke('float:stop'),
    write: (stereo) => ipcRenderer.send('float:pcm', stereo),
    onLost: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('float:lost', listener);
      return () => ipcRenderer.removeListener('float:lost', listener);
    },
  },
  streamCache: {
    url: (track) => ipcRenderer.invoke('cache:url', track),
    save: (track) => ipcRenderer.invoke('cache:save', track),
    info: () => ipcRenderer.invoke('cache:info'),
    clear: () => ipcRenderer.invoke('cache:clear'),
  },
  lastfm: {
    status: () => ipcRenderer.invoke('lastfm:status'),
    configure: (key, secret) => ipcRenderer.invoke('lastfm:configure', key, secret),
    forgetCredentials: () => ipcRenderer.invoke('lastfm:forget'),
    begin: () => ipcRenderer.invoke('lastfm:begin'),
    finish: () => ipcRenderer.invoke('lastfm:finish'),
    enable: (enabled) => ipcRenderer.invoke('lastfm:enable', enabled),
    disconnect: () => ipcRenderer.invoke('lastfm:disconnect'),
    record: (event) => ipcRenderer.send('lastfm:record', event),
    onChange: (callback) => {
      const listener = (_event: IpcRendererEvent, status: LastFmStatus) => callback(status);
      ipcRenderer.on('lastfm:changed', listener);
      return () => ipcRenderer.removeListener('lastfm:changed', listener);
    },
  },
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
    setWidget: (enabled) => ipcRenderer.invoke('window:widget', enabled),
    setFullscreen: (fullscreen) => ipcRenderer.invoke('window:set-fullscreen', fullscreen),
    onWidgetShortcut: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('window:widgetShortcut', listener);
      return () => ipcRenderer.removeListener('window:widgetShortcut', listener);
    },
    onFullscreen: (callback) => {
      const listener = (_event: IpcRendererEvent, fullscreen: boolean) => callback(fullscreen);
      ipcRenderer.on('window:fullscreen', listener);
      return () => ipcRenderer.removeListener('window:fullscreen', listener);
    },
    onMaximized: (callback) => {
      const listener = (_event: IpcRendererEvent, maximized: boolean) => callback(maximized);
      ipcRenderer.on('window:maximized', listener);
      return () => ipcRenderer.removeListener('window:maximized', listener);
    },
  },
};
contextBridge.exposeInMainWorld('luma', bridge);
