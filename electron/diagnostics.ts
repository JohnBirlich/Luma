import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { release, type } from 'node:os';
import { dirname, join } from 'node:path';
import { net } from 'electron';
import type { AppInfo } from '../src/shared/app-info.js';
import { appendLog, logEntry, MAX_LOG_FILE_BYTES, readLog } from '../src/shared/diagnostics.js';
import type { DiagnosticSnapshot, LogEntry, LogValues, MainLogEvent } from '../src/shared/diagnostics.js';

export class DesktopDiagnostics {
  onChange?: () => void;
  private entries: LogEntry[] = [];
  private saved = true;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private writes = Promise.resolve();

  private constructor(private file: string, private info: AppInfo) {}

  static async open(profile: string, info: AppInfo) {
    const journal = new DesktopDiagnostics(join(profile, 'logs', 'diagnostics.json'), info);
    try {
      await mkdir(dirname(journal.file), { recursive: true });
      const stats = await stat(journal.file);
      if (stats.isFile() && stats.size <= MAX_LOG_FILE_BYTES) journal.entries = readLog(await readFile(journal.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') journal.saved = false;
    }
    return journal;
  }

  snapshot(): DiagnosticSnapshot {
    return {
      entries: this.entries,
      storage: this.saved ? 'file' : 'session',
      environment: {
        ...this.info,
        system: `${process.platform === 'win32' ? 'Windows' : type()} ${release()} · ${process.arch}`,
        runtime: `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node.js ${process.versions.node}`,
        online: net.isOnline(),
      },
    };
  }

  main(event: MainLogEvent, values?: LogValues) { this.record(logEntry(event, values, 'main')); }
  renderer(event: unknown, values: unknown) { this.record(logEntry(event, values, 'renderer')); }

  private record(entry?: LogEntry) {
    if (!entry) return;
    this.entries = appendLog(this.entries, entry);
    this.dirty = true;
    this.timer ??= setTimeout(() => { void this.flush(); }, 220);
    this.onChange?.();
  }

  async clear() {
    this.entries = [];
    this.dirty = true;
    this.onChange?.();
    await this.flush();
    return this.snapshot();
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.dirty) return this.writes;
    this.dirty = false;
    const contents = JSON.stringify(this.entries);
    this.writes = this.writes.then(async () => {
      const previous = this.saved;
      try {
        await mkdir(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        await writeFile(temporary, contents, 'utf8');
        await rename(temporary, this.file);
        this.saved = true;
      } catch { this.saved = false; }
      if (this.saved !== previous) this.onChange?.();
    });
    return this.writes;
  }
}
