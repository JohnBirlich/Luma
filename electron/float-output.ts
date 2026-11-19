import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { FLOAT_FRAME_BYTES, validFloatRate } from '../src/shared/float-output.js';
import type { FloatStart } from '../src/shared/float-output.js';

interface Playback { child: ChildProcessWithoutNullStreams; started: boolean; stopping: boolean; done: Promise<void>; maxPending: number }

export class DesktopFloatOutput {
  private playback?: Playback;
  private revision = 0;
  onLost?: () => void;
  constructor(private executable?: string) {}
  async available() { return !!this.executable && (await stat(this.executable).catch(() => null))?.isFile() === true; }

  async start(rate: unknown): Promise<FloatStart> {
    if (!validFloatRate(rate) || this.playback) return 'failed';
    const revision = ++this.revision;
    if (!this.executable || !(await this.available())) return 'missing';
    if (revision !== this.revision || this.playback) return 'failed';
    // No shell or arguments originating from a filename, URL, or configuration file.
    const child = spawn(this.executable, [String(rate)], { windowsHide: true });
    const playback: Playback = {
      child, stopping: false, started: false, maxPending: Math.ceil(rate * .12) * FLOAT_FRAME_BYTES,
      done: new Promise((resolve) => child.once('close', () => resolve())),
    };
    this.playback = playback;
    child.stderr.resume();
    child.stdin.on('error', () => child.kill());
    child.on('error', () => {}); // A missing/blocked helper resolves as failed below.
    child.once('close', () => {
      if (this.playback === playback) this.playback = undefined;
      if (playback.started && !playback.stopping) this.onLost?.();
    });
    const state = await new Promise<FloatStart>((resolve) => {
      let output = '';
      const timeout = setTimeout(() => { child.kill(); resolve('failed'); }, 3700);
      child.once('close', () => { clearTimeout(timeout); resolve('failed'); });
      child.stdout.on('data', (data: Buffer) => {
        if (playback.started || playback.stopping) return;
        output += data.toString('ascii');
        if (output.length > 64) { child.kill(); resolve('failed'); return; }
        const newline = output.indexOf('\n');
        if (newline < 0) return;
        clearTimeout(timeout);
        const word = output.slice(0, newline).trim();
        playback.started = word === 'ready';
        resolve(playback.started ? 'running' : word === 'unsupported' ? 'unsupported' : 'failed');
      });
    });
    return playback.stopping ? 'failed' : state;
  }

  drain(bytes: unknown) {
    const playback = this.playback;
    if (!playback?.started || playback.stopping || !(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 24 * 1024
      || bytes.byteLength % FLOAT_FRAME_BYTES || playback.child.stdin.destroyed || playback.child.stdin.writableLength + bytes.byteLength > playback.maxPending) return;
    playback.child.stdin.write(Buffer.from(bytes));
  }

  async stop() {
    this.revision++;
    const playback = this.playback;
    if (!playback) return;
    playback.stopping = true;
    playback.child.kill();
    await playback.done;
  }
}
