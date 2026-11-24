import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname }           from 'node:path';
import { DEFAULT_LABS, mergeLabSettings, readLabSettings } from '../src/shared/labs.js';
import type { LabSettings } from '../src/shared/labs.js';
import type { SafeStorage } from 'electron';

const FILE_LIMIT = 8 * 1024;
const PLAIN_MARKER = Buffer.from('luma-plain-v1\n', 'utf8');

/**
 * Keystore the credential files go through. Reading tolerates both formats, so
 * turning the experimental switch on (or off) never locks an account out: old
 * encrypted files still decrypt, new ones are written the way the switch says.
 */
export function storages(fallback: SafeStorage, plaintext: boolean): SafeStorage {
  if (!plaintext) return fallback;
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.concat([PLAIN_MARKER, Buffer.from(value, 'utf8')]),
    decryptString: (bytes: Buffer) => bytes.subarray(0, PLAIN_MARKER.length).equals(PLAIN_MARKER)
      ? bytes.subarray(PLAIN_MARKER.length).toString('utf8')
      : fallback.decryptString(bytes),
  } as SafeStorage;
}

/** Lab settings file: read once at startup, written when the settings change. */
export class DesktopLabs {
  private current: LabSettings = { ...DEFAULT_LABS, proxy: { ...DEFAULT_LABS.proxy } };
  private loading?: Promise<LabSettings>;

  constructor(private readonly path: () => string) {}

  get value() { return this.current; }

  load(): Promise<LabSettings> {
    this.loading ??= (async () => {
      try {
        const raw = await readFile(this.path(), 'utf8');
        if (raw.length <= FILE_LIMIT) this.current = readLabSettings(JSON.parse(raw));
      } catch { /* First run or an unreadable file: defaults are safe. */ }
      return this.current;
    })();
    return this.loading;
  }

  async update(patch: unknown): Promise<LabSettings> {
    await this.load();
    const next = mergeLabSettings(this.current, patch);
    const file = this.path();
    const temp = `${file}.tmp`;
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, file);
    } catch { /* Keep the in-memory value; the next launch retries the write. */ }
    finally { await rm(temp, { force: true }).catch(() => {}); }
    this.current = next;
    return next;
  }
}
