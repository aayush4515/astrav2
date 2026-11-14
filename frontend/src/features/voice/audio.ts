/**
 * Microphone capture with a simple adaptive energy VAD, producing 16 kHz mono 16-bit WAV.
 * Transcription itself happens locally on the ASTRA backend (faster-whisper).
 */

export interface ListenOptions {
  /** Give up if no speech starts within this time. */
  noSpeechTimeoutMs?: number;
  /** Speech is considered finished after this much trailing silence. */
  silenceMs?: number;
  /** Hard cap on utterance length. */
  maxMs?: number;
  signal?: AbortSignal;
  onLevel?: (level: number, speaking: boolean) => void;
}

export interface Utterance {
  wav: Blob;
  durationMs: number;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function downsample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export class Microphone {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private noiseFloor = 0.006;

  get active() {
    return !!this.stream;
  }

  async open(ctx: AudioContext): Promise<void> {
    if (this.stream) return;
    this.ctx = ctx;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.source = ctx.createMediaStreamSource(this.stream);
  }

  close() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.stream = null;
    this.source = null;
  }

  /** Record one utterance. Resolves null when no speech was detected. */
  listen(opts: ListenOptions = {}): Promise<Utterance | null> {
    const ctx = this.ctx;
    const source = this.source;
    if (!ctx || !source) return Promise.reject(new Error("Microphone not open"));
    const { noSpeechTimeoutMs = 7000, silenceMs = 1000, maxMs = 15000, signal, onLevel } = opts;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    const chunks: Float32Array[] = [];
    const preRoll: Float32Array[] = [];
    const sr = ctx.sampleRate;
    const chunkMs = (4096 / sr) * 1000;
    let speaking = false;
    let speechMs = 0;
    let silence = 0;
    let elapsed = 0;

    return new Promise((resolve, reject) => {
      let done = false;
      // Safety net: if the audio graph stalls (e.g. suspended context) we still end the turn.
      const guard = setTimeout(() => finish(speaking), noSpeechTimeoutMs + maxMs + 1000);
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        proc.disconnect();
        sink.disconnect();
        try {
          source.disconnect(proc);
        } catch {
          /* already disconnected */
        }
        signal?.removeEventListener("abort", onAbort);
        if (!ok || speechMs < 200) return resolve(null);
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Float32Array(total);
        let o = 0;
        for (const c of chunks) {
          merged.set(c, o);
          o += c.length;
        }
        const pcm = downsample(merged, sr);
        resolve({ wav: encodeWav(pcm, 16000), durationMs: (pcm.length / 16000) * 1000 });
      };
      const onAbort = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        proc.disconnect();
        sink.disconnect();
        try {
          source.disconnect(proc);
        } catch {
          /* already disconnected */
        }
        reject(new DOMException("aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort);

      proc.onaudioprocess = (e) => {
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const threshold = Math.max(0.012, this.noiseFloor * 3);
        const voiced = rms > threshold;
        if (!speaking) {
          // Track background noise while waiting for speech.
          this.noiseFloor = this.noiseFloor * 0.95 + Math.min(rms, 0.05) * 0.05;
          preRoll.push(data);
          if (preRoll.length > 4) preRoll.shift();
        }
        onLevel?.(Math.min(1, rms * 12), speaking);
        elapsed += chunkMs;
        if (voiced) {
          if (!speaking) {
            speaking = true;
            chunks.push(...preRoll);
          }
          speechMs += chunkMs;
          silence = 0;
        } else if (speaking) {
          silence += chunkMs;
        }
        if (speaking) chunks.push(data);
        if (!speaking && elapsed > noSpeechTimeoutMs) finish(false);
        else if (speaking && silence > silenceMs) finish(true);
        else if (elapsed > maxMs) finish(speaking);
      };
      source.connect(proc);
      proc.connect(sink);
      sink.connect(ctx.destination);
    });
  }
}
