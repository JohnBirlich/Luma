import type { FloatStatus } from '../shared/float-output';
import type { DesktopBridge } from '../shared/media';
import url from './float.worklet.js?url';

// Chromium's silent sink keeps its decoding and DSP running but releases the system endpoint.
// It is not a hardware mode by itself: report success only after WASAPI opened the exact format.
type SwitchableContext = AudioContext & { setSinkId?(value: string | { type: 'none' }): Promise<void> };
export class FloatSink {
  private revision = 0;
  private chain = Promise.resolve();
  private module?: Promise<void>;
  private node?: AudioWorkletNode;
  private silent = false;
  private stopListening: () => void;
  private closed = false;
  constructor(private context: SwitchableContext, private master: GainNode, private bridge: DesktopBridge['floatOutput'], private status: (status: FloatStatus) => void) {
    this.stopListening = bridge.onLost(() => {
      void this.set(false).then(() => { if (!this.closed) this.status('failed'); });
    });
  }
  private async restoreSystem() {
    if (this.node) {
      this.master.disconnect(this.node);
      this.node.disconnect();
      this.node.port.close();
      this.node = undefined;
    }
    await this.bridge.stop().catch(() => {});
    if (this.silent && this.context.state !== 'closed') {
      await this.context.setSinkId?.('');
      this.silent = false;
    }
  }
  set(wanted: boolean) {
    if (this.closed && wanted) return this.chain;
    const id = ++this.revision;
    const current = () => this.revision === id;
    const status = (value: FloatStatus) => { if (current() && !this.closed) this.status(value); };
    this.chain = this.chain.then(async () => {
      if (!current()) return;
      try {
        if (!wanted) { await this.restoreSystem(); status('system'); return; }
        if (this.node) return;
        if (!this.context.setSinkId || !this.context.audioWorklet) { status('missing'); return; }
        if (!await this.bridge.available() || !current()) { status('missing'); return; }
        this.module ??= this.context.audioWorklet.addModule(url).catch((error) => { this.module = undefined; throw error; });
        await this.module;
        if (!current()) return;
        status('starting');
        await this.context.setSinkId({ type: 'none' });
        this.silent = true;
        if (!current()) { await this.restoreSystem(); return; }
        const result = await this.bridge.start(this.context.sampleRate);
        if (result !== 'running' || !current()) { await this.restoreSystem(); status(result); return; }
        const node = new AudioWorkletNode(this.context, 'luma-float-tap', {
          numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2],
        });
        this.node = node;
        node.port.onmessage = ({ data }) => {
          if (this.node === node && data instanceof ArrayBuffer) { this.bridge.write(data); node.port.postMessage(1); }
        };
        node.onprocessorerror = () => { void this.set(false).then(() => { if (!this.closed) this.status('failed'); }); };
        this.master.connect(node).connect(this.context.destination);
        status('running');
      } catch {
        await this.restoreSystem().catch(() => {});
        status('failed');
      }
    });
    return this.chain;
  }
  close() { this.closed = true; this.stopListening(); return this.set(false); }
}
