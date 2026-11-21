import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist-native');
mkdirSync(output, { recursive: true });
if (process.platform !== 'win32') {
  console.log('The native audio and signature helpers are built on Windows only.');
} else {
  const finder = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  let install;
  try { install = execFileSync(finder, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim(); }
  catch { throw new Error('Install Visual Studio Build Tools with Desktop development with C++ to compile the native helpers.'); }
  if (!install) throw new Error('Visual Studio C++ x64 build tools not found.');
  const env = join(install, 'Common7', 'Tools', 'VsDevCmd.bat');
  const compiler = 'cl.exe /nologo /std:c++17 /EHsc /W4 /O2 /MT';
  const build = `"${env}" -arch=x64 -host_arch=x64 && ${compiler} /Fe:LumaFloat.exe "${join(root, 'native/windows/float-output.cpp')}" ole32.lib`
    + ` && ${compiler} /Fe:LumaVerify.exe "${join(root, 'native/windows/verify-signer.cpp')}" wintrust.lib crypt32.lib`;
  execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${build}"`], { cwd: output, stdio: 'inherit', windowsVerbatimArguments: true });
}
