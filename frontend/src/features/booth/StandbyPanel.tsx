import { AnimatePresence, motion } from "framer-motion";
import { Camera as CameraIcon, Mic, Power, Radiation, RadioTower, UserPlus, Users, Wind, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import type { Camera } from "../../hooks/useCamera";
import { useHealth } from "../../hooks/useHealth";
import type { RecognitionResult } from "../../types";
import { CameraView } from "../facial-analysis/CameraView";

interface Props {
  camera: Camera;
  active: boolean;
  headline: { text: string; color: string };
  recognition: RecognitionResult | null;
  engineError: string | null;
  needsVoiceGesture: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onEnableVoice: () => void;
}

/** Calm stand-by column: one prompt, live recognition feedback, and a quiet mission strip. */
export function StandbyPanel({ camera, active, headline, recognition, engineError, needsVoiceGesture, onActivate, onDeactivate, onEnableVoice }: Props) {
  const { health } = useHealth();
  const progress = recognition?.status === "matching" ? Math.min(1, (recognition.progress ?? 0) / 3) : recognition?.status === "confirmed" ? 1 : 0;
  const boxes = (recognition?.faces ?? []).map((f) => f.bbox);
  return (
    <div className="flex flex-1 flex-col justify-between gap-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${active ? "animate-breathe bg-ok" : "bg-ink-faint"}`} />
          <span className="label">{active ? "Health booth · stand-by" : "Health booth · inactive"}</span>
        </div>
        <Link to="/enroll" className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink">
          <UserPlus size={13} /> Enrollment
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <AnimatePresence mode="wait">
          <motion.h1
            key={active ? headline.text : "inactive"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-4xl font-light leading-[1.1] tracking-tight md:text-5xl xl:text-6xl"
            style={{ color: active ? headline.color : undefined }}
          >
            {active ? headline.text : "Your daily health check-in, hands\u2011free."}
          </motion.h1>
        </AnimatePresence>

        {active ? (
          <>
            <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10" aria-hidden={progress === 0}>
              <motion.div className="h-full rounded-full bg-cyan-glow" animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
            </div>
            <p className="max-w-md text-base text-ink-muted">
              {recognition?.status === "unknown" ? (
                <>
                  This face isn't enrolled.{" "}
                  <Link to="/enroll" className="text-cyan-soft underline underline-offset-4">
                    One-time enrollment
                  </Link>
                </>
              ) : recognition?.status === "matching" ? (
                "Hold still for a moment while ASTRA confirms it's you."
              ) : (
                "Step in front of the camera. ASTRA will recognize you, greet you by name and guide the check-in by voice."
              )}
            </p>
            {engineError && <p className="text-sm text-caution">Face engine unavailable: {engineError}</p>}
            {needsVoiceGesture && (
              <button className="btn-ghost w-fit" onClick={onEnableVoice}>
                <Mic size={15} /> Enable ASTRA's voice
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="max-w-md text-base text-ink-muted">
              Activate stand-by once to allow the camera and microphone. After that, enrolled astronauts are recognized automatically — no login, no buttons.
            </p>
            <button className="btn-primary w-fit px-6 py-3 text-base" onClick={onActivate}>
              <Power size={18} /> Activate booth
            </button>
            {camera.error && <p className="text-sm text-caution">{camera.error}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {active && (
          <div className="flex items-end gap-4">
            <CameraView camera={camera} boxes={boxes} boxColor={headline.color} className="aspect-[4/3] w-44 shrink-0" />
            <div className="flex flex-col gap-1.5 text-[11px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <CameraIcon size={12} /> Processed locally · no images stored
              </span>
              <button className="w-fit hover:text-ink" onClick={onDeactivate}>
                Deactivate stand-by
              </button>
            </div>
          </div>
        )}
        <MissionStrip health={health} />
      </div>
    </div>
  );
}

function MissionStrip({ health }: { health: ReturnType<typeof useHealth>["health"] }) {
  if (!health) return null;
  const co2 = health.environment?.cabin_co2;
  const rad = health.environment?.radiation_dose_rate;
  const link = health.comm_link;
  const items = [
    { icon: Users, label: "Crew enrolled", value: `${health.crew?.face_enrolled ?? 0} / ${health.crew?.total ?? 0}` },
    link
      ? { icon: link.link_up ? RadioTower : WifiOff, label: "Earth link", value: link.link_up ? `${link.delay_s}s delay` : "offline · queuing", warn: !link.link_up }
      : null,
    co2 ? { icon: Wind, label: "Cabin CO₂", value: `${Math.round(co2.value)} ppm`, warn: co2.value > 4000 } : null,
    rad ? { icon: Radiation, label: "Dose rate", value: `${rad.value} mSv/d` } : null,
  ].filter(Boolean) as { icon: typeof Users; label: string; value: string; warn?: boolean }[];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-4">
      {items.map(({ icon: Icon, label, value, warn }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon size={14} className={warn ? "text-caution" : "text-ink-faint"} />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-faint">{label}</div>
            <div className={`font-mono text-xs ${warn ? "text-caution" : "text-ink-muted"}`}>{value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
