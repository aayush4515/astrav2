import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Info, Satellite } from "lucide-react";
import type { AnalysisResult } from "../../types";
import { SEVERITY_COLOR, STATUS_COLOR } from "../dashboard/format";

const ICON = { clear: CheckCircle2, watch: Info, review: AlertTriangle, urgent: AlertTriangle };

/** Glanceable result: one status, at most three observations, one next action. */
export function SummaryView({ result, onDetails }: { result: AnalysisResult; onDetails: () => void }) {
  const Icon = ICON[result.status_level];
  const color = STATUS_COLOR[result.status_level];
  const obs = result.observations.filter((o) => o.severity !== "info").slice(0, 3);
  const notes = obs.length ? obs : result.observations.slice(0, 2);
  const next = result.guidance[0];
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `${color}22`, color }}>
          <Icon size={30} />
        </span>
        <div>
          <div className="label">Assessment result</div>
          <h2 className="text-2xl font-semibold md:text-3xl" style={{ color }}>
            {result.status}
          </h2>
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((o, i) => (
            <li key={i} className="rounded-xl border border-line bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[o.severity] }} />
                <span className="font-medium">{o.title}</span>
                {o.experimental && <span className="chip bg-caution/10 text-caution">experimental</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{o.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      {next && (
        <div className="rounded-xl border border-cyan-glow/30 bg-cyan-glow/5 px-4 py-3">
          <div className="label text-cyan-soft">Recommended next action</div>
          <p className="mt-1 font-medium">{next.title}</p>
          <p className="text-sm text-ink-muted">{next.steps[0]}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
        {result.reminders?.map((r) => (
          <span key={r.kind} className="chip bg-caution/10 text-caution">
            <CalendarClock size={12} /> {r.title}
          </span>
        ))}
        {result.report && (
          <span className="chip bg-white/5">
            <Satellite size={12} /> Report {result.report.status.replace("_", " ")} for Mission Control
          </span>
        )}
      </div>

      <button className="btn-ghost w-full justify-between" onClick={onDetails} aria-expanded={false}>
        <span>Detailed health insights</span>
        <ChevronDown size={16} />
      </button>
      <p className="text-[11px] text-ink-faint">{result.disclaimer} {result.data_provenance.note}</p>
    </motion.div>
  );
}
