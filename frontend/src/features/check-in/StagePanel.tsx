import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
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
    <ol className="flex items-center gap-1.5" aria-label="Check-in progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className={`h-1.5 rounded-full transition-all ${i < idx ? "w-6 bg-ok" : i === idx ? "w-10 bg-cyan-glow" : "w-6 bg-white/10"}`}
            aria-current={i === idx ? "step" : undefined}
            title={s.label}
          />
        </li>
      ))}
      <span className="label ml-2">{STEPS[Math.max(0, idx)]?.label}</span>
    </ol>
  );
}

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
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm">
                  {rs.map((r) => (
                    <span key={r.metric}>
                      <span className="text-ink-faint">{r.metric.replace(/_/g, " ")} </span>
                      {r.value} {r.unit}
                    </span>
                  ))}
                </div>
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
  if (s === "VOICE_QUESTIONNAIRE") {
    return (
      <div className="flex flex-col items-center gap-6 py-4 text-center">
        <span className="label">Question {flow.questionCount + 1}</span>
        <h2 className="text-2xl font-medium leading-snug md:text-3xl">{flow.question?.text ?? "…"}</h2>
        {flow.question?.hint && <p className="text-sm text-ink-muted">{flow.question.hint}</p>}
        <VoiceOrb size={110} />
        <ManualAnswer question={flow.question} />
      </div>
    );
  }
  if (s === "PROCESSING") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
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
    <div className="flex flex-col items-center gap-4 py-8">
      <VoiceOrb size={100} />
      <Captions max={2} />
      <ManualAnswer mode="confirm" />
    </div>
  );
}
