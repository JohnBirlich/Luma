/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class LumaFloatTap extends AudioWorkletProcessor {
  constructor() {
    super();
    // About 12 ms; exact rendering-quantum multiples work at uncommon rates too.
    this.size = Math.max(128, Math.round(sampleRate * .012 / 128) * 128) * 2;
    this.block = new Float32Array(this.size);
    this.at = 0;
    this.credit = 5;
    this.port.onmessage = () => { this.credit = Math.min(5, this.credit + 1); };
  }
  process(inputs) {
    const left = inputs[0]?.[0];
    const right = inputs[0]?.[1] ?? left;
    if (!left || !this.credit) return true;
    for (let i = 0; i < left.length && this.credit; i++) {
      this.block[this.at++] = left[i];
      this.block[this.at++] = right[i];
      if (this.at === this.size) {
        this.port.postMessage(this.block.buffer, [this.block.buffer]);
        this.block = new Float32Array(this.size);
        this.at = 0;
        this.credit--;
      }
    }
    return true; // No signal goes to the Chromium destination from this tap.
  }
}
registerProcessor('luma-float-tap', LumaFloatTap);
