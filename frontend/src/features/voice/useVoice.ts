import { useSyncExternalStore } from "react";
import { voice } from "./VoiceEngine";

let snapshot = { state: voice.state, level: voice.level, captions: voice.captions, micOpen: false, awaitingManual: false, ttsMode: voice.ttsMode, micAvailable: true, muted: false };

function getSnapshot() {
  const next = {
    state: voice.state,
    level: Math.round(voice.level * 20) / 20,
    captions: voice.captions,
    micOpen: voice.micOpen,
    awaitingManual: voice.awaitingManual,
    ttsMode: voice.ttsMode,
    micAvailable: voice.micAvailable,
    muted: voice.muted,
  };
  const same = (Object.keys(next) as (keyof typeof next)[]).every((k) => next[k] === snapshot[k]);
  if (!same) snapshot = next;
  return snapshot;
}

export function useVoice() {
  return useSyncExternalStore((fn) => voice.subscribe(fn), getSnapshot);
}
