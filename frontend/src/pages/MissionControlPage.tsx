import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCheck, Radio, RadioTower, Satellite, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { CommMessage, Insights, LinkState, StatusLevel } from "../types";
import { OperatorGate } from "../features/admin/OperatorGate";
import { DetailsPanel } from "../features/dashboard/DetailsPanel";
import { fmtTime, relTime, STATUS_COLOR } from "../features/dashboard/format";
import { StatusMark } from "../features/dashboard/StatusMark";
import { Lobe } from "../components/Lobe";

type Overview = Awaited<ReturnType<typeof api.mcOverview>>;

// Delivery state as capsules (labels on world colours, text always ink).
const MSG_COLOR: Record<CommMessage["status"], string> = {
  created: "#FFFFFF",
  queued: "#F5E211",
  in_transit: "#2BA0FF",
  delivered: "#EBC1FF",
  acknowledged: "#FFFFFF",
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

  if (!ov) return <div className="label p-8">{error ?? "Connecting to ground segment…"}</div>;
  // Only critical (activation/update) messages raise the red banner; "resolved onboard" notices are informational.
  const activeEmergency = ov.emergencies.find((m) => m.status === "delivered" && m.priority === "critical");
  const resolvedNotice = ov.emergencies.find((m) => m.status === "delivered" && m.priority !== "critical");

  return (
    <div className="relative flex flex-col gap-5 p-5 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[clamp(2.75rem,6vw,5.5rem)]">Crew health console</h1>
          <p className="mt-3 text-lg text-ink-soft">Earth · Mission Control · reports arrive over the delayed link</p>
        </div>
        <LinkControls link={ov.link} counts={ov.counts} onChange={refresh} />
      </header>

      {activeEmergency && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] bg-st-urgent px-6 py-5 text-white" role="alert">
          <div className="flex items-center gap-4">
            <AlertTriangle size={30} className="shrink-0" />
            <div>
              <div className="text-2xl tracking-[-0.03em]">{activeEmergency.subject}</div>
              <div className="text-[15px]">
                Activated onboard {fmtTime(activeEmergency.payload?.activated_at)} · received {relTime(activeEmergency.delivered_at)}
                {activeEmergency.payload?.patient?.name ? ` · patient ${activeEmergency.payload.patient.name}` : ""}
              </div>
            </div>
          </div>
          <button className="btn-ghost ring-0" onClick={async () => (await api.mcAck(activeEmergency.id, "Flight Surgeon"), refresh())}>
            <CheckCheck size={17} /> Acknowledge
          </button>
        </div>
      )}

      {!activeEmergency && resolvedNotice && (
        <div className="sheet flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 text-[15px]">
            <CheckCheck size={18} className="text-st-clear" />
            <span>{resolvedNotice.subject}</span>
            <span className="text-[13px] text-ink-soft">received {relTime(resolvedNotice.delivered_at)}</span>
          </div>
          <button className="btn-ghost" onClick={async () => (await api.mcAck(resolvedNotice.id, "Flight Surgeon"), refresh())}>
            Acknowledge
          </button>
        </div>
      )}

      <section className="relative my-8">
        <Lobe seed={41} swell={0.08} square={0.9} className="-inset-x-[5%] -inset-y-[10%]" />
        <div className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ov.crew.map((c) => {
            const p = c.last_report?.payload;
            const level = (p?.status_level ?? null) as StatusLevel | null;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className={`sheet flex flex-col p-5 text-left transition-shadow hover:shadow-[0_8px_24px_rgba(44,46,42,0.14)] ${selected === c.id ? "ring-[3px] ring-inset ring-ink" : ""}`}>
                <div className="text-[22px] leading-tight tracking-[-0.03em]">{c.display_name}</div>
                <div className="text-[13px] text-ink-soft">
                  {c.id} · {c.role}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-[15px] leading-snug" style={level ? { background: STATUS_COLOR[level], color: "#FFFFFF" } : { background: "#F5F1E4" }}>
                  {level ? <StatusMark level={level} size={15} className="mt-0.5" color="#FFFFFF" /> : <StatusMark level="none" size={15} className="mt-0.5" />}
                  {p?.status ?? "No report received"}
                </div>
                <div className="mt-2 text-[13px] text-ink-soft">
                  {c.last_report ? `Received ${relTime(c.last_report.delivered_at)} · check-in ${fmtTime(p?.checkin?.started_at)}` : "—"}
                </div>
                {(p?.observations ?? []).filter((o: { severity: string }) => o.severity !== "info").slice(0, 2).map((o: { title: string }, i: number) => (
                  <div key={i} className="mt-1 truncate text-[13px] text-ink">
                    {o.title}
                  </div>
                ))}
                {c.pending_reports > 0 && <div className="chip mt-2 w-fit bg-cap-yellow">{c.pending_reports} report(s) not yet received</div>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="sheet relative overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-4">
            <h2 className="text-[22px] tracking-[-0.03em]">Store-and-forward message queue</h2>
            <span className="text-[13px] text-ink-soft">Persisted locally in SQLite</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-[15px]">
              <tbody>
                {ov.messages.map((m) => (
                  <tr key={m.id} className="border-t border-rule">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        {m.priority === "critical" && <StatusMark level="urgent" size={14} />}
                        <span className="truncate">{m.subject}</span>
                      </div>
                      <div className="text-[13px] text-ink-soft">
                        {m.kind} · created {fmtTime(m.created_at)} · attempts {m.attempts}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2">
                      <span className="chip" style={{ background: MSG_COLOR[m.status], boxShadow: m.status === "created" || m.status === "acknowledged" ? "inset 0 0 0 1px rgba(44,46,42,0.14)" : undefined }}>
                        {m.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 text-right">
                      {m.status === "delivered" && (
                        <button className="btn-ghost min-h-[36px] px-4 text-[13px]" onClick={async () => (await api.mcAck(m.id, "Flight Surgeon"), refresh())}>
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
            className="fixed inset-0 z-30 bg-ink/40"
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
            className="fixed inset-y-0 right-0 z-40 w-full max-w-3xl bg-water shadow-[-16px_0_48px_rgba(44,46,42,0.22)]"
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
    <div className="flex flex-wrap items-center gap-4 rounded-[28px] bg-sheet py-3 pl-5 pr-3">
      <div className="flex items-center gap-2.5">
        {link.link_up ? <RadioTower size={20} /> : <WifiOff className="text-st-urgent" size={20} />}
        <div>
          <div className="text-[15px]">{link.link_up ? "Deep-space link up" : "Link lost (simulated)"}</div>
          <div className="text-[13px] text-ink-soft">
            <Satellite size={12} className="inline" /> queued {counts.queued ?? 0} · in transit {counts.in_transit ?? 0} · delivered {counts.delivered ?? 0}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        One-way delay
        <input type="range" min={0} max={120} step={1} value={delay} onChange={(e) => setDelay(Number(e.target.value))} onMouseUp={async () => (await api.setLink({ delay_s: delay }), onChange())} onKeyUp={async () => (await api.setLink({ delay_s: delay }), onChange())} aria-label="One-way delay seconds" />
        <span className="w-10 tabular-nums text-ink">{delay}s</span>
      </label>
      <button className={link.link_up ? "btn bg-cap-coral hover:bg-[#F2604D]" : "btn-primary"} onClick={async () => (await api.setLink({ link_up: !link.link_up }), onChange())}>
        <Radio size={16} /> {link.link_up ? "Simulate outage" : "Restore link"}
      </button>
    </div>
  );
}
