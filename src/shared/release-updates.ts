export const RELEASE_REPO = 'JohnBirlich/Luma'; // Browser links and service identification only.
export const RELEASE_REPO_ID = 1463134723;
// GitHub redirects old slugs to this endpoint; the numeric ID survives a rename.
const RELEASE_API = `https://api.github.com/repositories/${RELEASE_REPO_ID}/releases`;
export const LATEST_RELEASE_API = `${RELEASE_API}/latest`;
export const MAX_WINDOWS_ASSET_BYTES = 256 * 1024 * 1024;
// Keep the release filenames consistent with the publisher and installed clients.
export const installerName = (version: string) => `Luma-Player-Setup-${version}-x64.exe`;
export const portableName = (version: string) => `Luma-Portable-${version}-x64.exe`;
export type WindowsArtifact = 'setup' | 'portable';
export const windowsArtifactName = (version: string, artifact: WindowsArtifact) => (artifact === 'portable' ? portableName : installerName)(version);
export type UpdateMode = 'signed' | 'manual' | 'portable' | 'development';
export type UpdateReport = { state: 'current' | 'unavailable'; mode: UpdateMode }
  | { state: 'available'; mode: UpdateMode; version: string; bytes: number; downloadable: boolean };
export type InstallResult = 'started' | 'cancelled' | 'unavailable' | 'signature' | 'failed';
export type DownloadResult = 'saved' | 'cancelled' | 'unavailable' | 'failed';
export type UpdateDownloadState = { state: 'idle' }
  | { state: 'downloading'; version: string; received: number; bytes: number }
  | { state: 'preparing' | 'verifying' | DownloadResult; version: string };
export interface WindowsRelease { version: string; asset: string; bytes: number; digest?: string }

export const readSignerSha256 = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : undefined;
const versionParts = (value: string) => /^(?:0|[1-9]\d{0,6})\.(?:0|[1-9]\d{0,6})\.(?:0|[1-9]\d{0,6})$/.test(value) ? value.split('.').map(Number) : undefined;
export function newerStableVersion(candidate: string, installed: string) {
  const next = versionParts(candidate), current = versionParts(installed.split(/[+-]/, 1)[0]);
  if (!next || !current) return false;
  const diff = next.findIndex((value, i) => value !== current[i]);
  return diff >= 0 ? next[diff] > current[diff] : installed.split('+', 1)[0].includes('-');
}

export function readWindowsRelease(value: unknown, artifact: WindowsArtifact = 'setup'): WindowsRelease | undefined {
  const row = value as { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown } | undefined;
  if (row?.draft !== false || row.prerelease !== false || typeof row.tag_name !== 'string' || !row.tag_name.startsWith('v')
    || !Array.isArray(row.assets) || row.assets.length > 32) return;
  const version = row.tag_name.slice(1);
  if (!versionParts(version)) return;
  const name = windowsArtifactName(version, artifact);
  const matches = row.assets.filter((file) => file?.name === name);
  if (matches.length !== 1) return;
  const [file] = matches;
  if (file.state !== 'uploaded' || !Number.isSafeInteger(file.id) || file.id < 1
    || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_WINDOWS_ASSET_BYTES) return;
  // Construct the download in the same repository; don't follow mutable links in the payload.
  const asset = `${RELEASE_API}/assets/${file.id}`;
  const digest = typeof file.digest === 'string' && file.digest.startsWith('sha256:') ? readSignerSha256(file.digest.slice(7)) : undefined;
  return { version, asset, bytes: file.size, digest };
}
