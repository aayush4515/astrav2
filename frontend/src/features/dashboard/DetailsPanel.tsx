import { motion } from "framer-motion";
import { Activity, Beaker, FlaskConical, HeartPulse, ListChecks, ScanFace, User, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { Insights, MetricState } from "../../types";
import { BodyMap, REGIONS } from "./BodyMap";
import { fmtDate, fmtTime, METRIC_STATUS_COLOR, SEVERITY_COLOR, STATUS_COLOR } from "./format";
import { TrendChart } from "./TrendChart";

export const SECTIONS = [
  { id: "overview", label: "Overview", icon: ListChecks },
  { id: "trends", label: "Trends", icon: Activity },
  { id: "body", label: "Body", icon: User },
  { id: "facial", label: "Face", icon: ScanFace },
  { id: "voc", label: "VOC", icon: FlaskConical },
  { id: "labs", label: "Labs", icon: Beaker },
  { id: "guidance", label: "Guidance", icon: HeartPulse },
] as const;

interface Props {
  insights: Insights | null;
  section: string;
  metric?: string;
  region?: string;
  onSection: (s: string, extra?: { metric?: string; region?: string }) => void;
  onClose?: () => void;
  title?: string;
}

/** "Detailed Health Insights": everything advanced, behind one progressive-disclosure surface. */
export function DetailsPanel({ insights, section, metric, region, onSection, onClose, title = "Detailed health insights" }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <div className="label">{insights?.astronaut.display_name ?? "Loading"}</div>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        {onClose && (
          <button className="btn-ghost px-2.5 py-2" onClick={onClose} aria-label="Close details">
            <X size={16} />
          </button>
        )}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2" aria-label="Insight sections">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSection(id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${section === id ? "bg-cyan-glow/15 text-cyan-soft" : "text-ink-muted hover:text-ink"}`}
            aria-current={section === id}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-5">
        {!insights ? (
          <div className="label animate-breathe">Loading history…</div>
        ) : (
          <motion.div key={section} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {section === "overview" && <Overview insights={insights} onSection={onSection} />}
            {section === "trends" && <Trends insights={insights} metric={metric} onSection={onSection} />}
            {section === "body" && <Body insights={insights} region={region} onSection={onSection} />}
            {section === "facial" && <Facial insights={insights} />}
            {section === "voc" && <Voc insights={insights} />}
            {section === "labs" && <Labs insights={insights} />}
            {section === "guidance" && <GuidanceList insights={insights} />}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function SimTag({ simulated }: { simulated: boolean }) {
  return (
    <span className={`chip ${simulated ? "bg-white/5 text-ink-faint" : "bg-ok/10 text-ok"}`}>{simulated ? "simulated" : "real sensor"}</span>
  );
}

function MetricRow({ k, m, onClick }: { k: string; m: MetricState; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5" data-metric={k}>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: METRIC_STATUS_COLOR[m.status] }} />
        <span className="text-sm">{m.label}</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="font-mono text-sm">
          {m.value} <span className="text-ink-faint">{m.unit}</span>
        </span>
        <span className="w-24 text-right font-mono text-[11px] text-ink-faint">{m.baseline != null ? `usual ${m.baseline}` : m.status === "context_excluded" ? "post-exercise" : "no baseline"}</span>
      </span>
    </button>
  );
}

function Overview({ insights, onSection }: { insights: Insights; onSection: Props["onSection"] }) {
  const latest = insights.latest;
  const metrics = (latest?.metrics ?? {}) as Record<string, MetricState>;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel p-4">
        <div className="label">Latest measurements · {fmtTime(latest?.t)}</div>
        <div className="mt-2 divide-y divide-line">
          {Object.entries(metrics).map(([k, m]) => (
            <MetricRow key={k} k={k} m={m} onClick={() => onSection("trends", { metric: k })} />
          ))}
          {!Object.keys(metrics).length && <p className="p-3 text-sm text-ink-faint">No completed check-in yet.</p>}
        </div>
      </section>
      <section className="flex flex-col gap-5">
        <div className="panel p-4">
          <div className="label">Recent observations (14 days)</div>
          <ul className="mt-2 space-y-2">
            {insights.observations.slice(0, 6).map((o) => (
              <li key={o.id} className="rounded-xl bg-white/[0.03] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: SEVERITY_COLOR[o.severity] }}>
                    {o.title}
                  </span>
                  <span className="font-mono text-[11px] text-ink-faint">{fmtDate(o.t)}</span>
                </div>
                {o.experimental && <span className="chip mt-1 bg-caution/10 text-caution">experimental</span>}
              </li>
            ))}
            {!insights.observations.length && <li className="text-sm text-ink-faint">No notable observations.</li>}
          </ul>
        </div>
        <div className="panel p-4">
          <div className="label">Check-in history</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {insights.checkins
              .slice()
              .reverse()
              .map((c) => (
                <span
                  key={c.id}
                  title={`${fmtTime(c.t)} · ${c.status ?? "—"}${c.seeded ? " · synthetic history" : ""}`}
                  className="h-4 w-4 rounded"
                  style={{ background: c.status_level ? STATUS_COLOR[c.status_level] : "#334", opacity: c.seeded ? 0.55 : 1 }}
                />
              ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Faded squares are synthetic seeded history. Hover for details.</p>
        </div>
      </section>
    </div>
  );
}

function Trends({ insights, metric, onSection }: { insights: Insights; metric?: string; onSection: Props["onSection"] }) {
  const keys = Object.keys(insights.metrics_catalog);
  const [sel, setSel] = useState(metric && keys.includes(metric) ? metric : "resting_heart_rate");
  useEffect(() => {
    if (metric && keys.includes(metric)) setSel(metric);
  }, [metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const spec = insights.metrics_catalog[sel];
  const base = insights.baselines[sel];
  const latest = (insights.latest?.metrics as Record<string, MetricState> | undefined)?.[sel];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => {
              setSel(k);
              onSection("trends", { metric: k });
            }}
            className={`chip ${sel === k ? "bg-cyan-glow/15 text-cyan-soft ring-1 ring-cyan-glow/40" : "bg-white/5 text-ink-muted hover:text-ink"}`}
          >
            {insights.metrics_catalog[k].label}
          </button>
        ))}
      </div>
      <section className="panel p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="label">{spec.label} · last 28 days</div>
            {latest && (
              <div className="mt-1 text-3xl font-semibold">
                {latest.value} <span className="text-base text-ink-muted">{spec.unit}</span>
              </div>
            )}
          </div>
          <div className="text-right text-xs text-ink-muted">
            {base ? (
              <>
                Personal baseline {base.median.toFixed(1)} ± {base.spread.toFixed(1)} {spec.unit} (n={base.n})
                {base.trend_per_day != null && <div>7-day trend {base.trend_per_day > 0 ? "+" : ""}{base.trend_per_day.toFixed(2)} {spec.unit}/day</div>}
              </>
            ) : (
              "Baseline not yet established"
            )}
          </div>
        </div>
        <div className="mt-3">
          <TrendChart points={insights.series[sel] ?? []} unit={spec.unit} baseline={base} refLow={spec.ref_low} refHigh={spec.ref_high} />
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Shaded band: your personal range (median ± 2 robust SD). Dotted amber lines: general reference values (illustrative, not NASA criteria).
        </p>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className="panel p-4">
          <div className="label">Why it matters</div>
          <p className="mt-1 text-sm text-ink-muted">{spec.why}</p>
        </div>
        <div className="panel p-4">
          <div className="label">How it is measured</div>
          <p className="mt-1 text-sm text-ink-muted">{spec.how}</p>
        </div>
      </section>
    </div>
  );
}

function Body({ insights, region, onSection }: { insights: Insights; region?: string; onSection: Props["onSection"] }) {
  const [sel, setSel] = useState(region ?? "cardiovascular");
  useEffect(() => {
    if (region) setSel(region);
  }, [region]);
  const metrics = (insights.latest?.metrics ?? {}) as Record<string, MetricState>;
  const facialFlag = insights.latest?.facial?.status === "changed";
  const info = REGIONS.find((r) => r.id === sel);
  const inRegion = Object.entries(metrics).filter(([, m]) => m.region === sel);
  const obs = (insights.latest?.observations ?? []).filter((o) => o.severity !== "info" && (o.metrics.some((k) => metrics[k]?.region === sel) || (sel === "head_eyes" && o.category === "head_eyes") || (sel === "wellbeing" && ["wellbeing", "behavioral"].includes(o.category))));
  return (
    <div className="grid items-start gap-5 md:grid-cols-[220px_1fr]">
      <div className="flex justify-center">
        <BodyMap metrics={metrics} selected={sel} onSelect={setSel} facialFlag={facialFlag} />
      </div>
      <section className="panel p-4">
        <div className="label">Body region</div>
        <h3 className="mt-1 text-xl font-semibold">{info?.label}</h3>
        <p className="mt-1 text-sm text-ink-muted">{info?.description}</p>
        <div className="mt-3 divide-y divide-line">
          {inRegion.map(([k, m]) => (
            <MetricRow key={k} k={k} m={m} onClick={() => onSection("trends", { metric: k })} />
          ))}
          {sel === "head_eyes" && (
            <button className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => onSection("facial")}>
              Facial geometry: <span style={{ color: facialFlag ? "#fbbf24" : "#4ade80" }}>{insights.latest?.facial?.status?.replace("_", " ") ?? "no scan"}</span> →
            </button>
          )}
          {!inRegion.length && sel !== "head_eyes" && <p className="px-3 py-2 text-sm text-ink-faint">No direct sensor in this region; see well-being and questionnaire data.</p>}
        </div>
        {obs.length > 0 && (
          <div className="mt-4 space-y-2">
            {obs.map((o, i) => (
              <div key={i} className="rounded-xl bg-white/[0.03] p-3 text-sm">
                <div style={{ color: SEVERITY_COLOR[o.severity] }}>{o.title}</div>
                <p className="mt-1 text-ink-muted">{o.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Facial({ insights }: { insights: Insights }) {
  const hist = insights.facial.filter((f) => f.features);
  const keys = Object.keys(insights.facial_features);
  const [sel, setSel] = useState("eye_opening_asymmetry");
  const latest = hist.filter((h) => !h.is_reference).at(-1);
  const series = hist.map((h) => ({ t: h.t, v: h.features[sel], valid: true, simulated: false, context: h.is_reference ? "reference" : "checkin" }));
  if (!hist.length)
    return <p className="text-sm text-ink-muted">No facial observations yet. They are captured from the real webcam during enrollment and each check-in.</p>;
  return (
    <div className="flex flex-col gap-4">
      {latest?.comparison && (
        <section className="panel p-4">
          <div className="label">Latest scan · {fmtTime(latest.t)}</div>
          <p className="mt-2 text-sm">{latest.comparison.explanation ?? latest.comparison.message}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(latest.comparison.features ?? {}).map(([k, f]) => (
              <button key={k} onClick={() => setSel(k)} className={`flex justify-between rounded-lg px-3 py-2 text-left text-sm ${sel === k ? "bg-white/10" : "bg-white/[0.03]"}`}>
                <span style={{ color: f.flagged ? "#fbbf24" : undefined }}>{f.label}</span>
                <span className="font-mono text-xs text-ink-muted">
                  {f.current.toFixed(3)} vs {f.reference.toFixed(3)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="panel p-4">
        <div className="flex flex-wrap gap-1.5">
          {keys.map((k) => (
            <button key={k} onClick={() => setSel(k)} className={`chip ${sel === k ? "bg-cyan-glow/15 text-cyan-soft" : "bg-white/5 text-ink-muted"}`}>
              {insights.facial_features[k].label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <TrendChart points={series} unit={insights.facial_features[sel].unit} decimals={3} color="#5ee7ff" />
        </div>
        <p className="mt-1 text-xs text-ink-muted">{insights.facial_features[sel].description}</p>
      </section>
      <p className="text-xs text-ink-faint">
        Measured from the real webcam with MediaPipe landmarks; only geometry numbers are stored, never images. A webcam cannot diagnose edema, intracranial pressure, stroke or eye disease.
      </p>
    </div>
  );
}

function Voc({ insights }: { insights: Insights }) {
  const latest = insights.voc.at(-1);
  const a = insights.voc.slice().reverse().find((v) => v.analysis)?.analysis ?? null;
  const bars = useMemo(() => (a?.channel_z ?? []).map((z, i) => ({ ch: `${i + 1}`, z })), [a]);
  const scatter = useMemo(
    () => (a?.pca ? [...a.pca.history.map(([x, y]) => ({ x, y, kind: "history" })), { x: a.pca.current[0], y: a.pca.current[1], kind: "current" }] : []),
    [a],
  );
  if (!latest) return <p className="text-sm text-ink-muted">No VOC fingerprints yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-caution/30 bg-caution/5 p-3 text-xs text-caution">
        Experimental research feature with a simulated e-nose. It tracks change from your own pattern only — it does not measure hormones or diagnose anything.
      </div>
      {a && (
        <section className="panel p-4">
          <div className="label">Latest fingerprint · {fmtTime(latest.t)}</div>
          <p className="mt-2 text-sm">{a.explanation ?? a.message}</p>
          {a.similarity != null && <p className="mt-1 font-mono text-xs text-ink-muted">Similarity to baseline {a.similarity}% · history n={a.n_history}</p>}
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel p-4">
          <div className="label">Channel deviation (robust z)</div>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={bars}>
                <CartesianGrid stroke="rgba(120,170,255,0.08)" vertical={false} />
                <XAxis dataKey="ch" stroke="#5b6785" fontSize={10} />
                <YAxis stroke="#5b6785" fontSize={10} />
                <Tooltip contentStyle={{ background: "#0a1224", border: "1px solid rgba(120,170,255,0.2)" }} />
                <Bar dataKey="z" isAnimationActive={false}>
                  {bars.map((b, i) => (
                    <Cell key={i} fill={Math.abs(b.z) >= 3.5 ? "#fbbf24" : "#5ee7ff"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel p-4">
          <div className="label">Pattern map (PCA of your history)</div>
          <div className="h-52">
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid stroke="rgba(120,170,255,0.08)" />
                <XAxis dataKey="x" type="number" stroke="#5b6785" fontSize={10} />
                <YAxis dataKey="y" type="number" stroke="#5b6785" fontSize={10} />
                <ZAxis range={[40, 40]} />
                <Scatter data={scatter} isAnimationActive={false}>
                  {scatter.map((p, i) => (
                    <Cell key={i} fill={p.kind === "current" ? "#fbbf24" : "#5ee7ff66"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-ink-faint">Blue: previous scans. Amber: current scan.</p>
        </section>
      </div>
      {a?.possible_interference && (
        <section className="panel p-4">
          <div className="label">Possible measurement interference</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-muted">
            {a.possible_interference.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Labs({ insights }: { insights: Insights }) {
  const labs = insights.labs;
  const s = insights.blood_schedule;
  const markers = labs.length ? Object.keys(labs[labs.length - 1].results) : [];
  const [sel, setSel] = useState("hemoglobin");
  const series = labs.map((l) => ({ t: l.completed_at, v: l.results[sel]?.value, valid: true, simulated: l.simulated, context: "lab" }));
  const latest = labs.at(-1);
  const prev = labs.at(-2);
  return (
    <div className="flex flex-col gap-4">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="label">Weekly blood assessment</div>
          <p className="mt-1 text-sm">
            Next due <b>{fmtDate(s.next_due)}</b> · status <span className={s.due_now ? "text-caution" : "text-ok"}>{s.status}</span>
          </p>
        </div>
        <p className="text-xs text-ink-faint">Demo interval: every {s.interval_days} days (configurable, not an official protocol).</p>
      </section>
      {latest ? (
        <>
          <section className="panel overflow-x-auto p-4">
            <div className="label">Latest panel · {fmtDate(latest.completed_at)} · {latest.analyzer}</div>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
                <tr>
                  <th className="py-1">Marker</th>
                  <th>Latest</th>
                  <th>Previous</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {markers.map((k) => {
                  const r = latest.results[k];
                  const out = (r.ref_low != null && r.value < r.ref_low) || (r.ref_high != null && r.value > r.ref_high);
                  return (
                    <tr key={k} className="cursor-pointer border-t border-line hover:bg-white/5" onClick={() => setSel(k)}>
                      <td className="py-1.5">{r.label}</td>
                      <td className="font-mono" style={{ color: out ? "#fbbf24" : undefined }}>
                        {r.value} {r.unit}
                      </td>
                      <td className="font-mono text-ink-muted">{prev?.results[k]?.value ?? "—"}</td>
                      <td className="font-mono text-ink-faint">
                        {r.ref_low}–{r.ref_high}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2">
              <SimTag simulated={latest.simulated} />
            </div>
          </section>
          <section className="panel p-4">
            <div className="label">{latest.results[sel]?.label} history</div>
            <TrendChart points={series} unit={latest.results[sel]?.unit ?? ""} refLow={latest.results[sel]?.ref_low} refHigh={latest.results[sel]?.ref_high} color="#f87171" />
          </section>
        </>
      ) : (
        <p className="text-sm text-ink-muted">No lab results yet.</p>
      )}
    </div>
  );
}

function GuidanceList({ insights }: { insights: Insights }) {
  const items = insights.latest?.guidance ?? [];
  if (!items.length) return <p className="text-sm text-ink-muted">No guidance recorded for the latest check-in.</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((g) => (
        <section key={g.id} className="panel p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{g.title}</h3>
            <span className="label">{g.tier}</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{g.spoken}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            Why: {g.why}{" "}
            <a className="text-cyan-soft underline" href={g.source} target="_blank" rel="noreferrer">
              source
            </a>{" "}
            · demonstration content, not clinically reviewed
          </p>
        </section>
      ))}
    </div>
  );
}
