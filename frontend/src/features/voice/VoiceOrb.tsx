import { motion, useReducedMotion } from "framer-motion";
import { Mic, MicOff, Volume2 } from "lucide-react";
import type { VoiceState } from "../../types";
import { useVoice } from "./useVoice";

const LABEL: Record<VoiceState, string> = {
  idle: "Standing by",
  speaking: "ASTRA speaking",
  listening: "Listening",
  transcribing: "Transcribing",
  processing: "Analyzing",
  confirming: "Confirming",
  error: "Didn't catch that",
};

// Stroke/fill colour of the orb, and the capsule behind its state label (label text is always ink).
const COLOR: Record<VoiceState, string> = {
  idle: "#5E6158",
  speaking: "#2BA0FF",
  listening: "#FF705D",
  transcribing: "#B57FE0",
  processing: "#B57FE0",
  confirming: "#2BA0FF",
  error: "#8A5A00",
};

const CHIP: Record<VoiceState, string> = {
  idle: "#FFFFFF",
  speaking: "#2BA0FF",
  listening: "#FF705D",
  transcribing: "#EBC1FF",
  processing: "#EBC1FF",
  confirming: "#2BA0FF",
  error: "#F5E211",
};

/** Animated assistant indicator. Size and glow follow real engine state and live mic level. */
export function VoiceOrb({ size = 120, override }: { size?: number; override?: VoiceState }) {
  const v = useVoice();
  const state = override ?? v.state;
  const reduce = useReducedMotion();
  const color = COLOR[state];
  const active = state !== "idle";
  const pulse = state === "listening" ? 1 + v.level * 0.35 : 1;
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite" aria-label={LABEL[state]}>
      <div className="relative" style={{ width: size, height: size }}>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full"
            style={{ border: `2px solid ${color}`, opacity: 0.25 }}
            animate={active && !reduce ? { scale: [1, 1.35 + i * 0.15], opacity: [0.35, 0] } : { scale: 1, opacity: 0.15 }}
            transition={{ duration: 2.4, repeat: active ? Infinity : 0, delay: i * 0.6, ease: "easeOut" }}
          />
        ))}
        <motion.div
          className="absolute inset-[14%] rounded-full"
          style={{
            background: active ? color : "#FFFFFF",
            border: `2px solid ${color}`,
          }}
          animate={{ scale: reduce ? 1 : pulse }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-ink">
          {state === "speaking" ? <Volume2 size={size / 4.5} /> : v.micOpen || state === "listening" ? <Mic size={size / 4.5} /> : <MicOff size={size / 5} />}
        </div>
        {state === "speaking" && !reduce && <Waveform color="#2C2E2A" size={size} />}
      </div>
      <span className="chip" style={{ background: CHIP[state] }}>
        {LABEL[state]}
      </span>
    </div>
  );
}

function Waveform({ color, size }: { color: string; size: number }) {
  return (
    <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-end gap-[3px]" style={{ height: size / 6 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: color }}
          animate={{ height: ["20%", "100%", "35%", "80%", "20%"] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
