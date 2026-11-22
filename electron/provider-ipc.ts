import { Resolver } from 'node:dns/promises';
import { ipcMain, net } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { DesktopMusicServices } from './music-services.js';
import type { DesktopLibrary } from './library.js';
import { isCredentialService } from '../src/shared/music-services.js';
import { createOpenwhydImport } from '../src/shared/openwhyd.js';
import { createRadioBrowser } from '../src/shared/radio-browser.js';

export function bindProviderIpc(verify: (event: IpcMainInvokeEvent) => unknown, library: DesktopLibrary, music: DesktopMusicServices, version: string) {
  const resolver = new Resolver({ timeout: 1250, tries: 1 });
  let discovery: { until: number; hosts: string[] } | undefined;
  const radio = createRadioBrowser(net.fetch, version, async () => {
    if (discovery && Date.now() < discovery.until) return discovery.hosts;
    const records = await resolver.resolveSrv('_api._tcp.radio-browser.info').catch(() => []);
    const hosts = records.sort((a, b) => a.priority - b.priority).map(({ name }) => name);
    discovery = { until: Date.now() + 5 * 60_000, hosts };
    return hosts;
  });
  const openwhyd = createOpenwhydImport(net.fetch);
  ipcMain.handle('radio-browser:search', (event, query: unknown) => { verify(event); return radio.search(query); });
  ipcMain.handle('radio-browser:click', (event, id: unknown) => { verify(event); return radio.click(id); });
  ipcMain.handle('openwhyd:playlist', (event, url: unknown) => { verify(event); return openwhyd(url, AbortSignal.timeout(9000)); });
  ipcMain.handle('music-service:status', (event, service: unknown) => {
    verify(event);
    if (!isCredentialService(service)) throw new TypeError('Unsupported music service');
    return music.status(service);
  });
  ipcMain.handle('music-service:configure', (event, service: unknown, value: unknown) => {
    verify(event);
    if (!isCredentialService(service)) throw new TypeError('Unsupported music service');
    return music.configure(service, value);
  });
  ipcMain.handle('music-service:remove', (event, service: unknown) => {
    verify(event);
    if (!isCredentialService(service)) throw new TypeError('Unsupported music service');
    return music.remove(service);
  });
  ipcMain.handle('listenbrainz:enable', (event, enabled: unknown) => {
    verify(event);
    if (typeof enabled !== 'boolean') throw new TypeError('Expected an opt-in state');
    return music.enableListens(enabled);
  });
  ipcMain.on('listenbrainz:record-local', (event, id: unknown, data: unknown) => {
    try { verify(event); } catch { return; }
    // A known local audio track ID is necessary, never a URL, file path, online-only item or built-in demo.
    if (typeof id === 'string' && id.length <= 64 && library.mediaPath(id, 'audio')) void music.recordLocal(id, data);
  });
  ipcMain.handle('jamendo:search', (event, id: unknown, query: unknown) => { verify(event); return music.searchJamendo(id, query); });
  ipcMain.handle('genius:search', (event, query: unknown) => { verify(event); return music.searchGenius(query); });
  ipcMain.handle('genius:annotations', (event, id: unknown) => { verify(event); return music.geniusAnnotations(id); });
}
