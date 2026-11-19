import * as glue from 'rusty-chromaprint-wasm/dist/rusty_chromaprint_wasm_bg.js';
import wasmUrl from 'rusty-chromaprint-wasm/dist/rusty_chromaprint_wasm_bg.wasm?url';

const bindings = glue as unknown as {
  Fingerprinter: typeof import('rusty-chromaprint-wasm').Fingerprinter;
  __wbg_set_wasm(exports: WebAssembly.Exports): void;
};

self.onmessage = async ({ data }: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), { './rusty_chromaprint_wasm_bg.js': glue });
    bindings.__wbg_set_wasm(instance.exports);
    (instance.exports.__wbindgen_start as () => void)();
    const { channels, sampleRate } = data;
    const printer = new bindings.Fingerprinter();
    try {
      // Downmix/interleave in bounded chunks; the decoder and its audio graph are never shared with playback.
      const interleaved = new Int16Array(8192 * channels.length);
      printer.start(sampleRate, channels.length);
      for (let offset = 0; offset < channels[0].length; offset += 8192) {
        const frames = Math.min(8192, channels[0].length - offset);
        for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels.length; channel++) {
          interleaved[i * channels.length + channel] = Math.max(-1, Math.min(1, channels[channel][i + offset])) * 32767;
        }
        printer.consume(interleaved.subarray(0, frames * channels.length));
      }
      printer.finish();
      self.postMessage(printer.getCompressedFingerprint());
    } finally { printer.free(); }
  } catch { self.postMessage(null); }
};
