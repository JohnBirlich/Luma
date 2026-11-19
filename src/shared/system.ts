/** Format the Windows product separately from its NT kernel number (10.0 on both 10 and 11). */
export function windowsSystem(release: string, installation?: string, displayVersion?: string) {
  const version = /^(\d+)\.(\d+)\.(\d+)(?:\.\d+)?$/.exec(release);
  if (!version) return 'Windows · сборка неизвестна';
  const [, major, minor, build] = version;
  const server = /^server\b/i.test(installation ?? '');
  const family = server ? 'Windows Server'
    : major === '10' && minor === '0' && Number(build) >= 22000 ? 'Windows 11'
      : major === '10' && minor === '0' ? 'Windows 10' : 'Windows';
  const label = displayVersion && /^(?:\d{2}H[12]|\d{4})$/i.test(displayVersion) ? ` ${displayVersion}` : '';
  return `${family}${label} · сборка ${build}`;
}

export function browserSystem(ua: string, platform?: string, version?: string, touches = 0): string {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touches > 1)) return 'iOS / iPadOS';
  if (platform === 'Android' || /Android/i.test(ua)) return 'Android';
  if (platform === 'Chrome OS' || /\bCrOS\b/i.test(ua)) return 'ChromeOS';
  if (platform === 'Windows' || /Windows/i.test(ua)) {
    const major = /^\d{1,3}(?:\.\d+){0,2}$/.test(version ?? '') ? Number(version?.split('.')[0]) : 0;
    return major >= 13 ? 'Windows 11 или новее' : major >= 1 ? 'Windows 10' : 'Windows · выпуск не определён';
  }
  if (platform === 'macOS' || /Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (platform === 'Linux' || /Linux/i.test(ua)) return 'Linux';
  return 'Не определена';
}
