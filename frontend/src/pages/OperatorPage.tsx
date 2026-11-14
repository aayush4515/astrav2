import { FlaskConical, KeyRound, RotateCcw, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, tokens } from "../services/api";
import { OperatorGate } from "../features/admin/OperatorGate";
import { fmtTime } from "../features/dashboard/format";

type Demo = Awaited<ReturnType<typeof api.demoScenarios>>;

export default function OperatorPage() {
  return (
    <OperatorGate title="Authorized operator tools">
      <Tools />
    </OperatorGate>
  );
}

/** Demo scenario control, biometric management, recovery sessions and the audit log. */
function Tools() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof api.audit>>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [recovery, setRecovery] = useState({ astronaut_id: "", reason: "" });
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    setDemo(await api.demoScenarios());
    setAudit(await api.audit());
  }, []);
  useEffect(() => {
    refresh().catch((e) => setMsg(e.message));
  }, [refresh]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      setMsg(done);
      await refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  if (!demo) return <div className="p-8 label">{msg ?? "Loading…"}</div>;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Operator</div>
          <h1 className="text-3xl font-light">Demo & administration</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/mission-control" className="btn-ghost">
            Mission Control
          </Link>
          <button
            className="btn-ghost"
            onClick={() => {
              tokens.setOperator(null);
              window.location.assign("/");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {msg && <div className="rounded-xl border border-line bg-white/5 p-3 text-sm">{msg}</div>}

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <FlaskConical size={16} /> Deterministic demo scenarios
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Each astronaut's simulated sensors follow the selected scenario on their next live check-in. Results are reproducible.</p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="py-1">Astronaut</th>
              <th>Face</th>
              <th>Scenario</th>
              <th>Blood test</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {demo.astronauts.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="py-2">
                  {a.display_name} <span className="font-mono text-[11px] text-ink-faint">{a.id}</span>
                </td>
                <td>{a.face_enrolled ? <span className="text-ok">enrolled</span> : <span className="text-ink-faint">not enrolled</span>}</td>
                <td>
                  <select className="input py-1.5" value={a.scenario} onChange={(e) => act(() => api.setScenario(a.id, e.target.value), `Scenario for ${a.display_name} set`)} aria-label={`Scenario for ${a.display_name}`}>
                    {Object.entries(demo.scenarios).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-xs">
                  <span className={a.blood_test.due_now ? "text-caution" : "text-ink-muted"}>{a.blood_test.status}</span>
                  <button className="ml-2 text-cyan-soft underline" onClick={() => act(() => api.forceBloodDue(a.id), "Blood test marked due")}>
                    make due
                  </button>
                </td>
                <td className="whitespace-nowrap text-right">
                  <Link to="/enroll" className="btn-ghost mr-1 px-2 py-1 text-xs" title="Re-enroll (operator)">
                    <ScanFace size={12} />
                  </Link>
                  {a.face_enrolled && (
                    <button className="btn-ghost px-2 py-1 text-xs" title="Delete facial biometrics" onClick={() => confirm(`Delete facial templates for ${a.display_name}?`) && act(() => api.deleteBiometrics(a.id), "Biometric data deleted")}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-danger" onClick={() => confirm("Reset the demo database? All check-ins and facial enrollments will be erased and synthetic history regenerated.") && act(() => api.resetDemo(), "Demo database reset")}>
            <RotateCcw size={14} /> Reset demo database
          </button>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound size={16} /> Recovery check-in (authorized operator)
        </h2>
        <p className="mt-1 text-sm text-ink-muted">For facial injury, camera failure or failed enrollment. Never automatic, always audited. Emergency mode never requires this.</p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const s = await api.recovery(recovery.astronaut_id, recovery.reason);
              navigate("/", { state: { recovery: s } });
            } catch (err) {
              setMsg((err as Error).message);
            }
          }}
        >
          <select className="input w-56" required value={recovery.astronaut_id} onChange={(e) => setRecovery({ ...recovery, astronaut_id: e.target.value })} aria-label="Astronaut">
            <option value="">Select astronaut…</option>
            {demo.astronauts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </select>
          <input className="input flex-1" required minLength={3} placeholder="Reason (e.g. camera malfunction)" value={recovery.reason} onChange={(e) => setRecovery({ ...recovery, reason: e.target.value })} />
          <button className="btn-primary">Start recovery check-in</button>
        </form>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck size={16} /> Audit log
        </h2>
        <div className="mt-3 max-h-80 overflow-y-auto font-mono text-xs">
          {audit.map((a, i) => (
            <div key={i} className="flex gap-3 border-b border-line/50 py-1">
              <span className="text-ink-faint">{fmtTime(a.t)}</span>
              <span className="text-cyan-soft">{a.action}</span>
              <span>{a.astronaut_id ?? ""}</span>
              <span className="truncate text-ink-faint">{a.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
