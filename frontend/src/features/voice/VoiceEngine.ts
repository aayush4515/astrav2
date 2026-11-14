/**
 * ASTRA voice engine: strict turn-taking between local TTS playback and microphone capture.
 * The microphone is never recording while ASTRA is speaking, so ASTRA cannot transcribe itself.
 */
import { api } from "../../services/api";
import type { VoiceState } from "../../types";
import { Microphone, type ListenOptions } from "./audio";

export interface Caption {
  speaker: "astra" | "astronaut";
  text: string;
  at: number;
}

type Listener = () => void;

export interface HeardResult {
  text: string;
  source: "voice" | "manual";
  confidence?: number;
}

class VoiceEngineImpl {
  state: VoiceState = "idle";
  level = 0;
  captions: Caption[] = [];
  error: string | null = null;
  micAvailable = true;
  ttsMode: "piper" | "browser" | "text" = "piper";
  muted = false;
  private ctx: AudioContext | null = null;
  private mic = new Microphone();
  private listeners = new Set<Listener>();
  private currentSource: AudioBufferSourceNode | null = null;
  private manualResolver: ((text: string) => void) | null = null;
  awaitingManual = false;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private set(state: VoiceState) {
    this.state = state;
    this.emit();
  }

  /** Must be called once from a user gesture (browser autoplay policy). */
  async unlock(): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await Promise.race([this.ctx.resume(), wait(300)]);
    this.emit();
  }

  get unlocked() {
    return !!this.ctx && this.ctx.state === "running";
  }

  async openMic(): Promise<boolean> {
    await this.unlock();
    try {
      await this.mic.open(this.ctx!);
      this.micAvailable = true;
    } catch (e) {
      this.micAvailable = false;
      this.error = "Microphone unavailable — use the on-screen answers.";
    }
    this.emit();
    return this.micAvailable;
  }

  closeMic() {
    this.mic.close();
    this.emit();
  }

  get micOpen() {
    return this.mic.active;
  }

  pushCaption(speaker: Caption["speaker"], text: string) {
    this.captions = [...this.captions.slice(-12), { speaker, text, at: Date.now() }];
    this.emit();
  }

  clearCaptions() {
    this.captions = [];
    this.emit();
  }

  stopSpeaking() {
    try {
      this.currentSource?.stop();
    } catch {
      /* not playing */
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  async speak(text: string, signal?: AbortSignal): Promise<void> {
    this.pushCaption("astra", text);
    this.set("speaking");
    try {
      if (this.muted || !this.unlocked) {
        // Audio is blocked until the first user gesture: show the caption for a readable duration instead.
        await wait(Math.min(6000, 600 + text.length * 35), signal);
      } else if (this.ttsMode === "piper") {
        try {
          await this.playPiper(text, signal);
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") throw e;
          this.ttsMode = "speechSynthesis" in window ? "browser" : "text";
          await this.speakFallback(text, signal);
        }
      } else {
        await this.speakFallback(text, signal);
      }
      // Brief gap so the speaker tail is not picked up by the microphone.
      await wait(250, signal);
    } finally {
      if (this.state === "speaking") this.set("idle");
    }
  }

  private async playPiper(text: string, signal?: AbortSignal) {
    await this.unlock();
    const data = await api.synthesize(text, signal);
    const buf = await this.ctx!.decodeAudioData(data.slice(0));
    await new Promise<void>((resolve, reject) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx!.destination);
      this.currentSource = src;
      const onAbort = () => {
        try {
          src.stop();
        } catch {
          /* ignore */
        }
        reject(new DOMException("aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      src.onended = () => {
        signal?.removeEventListener("abort", onAbort);
        this.currentSource = null;
        resolve();
      };
      src.start();
    });
  }

  private speakFallback(text: string, signal?: AbortSignal): Promise<void> {
    if (this.ttsMode === "browser" && "speechSynthesis" in window) {
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.0;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        signal?.addEventListener("abort", () => window.speechSynthesis.cancel(), { once: true });
        window.speechSynthesis.speak(u);
      });
    }
    return wait(Math.min(6000, 600 + text.length * 35), signal);
  }

  /** Lets on-screen controls answer the current listen() call (accessible alternative input). */
  provideManual(text: string) {
    if (this.manualResolver) {
      this.manualResolver(text);
      this.manualResolver = null;
    }
  }

  /** Listen for one utterance and transcribe it locally. Returns null on silence. */
  async listen(opts: ListenOptions & { optional?: boolean } = {}): Promise<HeardResult | null> {
    const manual = new Promise<HeardResult>((resolve) => {
      this.manualResolver = (text) => resolve({ text, source: "manual" });
    });
    this.awaitingManual = true;
    this.set("listening");
    // Inner controller stops the microphone if on-screen input answers first.
    const inner = new AbortController();
    const relay = () => inner.abort();
    opts.signal?.addEventListener("abort", relay, { once: true });
    try {
      if (!this.mic.active || !this.micAvailable || !this.unlocked) {
        // No microphone: wait for on-screen input. Optional windows (e.g. "say cancel") still time out.
        const timeout = opts.optional
          ? wait(opts.noSpeechTimeoutMs ?? 7000, inner.signal).then(() => null).catch(() => null)
          : new Promise<null>(() => undefined);
        const r = await Promise.race([manual, timeout, abortPromise(opts.signal)]);
        if (r?.text) this.pushCaption("astronaut", r.text);
        return r;
      }
      const voice = this.mic
        .listen({ ...opts, signal: inner.signal, onLevel: (l) => ((this.level = l), this.emit()) })
        .then(async (utt): Promise<HeardResult | null> => {
          if (!utt) return null;
          this.set("transcribing");
          const res = await api.transcribe(utt.wav, inner.signal);
          return res.text ? { text: res.text, source: "voice", confidence: res.confidence } : null;
        });
      voice.catch(() => undefined);
      const result = await Promise.race([voice, manual, abortPromise(opts.signal)]);
      if (result?.text) this.pushCaption("astronaut", result.text);
      return result;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") throw e;
      this.error = e instanceof Error ? e.message : String(e);
      this.set("error");
      await wait(400);
      return null;
    } finally {
      inner.abort();
      opts.signal?.removeEventListener("abort", relay);
      this.manualResolver = null;
      this.awaitingManual = false;
      this.level = 0;
      if (this.state === "listening" || this.state === "transcribing" || this.state === "error") this.set("idle");
    }
  }

  setProcessing(on: boolean) {
    this.set(on ? "processing" : "idle");
  }
}

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function abortPromise(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
}

export const voice = new VoiceEngineImpl();

// Any interaction with the page satisfies the browser's audio policy for the rest of the session.
if (typeof window !== "undefined") {
  const once = () => {
    voice.unlock().catch(() => undefined);
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  };
  window.addEventListener("pointerdown", once);
  window.addEventListener("keydown", once);
}
export type VoiceEngine = VoiceEngineImpl;
