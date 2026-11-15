import { FlaskConical, KeyRound, RotateCcw, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, tokens } from "../services/api";
import { OperatorGate } from "../features/admin/OperatorGate";
import { fmtTime } from "../features/dashboard/format";
import { Lobe } from "../components/Lobe";

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

  if (!demo) return <div className="label p-8">{msg ?? "Loading…"}</div>;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6">
      <header className="relative flex flex-wrap items-end justify-between gap-3 py-6">
        <Lobe seed={29} swell={0.12} square={0.5} className="-left-[10%] -right-[4%] -top-[30%] bottom-0" />
        <h1 className="display relative text-[clamp(2.75rem,6vw,5.5rem)]">Demo & administration</h1>
        <div className="relative flex gap-2">
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
      {msg && <div className="w-fit rounded-full bg-cap-yellow px-5 py-2.5 text-[15px]" role="status">{msg}</div>}

      <section className="sheet overflow-x-auto p-6">
        <h2 className="flex items-center gap-2 text-[26px] tracking-[-0.035em]">
          <FlaskConical size={22} /> Deterministic demo scenarios
        </h2>
        <p className="mt-1 text-[15px] text-ink-soft">Each astronaut's simulated sensors follow the selected scenario on their next live check-in. Results are reproducible.</p>
        <table className="mt-3 w-full text-[15px]">
          <thead className="text-left text-[13px] text-ink-soft">
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
              <tr key={a.id} className="border-t border-rule">
                <td className="py-2.5 pr-3">
                  {a.display_name} <span className="text-[13px] text-ink-soft">{a.id}</span>
                </td>
                <td className="pr-3">{a.face_enrolled ? <span className="chip bg-cap-lilac">enrolled</span> : <span className="text-[13px] text-ink-soft">not enrolled</span>}</td>
                <td>
                  <select className="input min-h-[40px] py-1.5" value={a.scenario} onChange={(e) => act(() => api.setScenario(a.id, e.target.value), `Scenario for ${a.display_name} set`)} aria-label={`Scenario for ${a.display_name}`}>
                    {Object.entries(demo.scenarios).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="whitespace-nowrap px-3 text-[13px]">
                  <span className={a.blood_test.due_now ? "rounded-full bg-cap-yellow px-2.5 py-0.5" : "text-ink-soft"}>{a.blood_test.status}</span>
                  <button className="ml-2 underline" onClick={() => act(() => api.forceBloodDue(a.id), "Blood test marked due")}>
                    make due
                  </button>
                </td>
                <td className="whitespace-nowrap text-right">
                  <Link to="/enroll" className="btn-ghost mr-1 w-11 px-0" title="Re-enroll (operator)" aria-label={`Re-enroll ${a.display_name}`}>
                    <ScanFace size={16} />
                  </Link>
                  {a.face_enrolled && (
                    <button className="btn-ghost w-11 px-0" title="Delete facial biometrics" aria-label={`Delete facial biometrics for ${a.display_name}`} onClick={() => confirm(`Delete facial templates for ${a.display_name}?`) && act(() => api.deleteBiometrics(a.id), "Biometric data deleted")}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn bg-sheet ring-2 ring-inset ring-ink hover:bg-cap-yellow/40" onClick={() => confirm("Reset the demo database? All check-ins and facial enrollments will be erased and synthetic history regenerated.") && act(() => api.resetDemo(), "Demo database reset")}>
            <RotateCcw size={16} /> Reset demo database
          </button>
        </div>
      </section>

      <section className="sheet p-6">
        <h2 className="flex items-center gap-2 text-[26px] tracking-[-0.035em]">
          <KeyRound size={22} /> Recovery check-in (authorized operator)
        </h2>
        <p className="mt-1 text-[15px] text-ink-soft">For facial injury, camera failure or failed enrollment. Never automatic, always audited. Emergency mode never requires this.</p>
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

      <section className="sheet p-6">
        <h2 className="flex items-center gap-2 text-[26px] tracking-[-0.035em]">
          <ShieldCheck size={22} /> Audit log
        </h2>
        <div className="mt-3 max-h-80 overflow-y-auto text-[13px] tabular-nums">
          {audit.map((a, i) => (
            <div key={i} className="flex gap-3 border-b border-rule py-1.5">
              <span className="shrink-0 text-ink-soft">{fmtTime(a.t)}</span>
              <span className="shrink-0">{a.action}</span>
              <span className="shrink-0">{a.astronaut_id ?? ""}</span>
              <span className="truncate text-ink-soft">{a.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
