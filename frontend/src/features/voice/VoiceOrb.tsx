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

const COLOR: Record<VoiceState, string> = {
  idle: "#5b6785",
  speaking: "#5ee7ff",
  listening: "#4ade80",
  transcribing: "#a78bfa",
  processing: "#a78bfa",
  confirming: "#5ee7ff",
  error: "#fbbf24",
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
            style={{ border: `1px solid ${color}`, opacity: 0.25 }}
            animate={active && !reduce ? { scale: [1, 1.35 + i * 0.15], opacity: [0.35, 0] } : { scale: 1, opacity: 0.15 }}
            transition={{ duration: 2.4, repeat: active ? Infinity : 0, delay: i * 0.6, ease: "easeOut" }}
          />
        ))}
        <motion.div
          className="absolute inset-[14%] rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${color}55, ${color}18 55%, transparent 72%)`,
            boxShadow: active ? `0 0 ${size / 3}px ${color}55, inset 0 0 ${size / 6}px ${color}40` : "none",
            border: `1px solid ${color}66`,
          }}
          animate={{ scale: reduce ? 1 : pulse }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
        <div className="absolute inset-0 flex items-center justify-center" style={{ color }}>
          {state === "speaking" ? <Volume2 size={size / 4.5} /> : v.micOpen || state === "listening" ? <Mic size={size / 4.5} /> : <MicOff size={size / 5} />}
        </div>
        {state === "speaking" && !reduce && <Waveform color={color} size={size} />}
      </div>
      <span className="label" style={{ color }}>
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
