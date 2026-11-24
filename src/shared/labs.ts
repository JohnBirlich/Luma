/**
 * Settings the app reads in the main process before the window exists: the VK
 * domain, the VK proxy and whether credential files may stay unencrypted.
 * They live in their own small file (`labs.json` in the profile), because the
 * renderer's preferences are not readable at that point.
 */
export type VkDomainName = 'vk.com' | 'vk.ru';
export interface ProxySettings { enabled: boolean; host: string; port: string }
export interface LabSettings {
  /** «Использовать домен vk.ru» — vk.com stays available for networks that block it. */
  vkDomain: VkDomainName;
  /** Stored in plain text on disk; only for devices whose keystore keeps failing. */
  unencryptedStorage: boolean;
  proxy: ProxySettings;
}

export const DEFAULT_LABS: LabSettings = {
  vkDomain: 'vk.ru',
  unencryptedStorage: false,
  proxy: { enabled: false, host: '', port: '' },
};

const hostPattern = /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;
export const validProxyHost = (value: unknown): value is string => typeof value === 'string' && hostPattern.test(value);
export const validProxyPort = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return false;
  const port = Number(value);
  return port >= 1 && port <= 65_535;
};

/** Electron's rule string; undefined means "no proxy" rather than an empty rule. */
export function proxyRules(proxy: ProxySettings) {
  if (!proxy.enabled || !validProxyHost(proxy.host) || !validProxyPort(proxy.port)) return;
  const target = `${proxy.host}:${proxy.port}`;
  return `http=${target};https=${target}`;
}

export const vkOriginFor = (domain: VkDomainName) => `https://${domain}`;
export const vkMusicUrlFor = (domain: VkDomainName) => `${vkOriginFor(domain)}/audio`;

const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function readLabSettings(value: unknown): LabSettings {
  const row = (value ?? {}) as Partial<Record<keyof LabSettings, unknown>>;
  const proxy = (row.proxy ?? {}) as Partial<ProxySettings>;
  const host = text(proxy.host, 253);
  const port = text(proxy.port, 5);
  return {
    vkDomain: row.vkDomain === 'vk.com' ? 'vk.com' : 'vk.ru',
    unencryptedStorage: row.unencryptedStorage === true,
    proxy: {
      enabled: proxy.enabled === true,
      host: validProxyHost(host) ? host : '',
      port: validProxyPort(port) ? port : '',
    },
  };
}

/** A patch from the renderer can only touch known fields. */
export function mergeLabSettings(current: LabSettings, patch: unknown): LabSettings {
  const row = (patch ?? {}) as Partial<Record<keyof LabSettings, unknown>>;
  return readLabSettings({
    vkDomain: row.vkDomain ?? current.vkDomain,
    unencryptedStorage: row.unencryptedStorage ?? current.unencryptedStorage,
    proxy: { ...current.proxy, ...(typeof row.proxy === 'object' && row.proxy ? row.proxy : {}) },
  });
}
