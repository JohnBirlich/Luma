import { appendLog, diagnosticsReport, logEntry, readLog, reportFilename } from '../shared/diagnostics';
import type { DiagnosticSnapshot, LogValues, RendererLogEvent } from '../shared/diagnostics';

const KEY = 'luma-diagnostics:v1';
const listeners = new Set<() => void>();
let started = false;
let online = navigator.onLine;
let web: DiagnosticSnapshot | undefined;
const desktop = () => window.luma?.diagnostics;
const notify = () => listeners.forEach((listener) => listener());

function browserSnapshot(): DiagnosticSnapshot {
  if (web) return web;
  const ua = navigator.userAgent;
  const system = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Не определена';
  const match = /\bEdg\/(\d+)/u.exec(ua) ?? /\b(?:Headless)?Chrome\/(\d+)/u.exec(ua)
    ?? /\bFirefox\/(\d+)/u.exec(ua) ?? /\bVersion\/(\d+).*Safari\//u.exec(ua);
  const engine = match?.[0].startsWith('Edg') ? 'Edge' : match?.[0].includes('Chrome') ? 'Chrome'
    : match?.[0].startsWith('Firefox') ? 'Firefox' : match ? 'Safari' : 'Браузер';
  let storage: DiagnosticSnapshot['storage'] = 'browser';
  let entries: DiagnosticSnapshot['entries'] = [];
  try { entries = readLog(localStorage.getItem(KEY), 'renderer'); } catch { storage = 'session'; }
  web = { entries, storage, environment: { version: __APP_VERSION__, mode: 'web', system, runtime: match ? `${engine} ${match[1]}` : engine, online } };
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

export function startDiagnostics() {
  if (started) return;
  started = true;
  recordDiagnostic('renderer.start', { ms: performance.now() });
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

export async function saveDiagnostics(): Promise<boolean> {
  const api = desktop();
  if (api) return api.saveReport();
  const url = URL.createObjectURL(new Blob([diagnosticsReport(browserSnapshot())], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFilename();
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
