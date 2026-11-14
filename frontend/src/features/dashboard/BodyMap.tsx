import type { KeyboardEvent } from "react";
import type { MetricState } from "../../types";
import { METRIC_STATUS_COLOR } from "./format";

export const REGIONS: { id: string; label: string; description: string }[] = [
  { id: "head_eyes", label: "Head & eyes", description: "Facial geometry, vision-related observations. Fluid shifts toward the head in microgravity." },
  { id: "cardiovascular", label: "Cardiovascular", description: "Heart rate, HRV and blood pressure. Spaceflight alters blood volume and vascular regulation." },
  { id: "respiratory", label: "Respiratory", description: "Oxygen saturation and breathing rate, interpreted with cabin CO₂." },
  { id: "musculoskeletal", label: "Musculoskeletal", description: "Body mass and exercise adherence — the main countermeasure against bone and muscle loss." },
  { id: "wellbeing", label: "Sleep & well-being", description: "Sleep, mood and self-reported health. Isolation and confinement are one of the five hazards." },
  { id: "general", label: "General", description: "Body temperature and overall condition." },
];

const RANK: Record<string, number> = { normal: 0, no_baseline: 0, context_excluded: 0, watch: 1, notable: 2 };

export function regionStatus(metrics: Record<string, MetricState>, region: string, extraFlag = false): string {
  const ms = Object.values(metrics).filter((m) => m.region === region);
  let worst = ms.reduce((w, m) => (RANK[m.status] > RANK[w] ? m.status : w), ms.length ? "normal" : "no_baseline");
  if (extraFlag && RANK[worst] < 1) worst = "watch";
  return worst;
}

interface Props {
  metrics: Record<string, MetricState>;
  selected: string | null;
  onSelect: (region: string) => void;
  facialFlag?: boolean;
}

/** Clickable stylized body. Colours reflect the worst status of the monitored indicators in each region. */
export function BodyMap({ metrics, selected, onSelect, facialFlag }: Props) {
  const color = (r: string) => METRIC_STATUS_COLOR[regionStatus(metrics, r, r === "head_eyes" && facialFlag)];
  const part = (r: string) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": REGIONS.find((x) => x.id === r)?.label,
    onClick: () => onSelect(r),
    onKeyDown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && onSelect(r),
    style: { cursor: "pointer", outline: "none" },
    stroke: selected === r ? "#ffffff" : color(r),
    strokeWidth: selected === r ? 2.5 : 1.5,
    fill: `${color(r)}${selected === r ? "40" : "1f"}`,
  });
  return (
    <svg viewBox="0 0 200 400" className="h-full max-h-[380px] w-auto" aria-label="Interactive body map">
      <defs>
        <radialGradient id="aura" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={color("wellbeing")} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color("wellbeing")} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="190" rx="98" ry="190" {...part("wellbeing")} fill="url(#aura)" strokeOpacity={selected === "wellbeing" ? 0.7 : 0.15} strokeDasharray="4 6" />
      {/* head */}
      <circle cx="100" cy="42" r="26" {...part("head_eyes")} />
      <circle cx="91" cy="40" r="3" fill={color("head_eyes")} />
      <circle cx="109" cy="40" r="3" fill={color("head_eyes")} />
      {/* torso: lungs + heart */}
      <path d="M70 78 h60 l12 30 v70 q0 14 -14 18 h-56 q-14 -4 -14 -18 v-70 z" fill="rgba(120,170,255,0.04)" stroke="rgba(120,170,255,0.2)" />
      <path d="M76 100 q-6 30 0 62 q16 6 20 -4 v-56 q-8 -10 -20 -2z" {...part("respiratory")} />
      <path d="M124 100 q6 30 0 62 q-16 6 -20 -4 v-56 q8 -10 20 -2z" {...part("respiratory")} />
      <path d="M100 128 q8 -12 16 -2 q6 10 -16 26 q-22 -16 -16 -26 q8 -10 16 2z" {...part("cardiovascular")} />
      {/* abdomen / general */}
      <rect x="78" y="182" width="44" height="34" rx="10" {...part("general")} />
      {/* limbs */}
      <path d="M58 84 l-16 92 l12 4 l18 -86z" {...part("musculoskeletal")} />
      <path d="M142 84 l16 92 l-12 4 l-18 -86z" {...part("musculoskeletal")} />
      <path d="M80 222 l-6 150 h18 l10 -150z" {...part("musculoskeletal")} />
      <path d="M120 222 l6 150 h-18 l-10 -150z" {...part("musculoskeletal")} />
    </svg>
  );
}
