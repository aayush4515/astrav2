import { motion } from "framer-motion";
import { CalendarClock, ChevronDown, Satellite } from "lucide-react";
import type { AnalysisResult } from "../../types";
import { SEVERITY_COLOR, STATUS_COLOR } from "../dashboard/format";
import { METRIC_MARK, SEVERITY_MARK, StatusMark } from "../dashboard/StatusMark";


const GLANCE: { key: string; label: string }[] = [
  { key: "heart_rate", label: "Heart rate" },
  { key: "systolic_bp", label: "Blood pressure" },
  { key: "spo2", label: "SpO₂" },
  { key: "body_temperature", label: "Temp" },
  { key: "sleep_duration", label: "Sleep" },
];

/** Glanceable result: one status, at most three observations, one next action. */
export function SummaryView({ result, onDetails }: { result: AnalysisResult; onDetails: () => void }) {
  const color = STATUS_COLOR[result.status_level];
  const obs = result.observations.filter((o) => o.severity !== "info").slice(0, 3);
  const notes = obs.length ? obs : result.observations.slice(0, 2);
  const next = result.guidance[0];
  const metrics = result.metrics ?? {};
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-[24px] px-5 py-4 text-white" style={{ background: color }}>
        <StatusMark level={result.status_level} size={36} color="#FFFFFF" />
        <div className="min-w-0">
          <h2 className="text-[clamp(1.75rem,2.8vw,2.5rem)] leading-[1.02] tracking-[-0.04em]">{result.status}</h2>
          <p className="mt-1 text-[15px]">Assessment result · compared with your own baseline</p>
        </div>
      </div>

      {next && (
        <div className="rounded-[24px] bg-cap-yellow px-5 py-4">
          <p className="text-[22px] leading-tight tracking-[-0.03em]">{next.title}</p>
          <p className="mt-1 text-[15px] leading-snug">Recommended next action · {next.steps[0]}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
        {GLANCE.filter((g) => metrics[g.key]).map(({ key, label }) => {
          const m = metrics[key];
          const value = key === "systolic_bp" && metrics.diastolic_bp ? `${m.value}/${metrics.diastolic_bp.value}` : m.value;
          return (
            <div key={key} className="rounded-[20px] bg-sheet px-4 py-3">
              <div className="flex items-center gap-1.5 text-[15px] text-ink-soft">
                <StatusMark level={METRIC_MARK[m.status] ?? "none"} size={13} />
                {label}
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1 text-[24px] tabular-nums leading-none tracking-[-0.04em]">
                {value}
                <span className="text-[15px] tracking-normal text-ink-soft">{m.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((o, i) => (
            <li key={i} className="rounded-[20px] bg-sheet px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusMark level={SEVERITY_MARK[o.severity]} size={15} />
                <span className="text-[17px]" style={{ color: o.severity === "info" ? undefined : SEVERITY_COLOR[o.severity] }}>{o.title}</span>
                {o.experimental && <span className="chip bg-cap-coral">experimental</span>}
              </div>
              <p className="mt-1 text-[15px] leading-snug text-ink-soft">{o.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {result.reminders?.map((r) => (
          <span key={r.kind} className="chip bg-sheet">
            <CalendarClock size={14} /> {r.title}
          </span>
        ))}
        {result.report && (
          <span className="chip bg-cap-lilac">
            <Satellite size={14} /> Report {result.report.status.replace("_", " ")} for Mission Control
          </span>
        )}
      </div>

      <button className="btn-ghost min-h-[56px] w-full justify-between px-6 text-[17px]" onClick={onDetails} aria-expanded={false}>
        <span>Detailed health insights</span>
        <ChevronDown size={18} />
      </button>
      <p className="text-[13px] leading-snug text-ink-soft">{result.disclaimer} {result.data_provenance.note}</p>
    </motion.div>
  );
}
