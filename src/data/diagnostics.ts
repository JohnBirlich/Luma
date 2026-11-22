import type { Text } from '../i18n/text';
import { browserSystem } from '../shared/system';
import { webAppInfo } from './app-info';
import { appendLog, diagnosticsReport, logEntry, readLog, reportFilename } from '../shared/diagnostics';
import type { DiagnosticSnapshot, LogValues, RendererLogEvent } from '../shared/diagnostics';

const KEY = 'luma-diagnostics:v1';
const listeners = new Set<() => void>();
let started = false;
let online = navigator.onLine;
let web: DiagnosticSnapshot | undefined;
let platformChecked = false;
interface ClientPlatform {
  platform: string;
  getHighEntropyValues?(hints: ['platformVersion']): Promise<{ platformVersion?: string }>;
}
const userPlatform = () => (navigator as Navigator & { userAgentData?: ClientPlatform }).userAgentData;
const desktop = () => window.luma?.diagnostics;
const notify = () => listeners.forEach((listener) => listener());

function browserSnapshot(): DiagnosticSnapshot {
  if (web) return web;
  const ua = navigator.userAgent;
  const system = browserSystem(ua, userPlatform()?.platform, undefined, navigator.maxTouchPoints);
  const match = /\bEdg\/(\d+)/u.exec(ua) ?? /\b(?:Headless)?Chrome\/(\d+)/u.exec(ua)
    ?? /\bFirefox\/(\d+)/u.exec(ua) ?? /\bVersion\/(\d+).*Safari\//u.exec(ua);
  const engine = match?.[0].startsWith('Edg') ? 'Edge' : match?.[0].includes('Chrome') ? 'Chrome'
    : match?.[0].startsWith('Firefox') ? 'Firefox' : match ? 'Safari' : 'Браузер';
  let storage: DiagnosticSnapshot['storage'] = 'browser';
  let entries: DiagnosticSnapshot['entries'] = [];
  try { entries = readLog(localStorage.getItem(KEY), 'renderer'); } catch { storage = 'session'; }
  web = { entries, storage, environment: { ...webAppInfo, system, runtime: match ? `${engine} ${match[1]}` : engine, online } };
  return web;
}

function writeWeb(entries: DiagnosticSnapshot['entries']) {
  const previous = browserSnapshot();
  let storage: DiagnosticSnapshot['storage'] = 'browser';
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { storage = 'session'; }
  web = { ...previous, entries, storage, environment: { ...previous.environment, online } };
  notify();
  return web;
}

export function recordDiagnostic(event: RendererLogEvent, values?: LogValues) {
  const api = desktop();
  if (api) { api.record(event, values); return; }
  const entry = logEntry(event, values, 'renderer');
  if (entry) writeWeb(appendLog(browserSnapshot().entries, entry));
}

function refineWebSystem() {
  const hint = userPlatform();
  if (platformChecked || hint?.platform !== 'Windows' || !hint.getHighEntropyValues) return;
  platformChecked = true;
  void hint.getHighEntropyValues(['platformVersion']).then(({ platformVersion }) => {
    const snapshot = browserSnapshot();
    const system = browserSystem(navigator.userAgent, hint.platform, platformVersion);
    if (system === snapshot.environment.system) return;
    web = { ...snapshot, environment: { ...snapshot.environment, system } };
    notify();
  }).catch(() => { /* A browser can withhold the version; never guess from Windows NT 10.0. */ });
}

export function startDiagnostics() {
  if (started) return;
  started = true;
  recordDiagnostic('renderer.start', { ms: performance.now() });
  if (!desktop()) refineWebSystem();
  const logConnection = () => {
    online = navigator.onLine;
    recordDiagnostic(online ? 'network.online' : 'network.offline');
  };
  window.addEventListener('online', logConnection);
  window.addEventListener('offline', logConnection);
  window.addEventListener('error', () => recordDiagnostic('renderer.error'));
  window.addEventListener('unhandledrejection', () => recordDiagnostic('renderer.rejection'));
  logConnection();
}

export function subscribeConnection(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => { window.removeEventListener('online', listener); window.removeEventListener('offline', listener); };
}
export const connectionState = () => navigator.onLine;

export const subscribeDiagnostics = (listener: () => void) => {
  const api = desktop();
  if (api) return api.onChange(listener);
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getDiagnostics = async () => desktop()?.snapshot() ?? browserSnapshot();
export const clearDiagnostics = async () => desktop()?.clear() ?? writeWeb([]);

export async function saveDiagnostics(t: Text): Promise<boolean> {
  const api = desktop();
  if (api) return api.saveReport();
  const url = URL.createObjectURL(new Blob([diagnosticsReport(browserSnapshot(), t)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFilename();
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
