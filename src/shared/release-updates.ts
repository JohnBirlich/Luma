export const RELEASE_REPO = 'JohnBirlich/VKX-Modded';
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
export const MAX_INSTALLER_BYTES = 256 * 1024 * 1024;
// Preserve the exact release asset path understood by installed versions.
export const installerName = (version: string) => `Luma-Player-Setup-${version}-x64.exe`;
export const portableName = (version: string) => `Luma-Portable-${version}-x64.exe`;
export type UpdateMode = 'signed' | 'manual' | 'portable' | 'development';
export type UpdateReport = { state: 'current' | 'unavailable'; mode: UpdateMode }
  | { state: 'available'; mode: UpdateMode; version: string; bytes: number };
export type InstallResult = 'started' | 'cancelled' | 'unavailable' | 'signature' | 'failed';
export interface WindowsRelease { version: string; asset: string; bytes: number; digest?: string }

export const readSignerSha256 = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : undefined;
const versionParts = (value: string) => /^(?:0|[1-9]\d{0,6})\.(?:0|[1-9]\d{0,6})\.(?:0|[1-9]\d{0,6})$/.test(value) ? value.split('.').map(Number) : undefined;
export function newerStableVersion(candidate: string, installed: string) {
  const next = versionParts(candidate), current = versionParts(installed.split(/[+-]/, 1)[0]);
  if (!next || !current) return false;
  const diff = next.findIndex((value, i) => value !== current[i]);
  return diff >= 0 ? next[diff] > current[diff] : installed.split('+', 1)[0].includes('-');
}

export function readWindowsRelease(value: unknown): WindowsRelease | undefined {
  const row = value as { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown } | undefined;
  if (row?.draft !== false || row.prerelease !== false || typeof row.tag_name !== 'string' || !row.tag_name.startsWith('v')
    || !Array.isArray(row.assets) || row.assets.length > 32) return;
  const version = row.tag_name.slice(1);
  if (!versionParts(version)) return;
  const name = installerName(version);
  const asset = `https://github.com/${RELEASE_REPO}/releases/download/v${version}/${name}`;
  const matches = row.assets.filter((file) => file?.name === name);
  if (matches.length !== 1) return;
  const [file] = matches;
  if (file.state !== 'uploaded' || file.browser_download_url !== asset || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_INSTALLER_BYTES) return;
  const digest = typeof file.digest === 'string' && file.digest.startsWith('sha256:') ? readSignerSha256(file.digest.slice(7)) : undefined;
  return { version, asset, bytes: file.size, digest };
}
