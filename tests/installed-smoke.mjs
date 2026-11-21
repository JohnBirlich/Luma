// This smoke modifies the current user's protocol registration. Only run on a clean, GitHub-hosted Windows runner.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { APP_NAME, APP_USER_MODEL_ID } from '../dist-electron/src/shared/app-info.js';
import { MUSIC_LINK_SCHEME, musicLaunchUrl, readMusicLink } from '../dist-electron/src/shared/music-links.js';

assert.ok(process.platform === 'win32' && process.arch === 'x64' && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_ENVIRONMENT === 'github-hosted' && isAbsolute(process.env.RUNNER_TEMP ?? ''),
  'Installed smoke requires a disposable, GitHub-hosted Windows x64 runner. It must not run on a user PC.');

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const config = await readFile(join(root, 'electron-builder.yml'), 'utf8');
const guid = /^  guid: ([\da-f-]{36})\r?$/m.exec(config)?.[1];
assert.ok(guid, 'installer GUID is required');
const artifacts = join(root, 'release');
const setup = join(artifacts, `Luma-Player-Setup-${version}-x64.exe`);
const portable = join(artifacts, `Luma-Player-Portable-${version}-x64.exe`);
const folder = await mkdtemp(join(process.env.RUNNER_TEMP, 'Luma installed smoke '));
const temp = join(folder, 'temp');
const installed = join(folder, 'Luma installed app');
const exe = join(installed, APP_USER_MODEL_ID);
const uninstaller = join(installed, `Uninstall ${APP_NAME}.exe`);
const expectedCommand = `"${exe}" -- "%1"`;
const foreignCommand = 'Luma CI ownership sentinel (never invoked)';
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const exec = promisify(execFile);
const env = { ...process.env, TEMP: temp, TMP: temp,
  LUMA_SMOKE_PREFIX: folder + sep, LUMA_SMOKE_APP: basename(APP_USER_MODEL_ID, '.exe'), LUMA_SMOKE_INSTALL: installed,
  LUMA_SMOKE_CLASS: `Software\\Classes\\${MUSIC_LINK_SCHEME}`, LUMA_SMOKE_GUID: guid,
};
delete env.ELECTRON_RUN_AS_NODE;

async function ps(script, values = {}, timeout = 25_000) {
  const source = `$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n[Console]::OutputEncoding = [Text.Encoding]::UTF8\n${script}`;
  const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')], {
    env: { ...env, ...values }, windowsHide: true, timeout, maxBuffer: 32 * 1024,
  });
  return stdout.trim();
}

async function state() {
  return JSON.parse(await ps(String.raw`
function Read-Registration($root) {
  $scheme = $root.OpenSubKey($env:LUMA_SMOKE_CLASS)
  $command = $root.OpenSubKey($env:LUMA_SMOKE_CLASS + '\shell\open\command')
  $install = $root.OpenSubKey('Software\' + $env:LUMA_SMOKE_GUID)
  $uninstall = $root.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $env:LUMA_SMOKE_GUID)
  @{ scheme = ($null -ne $scheme); protocol = $(if ($scheme) { $scheme.GetValue('URL Protocol') })
    command = $(if ($command) { $command.GetValue('') }); install = $(if ($install) { $install.GetValue('InstallLocation') })
    version = $(if ($uninstall) { $uninstall.GetValue('DisplayVersion') }) }
}
@{ user = Read-Registration ([Microsoft.Win32.Registry]::CurrentUser)
  machine = Read-Registration ([Microsoft.Win32.Registry]::LocalMachine) } | ConvertTo-Json -Compress
`));
}

const noInstall = (entry) => !entry.install && !entry.version;
const exists = (path) => stat(path).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error; });

async function install() {
  // NSIS requires /D= last and unquoted, including when the path contains spaces.
  await ps(`$p = Start-Process -FilePath $env:LUMA_SMOKE_EXE -ArgumentList ('/S /currentuser /D=' + $env:LUMA_SMOKE_INSTALL) -Wait -PassThru
if ($p.ExitCode -ne 0) { throw ('Setup exit: ' + $p.ExitCode) }`, { LUMA_SMOKE_EXE: setup }, 150_000);
  assert.ok(await exists(exe), 'Setup placed the application in the selected path');
  assert.ok(await exists(uninstaller), 'Setup created its own uninstaller');
  const { user, machine } = await state();
  assert.equal(user.version, version, 'installed version');
  assert.equal(user.protocol, '', 'URL Protocol marker');
  assert.equal(user.command, expectedCommand, 'Setup owns the per-user protocol and quotes the application path');
  assert.ok(noInstall(machine) && !machine.scheme, 'per-user Setup did not register for all users');
}

async function uninstall() {
  await ps(`$p = Start-Process -FilePath $env:LUMA_SMOKE_EXE -ArgumentList '/S /currentuser' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw ('Uninstall exit: ' + $p.ExitCode) }`, { LUMA_SMOKE_EXE: uninstaller }, 90_000);
  assert.equal(await exists(exe), false, 'uninstall removed the application');
  assert.ok(noInstall((await state()).user), 'uninstall removed the per-user app registration');
}

async function openLink(id) {
  const link = readMusicLink(`https://vk.ru/audio123_${id}`);
  assert.ok(link);
  await ps('Start-Process -FilePath $env:LUMA_SMOKE_URL', { LUMA_SMOKE_URL: musicLaunchUrl(link) });
}

async function stopApps() {
  // Do not stop any process outside the test folder; even Portable unpacks under its isolated TEMP.
  await ps(`$items = @(Get-Process -Name $env:LUMA_SMOKE_APP -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and $_.Path.StartsWith($env:LUMA_SMOKE_PREFIX, [StringComparison]::OrdinalIgnoreCase)
})
foreach ($p in $items) {
  if ($p.HasExited -or $p.MainWindowHandle -eq 0) { continue }
  if ($p.CloseMainWindow()) { [void]$p.WaitForExit(6000) }
}
foreach ($p in $items) {
  if ($p.HasExited) { continue }
  try { $p.Kill(); [void]$p.WaitForExit(3000) } catch { if (!$p.HasExited) { throw } }
}`, {}, 40_000);
}

async function journal(profile, label, check) {
  const log = join(profile, 'logs', 'diagnostics.json');
  const limit = Date.now() + 40_000;
  while (Date.now() < limit) {
    let entries = [];
    try { entries = JSON.parse(await readFile(log, 'utf8')); }
    catch (error) { if (!['ENOENT', 'EPERM', 'EBUSY'].includes(error.code)) throw error; }
    if (entries.some(({ event }) => event === 'desktop.failed' || event === 'desktop.pageFailed')) throw new Error(`App startup failed: ${label}`);
    if (check(entries.map(({ event }) => event))) return entries;
    await delay(250);
  }
  throw new Error(`Timed out: ${label}`);
}

const count = (events, name) => events.filter((event) => event === name).length;
const delivered = 'desktop.musicLinkDelivered';
const installedFixture = (entry) => ({
  scheme: entry.scheme, hasCommand: !!entry.command, hasInstallLocation: !!entry.install, hasUninstaller: !!entry.version,
});
const preflightOnly = process.argv.includes('--preflight');
let profile, clean = false, portableProcess;
let stage = 'isolation';
try {
  await mkdir(temp);
  profile = join(await ps("[Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)"), APP_NAME);
  assert.ok(isAbsolute(profile) && !await exists(profile), 'requires a fresh Windows user profile without existing Luma data');
  const before = await state();
  const registry = JSON.stringify({ user: installedFixture(before.user), machine: installedFixture(before.machine) });
  assert.ok(noInstall(before.user) && noInstall(before.machine) && !before.user.scheme && !before.machine.scheme,
    `requires an unregistered Luma installation: ${registry}`);
  assert.equal(await ps('@(Get-Process -Name $env:LUMA_SMOKE_APP -ErrorAction SilentlyContinue).Count'), '0', 'no installed or portable Luma is running');
  if (preflightOnly) console.log('::notice title=Installed smoke preflight::Windows registry and profile are clear before packaging.');
  else {
    clean = true;

    stage = 'install and real ShellExecute handoff';
    await install();
    await openLink(456);
    await journal(profile, 'cold launch through Windows', (events) => count(events, 'desktop.ready') === 1 && count(events, delivered) === 1);
    await openLink(457);
    const warm = await journal(profile, 'warm activation through Windows', (events) => count(events, delivered) === 2);
    assert.equal(count(warm.map(({ event }) => event), 'desktop.start'), 1, 'warm activation did not open a second app');
    assert.ok(!warm.some(({ event }) => event === 'audio.play'), 'no autoplay through a VK link');
    assert.ok(!JSON.stringify(warm).includes('vk.ru/audio'), 'journal does not contain the link');
    await stopApps();

    stage = 'reinstall and uninstall';
    const sentinel = join(profile, 'installed-smoke-profile.txt');
    await writeFile(sentinel, 'Profile preserved', { flag: 'wx' });
    await install();
    assert.equal(await readFile(sentinel, 'utf8'), 'Profile preserved');
    await uninstall();
    assert.equal((await state()).user.scheme, false, 'uninstall removed its own URL association');
    assert.equal(await readFile(sentinel, 'utf8'), 'Profile preserved');

    stage = 'portable';
    portableProcess = spawn(portable, [], { env, cwd: folder, stdio: 'ignore', windowsHide: true });
    await new Promise((resolve, reject) => { portableProcess.once('spawn', resolve); portableProcess.once('error', reject); });
    await journal(profile, 'Portable reached its window using the existing profile', (events) => count(events, 'desktop.ready') === 2);
    const portableState = await state();
    assert.ok(noInstall(portableState.user) && !portableState.user.scheme, 'Portable did not create a protocol or uninstall registration');
    await stopApps();

    stage = 'uninstall respecting reassigned association';
    await install();
    await ps(String.raw`$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($env:LUMA_SMOKE_CLASS + '\shell\open\command', $true)
  $key.SetValue('', $env:LUMA_SMOKE_MARKER)`, { LUMA_SMOKE_MARKER: foreignCommand });
    await uninstall();
    assert.equal((await state()).user.command, foreignCommand, 'uninstall leaves a protocol command with a different owner alone');
    console.log('::notice title=Installed Windows::Real Setup and Windows URL handoff (cold and warm), same-version reinstall and profile retention, Portable and uninstall ownership verified.');
  }
} catch (error) {
  const message = String(error.stderr || error.message).replace(/[\r\n%]/g, ' ').trim().slice(0, 950);
  console.log(`::error title=Installed smoke::${stage}: ${message}`);
  throw error;
} finally {
  if (clean) {
    await stopApps().catch(() => {});
    if (portableProcess?.exitCode === null) portableProcess.kill();
    if (await exists(uninstaller)) await uninstall().catch(() => {});
    const { user } = await state().catch(() => ({}));
    if (user?.command === foreignCommand || user?.command === expectedCommand) {
      await ps('[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($env:LUMA_SMOKE_CLASS, $false)').catch(() => {});
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
  await rm(folder, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
