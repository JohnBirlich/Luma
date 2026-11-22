import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { discordClientId, readDiscordTrack } from '../src/shared/discord-presence.js';
import type { DiscordStatus, DiscordTrack } from '../src/shared/discord-presence.js';

const MAX_FRAME = 64 * 1024;
const MIN_INTERVAL = 5000;
const RECONNECT = 25_000;
const OP = { handshake: 0, frame: 1, close: 2, ping: 3, pong: 4 } as const;
export function discordPipe(index: number) { return `\\\\.\\pipe\\discord-ipc-${index}`; }

export function discordFrame(opcode: number, json: unknown) {
  const body = Buffer.isBuffer(json) ? json : Buffer.from(JSON.stringify(json), 'utf8');
  if (body.length > MAX_FRAME) throw new RangeError('Discord frame too large');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Decode fragmented headers/bodies and batched frames without buffering an unbounded message. */
export class DiscordFrames {
  private left: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  push(chunk: Buffer) {
    if (chunk.length > MAX_FRAME * 2) throw new RangeError('Discord packet too large');
    let data = this.left.length ? Buffer.concat([this.left, chunk]) : chunk;
    const messages: { opcode: number; body: Buffer }[] = [];
    while (data.length >= 8) {
      const opcode = data.readUInt32LE(0), size = data.readUInt32LE(4);
      if (opcode > OP.pong || size > MAX_FRAME) throw new RangeError('Invalid Discord frame');
      if (data.length < size + 8) break;
      messages.push({ opcode, body: data.subarray(8, size + 8) });
      data = data.subarray(size + 8);
    }
    this.left = data;
    return messages;
  }
}

/** Windows Discord IPC only. No RPC web server, bot token, OAuth or outbound HTTP. */
export class DesktopDiscord {
  private client = '';
  private desired: DiscordTrack | null = null;
  private lastSent = '';
  private socket?: Socket;
  private ready = false;
  private lastUpdate = 0;
  private timer?: ReturnType<typeof setTimeout>;
  onChange?: (status: DiscordStatus) => void;

  constructor(private supported: boolean, private connect = (index: number) => createConnection(discordPipe(index))) {}

  status(): DiscordStatus {
    return !this.supported ? 'unsupported' : !this.client ? 'off' : this.ready ? 'connected' : 'waiting';
  }
  update(client: unknown, track: unknown) {
    if (!this.supported) return;
    const id = discordClientId(client);
    if (id !== this.client) {
      this.stop();
      this.client = id;
      if (id) this.onChange?.(this.status());
    }
    this.desired = this.client ? readDiscordTrack(track) : null;
    if (this.ready) this.publish();
    else if (this.desired && !this.socket && !this.timer) this.open(0);
  }
  stop() {
    clearTimeout(this.timer); this.timer = undefined;
    this.desired = null;
    const old = this.socket;
    if (old && this.ready) {
      this.sendActivity(null);
      old.end();
      const timeout = setTimeout(() => old.destroy(), 300);
      timeout.unref();
    } else old?.destroy();
    this.socket = undefined;
    this.ready = false;
    this.client = '';
    this.lastSent = '';
    this.lastUpdate = 0;
    this.onChange?.(this.status());
  }
  private schedule(callback: () => void, ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; callback(); }, ms);
    this.timer.unref();
  }
  private sendActivity(track: DiscordTrack | null) {
    if (!this.socket?.writable) return;
    if (this.socket.writableLength > MAX_FRAME) { this.socket.destroy(); return; }
    const activity = track && { type: 2, details: track.title, state: track.artist, instance: false };
    this.socket.write(discordFrame(OP.frame, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: randomUUID() }));
  }
  private publish() {
    if (!this.ready) return;
    const fingerprint = this.desired ? JSON.stringify(this.desired) : '';
    if (fingerprint === this.lastSent) { clearTimeout(this.timer); this.timer = undefined; return; }
    const wait = this.lastUpdate + MIN_INTERVAL - Date.now();
    if (this.desired && wait > 0) { this.schedule(() => this.publish(), wait); return; }
    clearTimeout(this.timer); this.timer = undefined;
    this.sendActivity(this.desired);
    this.lastUpdate = Date.now();
    this.lastSent = fingerprint;
  }
  private open(index: number) {
    if (!this.client || !this.desired) return;
    if (index >= 10) { this.schedule(() => this.open(0), RECONNECT); return; }
    const socket = this.socket = this.connect(index);
    const decoder = new DiscordFrames();
    const timeout = setTimeout(() => socket.destroy(), 1500);
    timeout.unref();
    socket.once('connect', () => {
      if (this.socket === socket) socket.write(discordFrame(OP.handshake, { v: 1, client_id: this.client }));
    });
    socket.on('data', (chunk: Buffer) => {
      if (this.socket !== socket) return;
      try {
        for (const { opcode, body } of decoder.push(chunk)) {
          if (opcode === OP.ping && socket.writable) socket.write(discordFrame(OP.pong, body));
          else if (opcode === OP.close) { socket.destroy(); return; }
          else if (opcode === OP.frame) {
            const event = JSON.parse(body.toString('utf8')) as { cmd?: string; evt?: string } | null;
            if (event?.evt === 'ERROR') { socket.destroy(); return; }
            if (event?.cmd === 'DISPATCH' && event.evt === 'READY' && !this.ready) {
              clearTimeout(timeout);
              this.ready = true;
              this.onChange?.(this.status());
              this.publish();
            }
          }
        }
      } catch { socket.destroy(); }
    });
    socket.on('error', () => {});
    socket.once('close', () => {
      clearTimeout(timeout);
      if (this.socket !== socket) return;
      const wasReady = this.ready;
      this.socket = undefined; this.ready = false; this.lastSent = ''; this.lastUpdate = 0;
      clearTimeout(this.timer); this.timer = undefined;
      if (wasReady) {
        this.onChange?.(this.status());
        if (this.desired) this.schedule(() => this.open(0), RECONNECT);
      } else this.open(index + 1);
    });
  }
}
