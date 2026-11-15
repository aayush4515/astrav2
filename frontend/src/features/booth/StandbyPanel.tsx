import { AnimatePresence, motion } from "framer-motion";
import { Camera as CameraIcon, Mic, Power, Radiation, RadioTower, UserPlus, Users, Wind, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import type { Camera } from "../../hooks/useCamera";
import { useHealth } from "../../hooks/useHealth";
import type { RecognitionResult } from "../../types";
import { CameraView } from "../facial-analysis/CameraView";
import { StatusMark } from "../dashboard/StatusMark";

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
    <div className="relative flex flex-1 flex-col justify-between gap-10">
      <div className="flex items-center justify-between gap-4">
        <span className="chip bg-sheet py-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${active ? "animate-breathe bg-ink" : "border-2 border-ink-faint"}`} />
          {active ? "Health booth · stand-by" : "Health booth · inactive"}
        </span>
        <Link to="/enroll" className="chip bg-cap-lilac py-1.5 hover:bg-[#E0AEF8]">
          <UserPlus size={15} /> Enrollment
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
            className="display text-[clamp(3rem,6.2vw,6.75rem)]"
          >
            {active ? headline.text : "Your daily health check\u2011in, hands\u2011free."}
          </motion.h1>
        </AnimatePresence>

        {active ? (
          <>
            <div className="h-3 w-64 overflow-hidden rounded-full bg-sheet" aria-hidden={progress === 0}>
              <motion.div className="h-full rounded-full bg-cap-blue" animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
            </div>
            <p className="max-w-[34ch] text-xl leading-snug text-ink">
              {recognition?.status === "unknown" ? (
                <>
                  This face isn't enrolled.{" "}
                  <Link to="/enroll" className="underline">
                    One-time enrollment
                  </Link>
                </>
              ) : recognition?.status === "matching" ? (
                "Hold still for a moment while ASTRA confirms it's you."
              ) : (
                "Step in front of the camera. ASTRA will recognize you, greet you by name and guide the check-in by voice."
              )}
            </p>
            {engineError && <p className="w-fit rounded-2xl bg-sheet px-4 py-2 text-[15px] text-st-watch">Face engine unavailable: {engineError}</p>}
            {needsVoiceGesture && (
              <button className="btn-primary w-fit" onClick={onEnableVoice}>
                <Mic size={17} /> Enable ASTRA's voice
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="max-w-[34ch] text-xl leading-snug text-ink">
              Activate stand-by once to allow the camera and microphone. After that, enrolled astronauts are recognized automatically — no login, no buttons.
            </p>
            <button className="btn-primary w-fit px-7 py-3.5 text-lg" onClick={onActivate}>
              <Power size={20} /> Activate booth
            </button>
            {camera.error && <p className="w-fit rounded-2xl bg-sheet px-4 py-2 text-[15px] text-st-watch">{camera.error}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {active && (
          <div className="flex items-end gap-4">
            <CameraView camera={camera} boxes={boxes} boxColor={headline.color} className="aspect-[4/3] w-44 shrink-0" />
            <div className="flex flex-col gap-2 text-[13px] text-ink">
              <span className="flex items-center gap-1.5">
                <CameraIcon size={14} /> Processed locally · no images stored
              </span>
              <button className="w-fit underline decoration-2 underline-offset-4 hover:text-ink-soft" onClick={onDeactivate}>
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
    { icon: Users, label: "Crew enrolled", value: `${health.crew?.face_enrolled ?? 0} / ${health.crew?.total ?? 0}`, tone: "bg-cap-yellow" },
    link
      ? { icon: link.link_up ? RadioTower : WifiOff, label: "Earth link", value: link.link_up ? `${link.delay_s}s delay` : "offline · queuing", warn: !link.link_up, tone: "bg-cap-blue" }
      : null,
    co2 ? { icon: Wind, label: "Cabin CO₂", value: `${Math.round(co2.value)} ppm`, warn: co2.value > 4000, tone: "bg-cap-lilac" } : null,
    rad ? { icon: Radiation, label: "Dose rate", value: `${rad.value} mSv/d`, tone: "bg-sheet" } : null,
  ].filter(Boolean) as { icon: typeof Users; label: string; value: string; warn?: boolean; tone: string }[];
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Mission status">
      {items.map(({ icon: Icon, label, value, warn, tone }) => (
        <li key={label} className={`flex items-center gap-2 rounded-full py-2 pl-3 pr-4 text-[15px] text-ink ${warn ? "bg-sheet" : tone}`}>
          {warn ? <StatusMark level="watch" size={15} /> : <Icon size={16} />}
          <span>{label}</span>
          <span className={warn ? "text-st-watch" : "text-ink"}>{value}</span>
        </li>
      ))}
    </ul>
  );
}
