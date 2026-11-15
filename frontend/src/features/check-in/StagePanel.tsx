import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { useMemo } from "react";
import type { Camera } from "../../hooks/useCamera";
import { BOOTH_DEVICES } from "../booth/devices";
import { CameraView } from "../facial-analysis/CameraView";
import { Captions } from "../voice/Captions";
import { VoiceOrb } from "../voice/VoiceOrb";
import { ManualAnswer } from "./ManualAnswer";
import { SummaryView } from "./SummaryView";
import { STEPS, type FlowState } from "./useCheckinFlow";

export function ProgressSteps({ stage }: { stage: FlowState["stage"] }) {
  const idx = STEPS.findIndex((s) => s.stages.includes(stage));
  return (
    <ol className="flex flex-1 items-center gap-2" aria-label="Check-in progress">
      {STEPS.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "todo";
        return (
          <li key={s.key} className="flex flex-1 flex-col gap-1.5" aria-current={state === "current" ? "step" : undefined}>
            <span className="relative h-1 overflow-hidden rounded-full bg-white/10">
              <motion.span
                className={`absolute inset-y-0 left-0 rounded-full ${state === "done" ? "bg-ok" : "bg-cyan-glow"}`}
                initial={false}
                animate={{ width: state === "todo" ? "0%" : "100%" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </span>
            <span className={`hidden text-[10px] font-medium uppercase tracking-[0.14em] sm:block ${state === "current" ? "text-cyan-soft" : state === "done" ? "text-ink-muted" : "text-ink-faint"}`}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const READING_LABEL: Record<string, string> = {
  heart_rate: "Heart rate",
  resting_heart_rate: "Resting HR",
  hrv_rmssd: "HRV",
  systolic_bp: "Systolic",
  diastolic_bp: "Diastolic",
  spo2: "SpO₂",
  respiratory_rate: "Breathing",
  body_temperature: "Temperature",
  body_mass: "Mass",
  sleep_duration: "Sleep",
  sleep_efficiency: "Sleep efficiency",
  exercise_minutes: "Exercise",
};

const STATUS_ICON = {
  pending: <CircleDashed size={16} className="text-ink-faint" />,
  active: <Loader2 size={16} className="animate-spin text-cyan-glow" />,
  done: <CheckCircle2 size={16} className="text-ok" />,
  fault: <XCircle size={16} className="text-alert" />,
};

/** Only the information needed for the current step. */
export function StagePanel({ flow, camera, onDetails }: { flow: FlowState; camera: Camera; onDetails: () => void }) {
  const s = flow.stage;
  if (s === "FACIAL_SCAN") {
    const f = flow.facial;
    return (
      <div className="flex flex-col gap-3">
        <CameraView camera={camera} landmarks={f?.landmarks ?? []} scanning className="aspect-[4/3] w-full" label="Facial geometry scan" />
        <div className="flex items-center justify-between text-sm">
          <span className={f?.accepted ? "text-ok" : "text-caution"}>{f?.accepted ? "Good capture" : f?.lastGuidance ?? "Hold still, face the camera"}</span>
          <span className="font-mono text-ink-muted">
            {f?.frames ?? 0}/{f?.needed ?? 8} frames
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-cyan-glow transition-all" style={{ width: `${((f?.frames ?? 0) / (f?.needed ?? 8)) * 100}%` }} />
        </div>
      </div>
    );
  }
  if (s === "SENSOR_COLLECTION" || s === "VOC_SCAN" || s === "CHECKIN_STARTED") {
    const devices = Object.entries(flow.deviceStatus);
    return (
      <div className="flex flex-col gap-2">
        {devices.map(([d, st]) => {
          const dev = BOOTH_DEVICES[d as keyof typeof BOOTH_DEVICES];
          const rs = flow.readings.filter((r) => r.device === d);
          return (
            <div key={d} className={`rounded-xl border px-4 py-3 transition ${st === "active" ? "border-cyan-glow/50 bg-cyan-glow/5" : "border-line"}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  {STATUS_ICON[st]} {dev?.label ?? d}
                </span>
                <span className="chip bg-white/5 text-ink-faint">simulated</span>
              </div>
              {rs.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {rs.map((r) => (
                    <div key={r.metric} className="leading-tight">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">{READING_LABEL[r.metric] ?? r.metric}</div>
                      <div className="font-mono text-base text-ink">
                        {r.value}
                        <span className="ml-1 text-xs text-ink-muted">{r.unit}</span>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          );
        })}
        <div className={`rounded-xl border px-4 py-3 ${s === "VOC_SCAN" ? "border-caution/50 bg-caution/5" : "border-line"}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium">
              {s === "VOC_SCAN" ? STATUS_ICON.active : flow.voc ? STATUS_ICON.done : STATUS_ICON.pending} Electronic nose (VOC)
            </span>
            <span className="chip bg-caution/10 text-caution">experimental</span>
          </div>
          {flow.voc && (
            <div className="mt-2 flex h-10 items-end gap-0.5">
              {flow.voc.channels.map((c, i) => (
                <motion.span key={i} initial={{ height: 0 }} animate={{ height: `${Math.min(100, c * 80)}%` }} className="w-full rounded-sm" style={{ background: Math.abs(flow.voc!.analysis.channel_z?.[i] ?? 0) >= 3.5 ? "#fbbf24" : "#facc1566" }} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (s === "BLOOD_TEST" && flow.blood) {
    const b = flow.blood;
    return (
      <div className="flex flex-col gap-3">
        <div className="label text-alert">Weekly blood assessment · simulated analyzer</div>
        {b.phase === "offer" && <p className="text-lg">Would you like to complete it now?</p>}
        {(b.phase === "collect" || b.phase === "ready") && (
          <ol className="space-y-2">
            {b.steps.map((st, i) => (
              <li key={i} className={`flex gap-3 rounded-xl px-3 py-2 ${i === b.stepIndex && b.phase === "collect" ? "bg-white/10 text-ink" : i < b.stepIndex || b.phase === "ready" ? "text-ink-faint" : "text-ink-muted"}`}>
                <span className="font-mono">{i + 1}</span> {st}
              </li>
            ))}
          </ol>
        )}
        {b.phase === "ready" && <p className="text-cyan-soft">Say “sample ready” when the cartridge is inserted.</p>}
        {b.phase === "analyzing" && (
          <p className="flex items-center gap-2 text-lg">
            <Loader2 className="animate-spin" /> Analyzing sample…
          </p>
        )}
        {b.phase === "done" && b.result && (
          <table className="w-full text-sm">
            <tbody>
              {Object.values(b.result.results).map((r) => {
                const out = (r.ref_low != null && r.value < r.ref_low) || (r.ref_high != null && r.value > r.ref_high);
                return (
                  <tr key={r.label} className="border-t border-line">
                    <td className="py-1.5">{r.label}</td>
                    <td className="font-mono" style={{ color: out ? "#fbbf24" : undefined }}>
                      {r.value} {r.unit}
                    </td>
                    <td className="font-mono text-ink-faint">
                      {r.ref_low}–{r.ref_high}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <ManualAnswer mode={b.phase === "offer" ? "confirm" : "ready"} />
      </div>
    );
  }
  if (s === "VOICE_QUESTIONNAIRE") return <QuestionView flow={flow} />;
  if (s === "PROCESSING") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <VoiceOrb size={110} override="processing" />
        <p className="text-lg">Comparing today's data with your personal baseline…</p>
      </div>
    );
  }
  if ((s === "RESULTS_READY" || s === "VOICE_SUMMARY" || s === "COMPLETED") && flow.result) {
    return (
      <div className="flex flex-col gap-4">
        <SummaryView result={flow.result} onDetails={onDetails} />
        {s === "VOICE_SUMMARY" && <ManualAnswer mode="command" />}
      </div>
    );
  }
  if (s === "FAILED") {
    return <p className="text-alert">Check-in failed: {flow.error}</p>;
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
      <VoiceOrb size={110} />
      <h2 className="text-2xl font-medium md:text-3xl">{flow.stage === "IDENTITY_CONFIRMED" ? "Identity confirmed" : "Starting your assessment"}</h2>
      <p className="max-w-sm text-ink-muted">Measurements begin automatically. Say “cancel” in the next few seconds to stop.</p>
      <ManualAnswer mode="greeting" />
    </div>
  );
}

function QuestionView({ flow }: { flow: FlowState }) {
  // Only show the answer transcribed for the current question, not the previous one.
  const since = useMemo(() => Date.now(), [flow.question?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 py-6 text-center">
      <span className="label">{flow.question ? `Question ${flow.questionCount + 1}` : "Health questions"}</span>
      <motion.h2
        key={flow.question?.id ?? "intro"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl text-2xl font-medium leading-snug md:text-[2rem]"
      >
        {flow.question?.text ?? "A few quick questions — answer in your own words."}
      </motion.h2>
      {flow.question?.hint && <p className="-mt-3 text-sm text-ink-muted">{flow.question.hint}</p>}
      <VoiceOrb size={120} />
      <div className="min-h-[2rem] w-full max-w-xl">
        <Captions max={1} only="astronaut" since={since} />
      </div>
      <ManualAnswer question={flow.question} />
    </div>
  );
}
