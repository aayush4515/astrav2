import { motion } from "framer-motion";
import { Check, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { useMemo } from "react";
import type { Camera } from "../../hooks/useCamera";
import { BOOTH_DEVICES } from "../booth/devices";
import { StatusMark } from "../dashboard/StatusMark";
import { CameraView } from "../facial-analysis/CameraView";
import { Captions } from "../voice/Captions";
import { VoiceOrb } from "../voice/VoiceOrb";
import { ManualAnswer } from "./ManualAnswer";
import { SummaryView } from "./SummaryView";
import { STEPS, type FlowState } from "./useCheckinFlow";

export function ProgressSteps({ stage }: { stage: FlowState["stage"] }) {
  const idx = STEPS.findIndex((s) => s.stages.includes(stage));
  return (
    <ol className="flex min-w-0 flex-1 items-center gap-1.5" aria-label="Check-in progress">
      {STEPS.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "todo";
        return (
          <li
            key={s.key}
            className={`relative flex min-w-0 items-center overflow-hidden rounded-full bg-sheet sm:h-10 ${state === "current" ? "h-9 min-w-[7.5rem] flex-[3]" : "h-3 flex-1"}`}
            aria-current={state === "current" ? "step" : undefined}
            aria-label={`${s.label}${state === "done" ? ", done" : ""}`}
            title={s.label}
          >
            <motion.span
              className={`absolute inset-y-0 left-0 rounded-full ${state === "done" ? "bg-cap-lilac" : "bg-cap-coral"}`}
              initial={false}
              animate={{ width: state === "todo" ? "0%" : "100%" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <span className={`relative w-full items-center justify-center gap-1 truncate px-2 text-[13px] ${state === "current" ? "flex" : "hidden sm:flex"} ${state === "todo" ? "text-ink-soft" : "text-ink"}`}>
              {state === "done" && <Check size={15} className="shrink-0" />}
              {state === "current" && <span className="h-2 w-2 shrink-0 rounded-full bg-ink" />}
              {state === "current" ? <span className="truncate">{s.label}</span> : state === "todo" && <span>{i + 1}</span>}
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
  pending: <CircleDashed size={18} className="text-ink-soft" />,
  active: <Loader2 size={18} className="animate-spin text-ink" />,
  done: <CheckCircle2 size={18} className="text-ink" />,
  fault: <XCircle size={18} className="text-st-urgent" />,
};

/** Only the information needed for the current step. */
export function StagePanel({ flow, camera, onDetails }: { flow: FlowState; camera: Camera; onDetails: () => void }) {
  const s = flow.stage;
  if (s === "FACIAL_SCAN") {
    const f = flow.facial;
    return (
      <div className="flex flex-col gap-3">
        <CameraView camera={camera} landmarks={f?.landmarks ?? []} scanning className="aspect-[4/3] w-full" label="Facial geometry scan" />
        <div className="flex items-center justify-between gap-3 text-xl">
          <span className="flex items-center gap-2">
            {f?.accepted && <CheckCircle2 size={20} />}
            {f?.accepted ? "Good capture" : f?.lastGuidance ?? "Hold still, face the camera"}
          </span>
          <span className="shrink-0 tabular-nums text-ink-soft">
            {f?.frames ?? 0}/{f?.needed ?? 8} frames
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-sheet">
          <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${((f?.frames ?? 0) / (f?.needed ?? 8)) * 100}%` }} />
        </div>
      </div>
    );
  }
  if (s === "SENSOR_COLLECTION" || s === "VOC_SCAN" || s === "CHECKIN_STARTED") {
    const devices = Object.entries(flow.deviceStatus);
    const activeId = devices.find(([, st]) => st === "active")?.[0];
    const latest = activeId ? flow.readings.filter((r) => r.device === activeId).at(-1) : undefined;
    return (
      <div className="flex flex-col gap-2">
        <div className="mb-2 px-1" aria-live="polite">
          {latest ? (
            <>
              <p className="text-[17px]">{READING_LABEL[latest.metric] ?? latest.metric}</p>
              <p className="display mt-1 text-[clamp(3.5rem,6vw,6rem)] tabular-nums">
                {latest.value}
                <span className="ml-2 text-[clamp(1.25rem,1.8vw,1.75rem)] tracking-normal">{latest.unit}</span>
              </p>
            </>
          ) : (
            <p className="display text-[clamp(2.5rem,4.4vw,4.25rem)]">
              {s === "VOC_SCAN" ? BOOTH_DEVICES.e_nose.label : activeId ? BOOTH_DEVICES[activeId as keyof typeof BOOTH_DEVICES]?.label : "Preparing sensors"}
            </p>
          )}
          {activeId && latest && <p className="mt-2 text-[17px]">{BOOTH_DEVICES[activeId as keyof typeof BOOTH_DEVICES]?.label} · measuring now</p>}
        </div>
        {devices.map(([d, st]) => {
          const dev = BOOTH_DEVICES[d as keyof typeof BOOTH_DEVICES];
          const rs = flow.readings.filter((r) => r.device === d);
          return (
            <div key={d} className={`rounded-[22px] px-5 py-3.5 transition-colors ${st === "active" ? "bg-cap-yellow" : "bg-sheet"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[17px]">
                  {STATUS_ICON[st]} {dev?.label ?? d}
                </span>
                <span className="chip bg-cap-lilac">simulated</span>
              </div>
              {dev && rs.length === 0 && <p className="mt-1 pl-[26px] text-[13px] text-ink-soft">{dev.measures}</p>}
              {rs.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  {rs.map((r) => (
                    <div key={r.metric} className="leading-tight">
                      <div className="text-[13px] text-ink-soft">{READING_LABEL[r.metric] ?? r.metric}</div>
                      <div className="text-[28px] tabular-nums leading-none tracking-[-0.04em] text-ink">
                        {r.value}
                        <span className="ml-1 text-[15px] tracking-normal text-ink-soft">{r.unit}</span>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          );
        })}
        <div className={`rounded-[22px] px-5 py-3.5 transition-colors ${s === "VOC_SCAN" ? "bg-cap-yellow" : "bg-sheet"}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[17px]">
              {s === "VOC_SCAN" ? STATUS_ICON.active : flow.voc ? STATUS_ICON.done : STATUS_ICON.pending} Electronic nose (VOC)
            </span>
            <span className="chip bg-cap-coral">experimental</span>
          </div>
          {!flow.voc && <p className="mt-1 pl-[26px] text-[13px] text-ink-soft">{BOOTH_DEVICES.e_nose.measures} · 16 sensor channels</p>}
          {flow.voc && (
            <div className="mt-3 flex h-12 items-end gap-1">
              {flow.voc.channels.map((c, i) => (
                <motion.span key={i} initial={{ height: 0 }} animate={{ height: `${Math.min(100, c * 80)}%` }} className="w-full rounded-t-full" style={{ background: Math.abs(flow.voc!.analysis.channel_z?.[i] ?? 0) >= 3.5 ? "#8A5A00" : "#2C2E2A" }} />
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
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="display text-[clamp(2rem,3.4vw,3.25rem)]">Weekly blood assessment</h2>
          <span className="chip bg-cap-lilac">simulated analyzer</span>
        </div>
        {b.phase === "offer" && <p className="text-2xl">Would you like to complete it now?</p>}
        {(b.phase === "collect" || b.phase === "ready") && (
          <ol className="space-y-1.5">
            {b.steps.map((st, i) => (
              <li key={i} className={`flex gap-3 rounded-[20px] px-4 py-2.5 text-[17px] ${i === b.stepIndex && b.phase === "collect" ? "bg-cap-yellow text-ink" : i < b.stepIndex || b.phase === "ready" ? "text-ink-soft" : "bg-sheet text-ink"}`}>
                <span className="w-5 shrink-0">{i + 1}</span> {st}
              </li>
            ))}
          </ol>
        )}
        {b.phase === "ready" && <p className="w-fit rounded-full bg-cap-yellow px-5 py-2.5 text-lg">Say “sample ready” when the cartridge is inserted.</p>}
        {b.phase === "analyzing" && (
          <p className="flex items-center gap-2 text-2xl">
            <Loader2 className="animate-spin" /> Analyzing sample…
          </p>
        )}
        {b.phase === "done" && b.result && (
          <div className="sheet overflow-x-auto px-5 py-3">
            <table className="w-full text-[15px] tabular-nums">
              <tbody>
                {Object.values(b.result.results).map((r) => {
                  const out = (r.ref_low != null && r.value < r.ref_low) || (r.ref_high != null && r.value > r.ref_high);
                  return (
                    <tr key={r.label} className="border-t border-rule first:border-t-0">
                      <td className="py-2">{r.label}</td>
                      <td className={out ? "text-st-watch" : undefined}>
                        <span className="inline-flex items-center gap-1.5">
                          {out && <StatusMark level="watch" size={13} />}
                          {r.value} {r.unit}
                        </span>
                      </td>
                      <td className="text-ink-soft">
                        {r.ref_low}–{r.ref_high}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        <p className="display max-w-[16ch] text-[clamp(2rem,3.4vw,3.25rem)]">Comparing today with your own baseline…</p>
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
    return <p className="flex items-center gap-2 rounded-[22px] bg-sheet px-5 py-4 text-xl text-st-urgent"><StatusMark level="urgent" size={18} /> Check-in failed: {flow.error}</p>;
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
      <VoiceOrb size={110} />
      <h2 className="display text-[clamp(2.5rem,4.6vw,4.5rem)]">{flow.stage === "IDENTITY_CONFIRMED" ? "Identity confirmed" : "Starting your assessment"}</h2>
      <p className="max-w-[30ch] text-xl leading-snug text-ink">Measurements begin automatically. Say “cancel” in the next few seconds to stop.</p>
      <ManualAnswer mode="greeting" />
    </div>
  );
}

function QuestionView({ flow }: { flow: FlowState }) {
  // Only show the answer transcribed for the current question, not the previous one.
  const since = useMemo(() => Date.now(), [flow.question?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 py-6 text-center">
      <motion.h2
        key={flow.question?.id ?? "intro"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="display max-w-[18ch] text-[clamp(2.25rem,3.8vw,3.75rem)]"
      >
        {flow.question?.text ?? "A few quick questions — answer in your own words."}
      </motion.h2>
      {flow.question?.hint && <p className="-mt-3 text-lg text-ink-soft">{flow.question.hint}</p>}
      <span className="chip bg-cap-coral px-4 py-1.5 text-[15px]">{flow.question ? `Question ${flow.questionCount + 1}` : "Health questions"}</span>
      <VoiceOrb size={120} />
      <div className="min-h-[2rem] w-full max-w-xl">
        <Captions max={1} only="astronaut" since={since} />
      </div>
      <ManualAnswer question={flow.question} />
    </div>
  );
}
