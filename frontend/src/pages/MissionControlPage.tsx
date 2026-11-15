import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCheck, Radio, RadioTower, Satellite, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { CommMessage, Insights, LinkState, StatusLevel } from "../types";
import { OperatorGate } from "../features/admin/OperatorGate";
import { DetailsPanel } from "../features/dashboard/DetailsPanel";
import { fmtTime, relTime, STATUS_COLOR } from "../features/dashboard/format";

type Overview = Awaited<ReturnType<typeof api.mcOverview>>;

const MSG_COLOR: Record<CommMessage["status"], string> = {
  created: "#8b97b3",
  queued: "#fbbf24",
  in_transit: "#5ee7ff",
  delivered: "#4ade80",
  acknowledged: "#5b6785",
};

export default function MissionControlPage() {
  return (
    <OperatorGate title="Mission Control · Flight surgeon console">
      <Console />
    </OperatorGate>
  );
}

/** Ground-side view. Only shows what has been delivered over the (simulated) deep-space link. */
function Console() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [section, setSection] = useState("overview");
  const [metric, setMetric] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOv(await api.mcOverview());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    setInsights(null);
    api.mcAstronaut(selected).then(setInsights).catch(() => undefined);
  }, [selected]);

  if (!ov) return <div className="p-8 label">{error ?? "Connecting to ground segment…"}</div>;
  // Only critical (activation/update) messages raise the red banner; "resolved onboard" notices are informational.
  const activeEmergency = ov.emergencies.find((m) => m.status === "delivered" && m.priority === "critical");
  const resolvedNotice = ov.emergencies.find((m) => m.status === "delivered" && m.priority !== "critical");

  return (
    <div className="flex flex-col gap-5 p-5 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Earth · Mission Control</div>
          <h1 className="text-3xl font-light">Crew health console</h1>
        </div>
        <LinkControls link={ov.link} counts={ov.counts} onChange={refresh} />
      </header>

      {activeEmergency && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-alert/60 bg-alert/10 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-alert" />
            <div>
              <div className="font-semibold text-alert">{activeEmergency.subject}</div>
              <div className="text-xs text-ink-muted">
                Activated onboard {fmtTime(activeEmergency.payload?.activated_at)} · received {relTime(activeEmergency.delivered_at)}
                {activeEmergency.payload?.patient?.name ? ` · patient ${activeEmergency.payload.patient.name}` : ""}
              </div>
            </div>
          </div>
          <button className="btn-danger" onClick={async () => (await api.mcAck(activeEmergency.id, "Flight Surgeon"), refresh())}>
            <CheckCheck size={16} /> Acknowledge
          </button>
        </div>
      )}

      {!activeEmergency && resolvedNotice && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ok/30 bg-ok/5 px-4 py-3">
          <div className="flex items-center gap-3 text-sm">
            <CheckCheck size={16} className="text-ok" />
            <span>{resolvedNotice.subject}</span>
            <span className="text-xs text-ink-faint">received {relTime(resolvedNotice.delivered_at)}</span>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={async () => (await api.mcAck(resolvedNotice.id, "Flight Surgeon"), refresh())}>
            Acknowledge
          </button>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ov.crew.map((c) => {
          const p = c.last_report?.payload;
          const level = (p?.status_level ?? null) as StatusLevel | null;
          return (
            <button key={c.id} onClick={() => setSelected(c.id)} className={`panel p-4 text-left transition hover:border-cyan-glow/40 ${selected === c.id ? "border-cyan-glow/60" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{c.display_name}</div>
                  <div className="text-xs text-ink-faint">
                    {c.id} · {c.role}
                  </div>
                </div>
                <span className="h-3 w-3 rounded-full" style={{ background: level ? STATUS_COLOR[level] : "#334" }} />
              </div>
              <div className="mt-3 text-sm" style={{ color: level ? STATUS_COLOR[level] : undefined }}>
                {p?.status ?? "No report received"}
              </div>
              <div className="mt-1 text-[11px] text-ink-faint">
                {c.last_report ? `Received ${relTime(c.last_report.delivered_at)} · check-in ${fmtTime(p?.checkin?.started_at)}` : "—"}
              </div>
              {(p?.observations ?? []).filter((o: { severity: string }) => o.severity !== "info").slice(0, 2).map((o: { title: string }, i: number) => (
                <div key={i} className="mt-1 truncate text-xs text-ink-muted">
                  • {o.title}
                </div>
              ))}
              {c.pending_reports > 0 && <div className="mt-2 chip bg-caution/10 text-caution">{c.pending_reports} report(s) not yet received</div>}
            </button>
          );
        })}
      </section>

      <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="label">Store-and-forward message queue</span>
            <span className="text-xs text-ink-faint">Persisted locally in SQLite</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {ov.messages.map((m) => (
                  <tr key={m.id} className="border-b border-line/60">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {m.priority === "critical" && <AlertTriangle size={13} className="text-alert" />}
                        <span className="truncate">{m.subject}</span>
                      </div>
                      <div className="font-mono text-[10px] text-ink-faint">
                        {m.kind} · created {fmtTime(m.created_at)} · attempts {m.attempts}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 text-xs" style={{ color: MSG_COLOR[m.status] }}>
                      {m.status.replace("_", " ")}
                    </td>
                    <td className="px-3 text-right">
                      {m.status === "delivered" && (
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => (await api.mcAck(m.id, "Flight Surgeon"), refresh())}>
                          Ack
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      <AnimatePresence>
        {selected && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-void/60 backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
            aria-hidden
          />
        )}
        {selected && (
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            className="fixed inset-y-0 right-0 z-40 w-full max-w-3xl border-l border-line bg-deep/95 backdrop-blur-xl"
          >
            <DetailsPanel
              insights={insights}
              section={section}
              metric={metric}
              onSection={(s, extra) => {
                setSection(s);
                setMetric(extra?.metric);
              }}
              onClose={() => setSelected(null)}
              title="Medical history (operator view)"
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function LinkControls({ link, counts, onChange }: { link: LinkState; counts: Record<string, number>; onChange: () => void }) {
  const [delay, setDelay] = useState(link.delay_s);
  useEffect(() => setDelay(link.delay_s), [link.delay_s]);
  return (
    <div className="panel flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="flex items-center gap-2">
        {link.link_up ? <RadioTower className="text-ok" size={18} /> : <WifiOff className="text-alert" size={18} />}
        <div>
          <div className="text-sm font-medium">{link.link_up ? "Deep-space link up" : "Link lost (simulated)"}</div>
          <div className="text-[11px] text-ink-faint">
            <Satellite size={10} className="inline" /> queued {counts.queued ?? 0} · in transit {counts.in_transit ?? 0} · delivered {counts.delivered ?? 0}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        One-way delay
        <input type="range" min={0} max={120} step={1} value={delay} onChange={(e) => setDelay(Number(e.target.value))} onMouseUp={async () => (await api.setLink({ delay_s: delay }), onChange())} onKeyUp={async () => (await api.setLink({ delay_s: delay }), onChange())} aria-label="One-way delay seconds" />
        <span className="w-10 font-mono">{delay}s</span>
      </label>
      <button className={link.link_up ? "btn-danger" : "btn-primary"} onClick={async () => (await api.setLink({ link_up: !link.link_up }), onChange())}>
        <Radio size={14} /> {link.link_up ? "Simulate outage" : "Restore link"}
      </button>
    </div>
  );
}
