import { motion } from "framer-motion";
import { Activity, Beaker, ChevronRight, FlaskConical, HeartPulse, ListChecks, ScanFace, User, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { Insights, MetricState } from "../../types";
import { Lobe } from "../../components/Lobe";
import { BodyMap, REGIONS, regionStatus } from "./BodyMap";
import { fmtDate, fmtTime, SEVERITY_COLOR, STATUS_COLOR } from "./format";
import { MARK_NAME, METRIC_MARK, SEVERITY_MARK, StatusMark } from "./StatusMark";
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
      <div className="relative flex items-start justify-between gap-3 overflow-hidden px-6 pb-4 pt-6">
        <Lobe seed={5} swell={0.12} square={0.5} className="-left-[12%] -right-[8%] -top-[60%] bottom-[-14%]" />
        <div className="relative">
          <h2 className="display text-[clamp(2.25rem,4vw,3.5rem)]">{title}</h2>
          <p className="mt-2 text-[15px] text-ink">{insights?.astronaut.display_name ?? "Loading"}</p>
        </div>
        {onClose && (
          <button className="btn-ghost relative w-11 px-0" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="relative flex gap-1.5 overflow-x-auto px-6 py-3" aria-label="Insight sections">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSection(id)}
            className={`flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] text-ink ${section === id ? "bg-cap-yellow" : "bg-sheet hover:bg-cap-yellow/40"}`}
            aria-current={section === id}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3">
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
    <span className={`chip ${simulated ? "bg-cap-lilac" : "bg-cap-blue"}`}>{simulated ? "simulated" : "real sensor"}</span>
  );
}

function MetricRow({ k, m, onClick }: { k: string; m: MetricState; onClick?: () => void }) {
  const usual = m.baseline != null ? `usual ${Number(m.baseline.toFixed(1))}` : m.status === "context_excluded" ? "post-exercise" : "no baseline yet";
  return (
    <button onClick={onClick} className="group flex w-full items-center justify-between gap-4 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-water" data-metric={k}>
      <span className="flex min-w-0 items-center gap-2.5">
        <StatusMark level={METRIC_MARK[m.status] ?? "none"} size={13} />
        <span className="truncate text-[15px]">{m.label}</span>
      </span>
      <span className="shrink-0 text-right tabular-nums leading-tight">
        <span className="text-[17px]">
          {m.value}
          <span className="ml-1 text-[13px] text-ink-soft">{m.unit}</span>
        </span>
        <span className="block text-[13px] text-ink-soft">{usual}</span>
      </span>
    </button>
  );
}

function Overview({ insights, onSection }: { insights: Insights; onSection: Props["onSection"] }) {
  const latest = insights.latest;
  const metrics = (latest?.metrics ?? {}) as Record<string, MetricState>;
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <section className="sheet p-5">
        <h3 className="sheet-title">Latest measurements</h3>
        <p className="label">{fmtTime(latest?.t)}</p>
        <div className="mt-2 divide-y divide-rule">
          {Object.entries(metrics).map(([k, m]) => (
            <MetricRow key={k} k={k} m={m} onClick={() => onSection("trends", { metric: k })} />
          ))}
          {!Object.keys(metrics).length && <p className="p-3 text-[15px] text-ink-soft">No completed check-in yet.</p>}
        </div>
      </section>
      <section className="flex flex-col gap-5">
        <div className="sheet p-5">
          <h3 className="sheet-title">Recent observations (14 days)</h3>
          <ul className="mt-2 divide-y divide-rule">
            {insights.observations.slice(0, 6).map((o) => (
              <li key={o.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-start gap-2 text-[15px] leading-snug" style={{ color: o.severity === "info" ? undefined : SEVERITY_COLOR[o.severity] }}>
                    <StatusMark level={SEVERITY_MARK[o.severity]} size={13} className="mt-1" />
                    {o.title}
                  </span>
                  <span className="shrink-0 text-[13px] text-ink-soft">{fmtDate(o.t)}</span>
                </div>
                {o.experimental && <span className="chip ml-5 mt-1 bg-cap-coral">experimental</span>}
              </li>
            ))}
            {!insights.observations.length && <li className="text-[15px] text-ink-soft">No notable observations.</li>}
          </ul>
        </div>
        <div className="sheet p-5">
          <h3 className="sheet-title">Check-in history</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {insights.checkins
              .slice()
              .reverse()
              .map((c) => (
                <span
                  key={c.id}
                  title={`${fmtTime(c.t)} · ${c.status ?? "—"}${c.seeded ? " · synthetic history" : ""}`}
                  className="h-5 w-5 rounded-full"
                  style={{ background: c.status_level ? STATUS_COLOR[c.status_level] : "#5E6158", opacity: c.seeded ? 0.45 : 1 }}
                />
              ))}
          </div>
          <p className="mt-2 text-[13px] text-ink-soft">Faded dots are synthetic seeded history. Hover for the status and date.</p>
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
            className={`chip min-h-[36px] ${sel === k ? "bg-cap-yellow" : "bg-sheet hover:bg-cap-yellow/40"}`}
          >
            {insights.metrics_catalog[k].label}
          </button>
        ))}
      </div>
      <section className="sheet p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="sheet-title">{spec.label} · last 28 days</h3>
            {latest && (
              <div className="mt-1 text-[44px] tabular-nums leading-none tracking-[-0.05em]">
                {latest.value} <span className="text-[17px] tracking-normal text-ink-soft">{spec.unit}</span>
              </div>
            )}
          </div>
          <div className="text-right text-[13px] text-ink-soft">
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
        <p className="mt-2 text-[13px] text-ink-soft">
          Shaded band: your personal range (median ± 2 robust SD). Dotted ochre lines: general reference values (illustrative, not NASA criteria).
        </p>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className="sheet p-5">
          <h3 className="sheet-title">Why it matters</h3>
          <p className="mt-1 text-[15px] leading-snug text-ink-soft">{spec.why}</p>
        </div>
        <div className="sheet p-5">
          <h3 className="sheet-title">How it is measured</h3>
          <p className="mt-1 text-[15px] leading-snug text-ink-soft">{spec.how}</p>
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
      <section className="sheet p-5">
        <h3 className="text-[28px] leading-tight tracking-[-0.04em]">{info?.label}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-[15px]">
          <StatusMark level={METRIC_MARK[regionStatus(metrics, sel, sel === "head_eyes" && facialFlag)] ?? "none"} size={13} />
          {MARK_NAME[METRIC_MARK[regionStatus(metrics, sel, sel === "head_eyes" && facialFlag)] ?? "none"]}
        </p>
        <p className="mt-2 text-[15px] leading-snug text-ink-soft">{info?.description}</p>
        <div className="mt-3 divide-y divide-rule">
          {inRegion.map(([k, m]) => (
            <MetricRow key={k} k={k} m={m} onClick={() => onSection("trends", { metric: k })} />
          ))}
          {sel === "head_eyes" && (
            <button className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[15px] hover:bg-water" onClick={() => onSection("facial")}>
              Facial geometry:
              <StatusMark level={facialFlag ? "watch" : "clear"} size={13} />
              <span className={facialFlag ? "text-st-watch" : "text-st-clear"}>{insights.latest?.facial?.status?.replace("_", " ") ?? "no scan"}</span>
              <ChevronRight size={16} className="ml-auto" />
            </button>
          )}
          {!inRegion.length && sel !== "head_eyes" && <p className="px-3 py-2 text-[15px] text-ink-soft">No direct sensor in this region; see well-being and questionnaire data.</p>}
        </div>
        {obs.length > 0 && (
          <div className="mt-4 space-y-2">
            {obs.map((o, i) => (
              <div key={i} className="rounded-[20px] bg-water p-4 text-[15px]">
                <div className="flex items-center gap-2" style={{ color: SEVERITY_COLOR[o.severity] }}>
                  <StatusMark level={SEVERITY_MARK[o.severity]} size={13} />
                  {o.title}
                </div>
                <p className="mt-1 leading-snug text-ink-soft">{o.explanation}</p>
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
    return <p className="text-[15px] text-ink-soft">No facial observations yet. They are captured from the real webcam during enrollment and each check-in.</p>;
  return (
    <div className="flex flex-col gap-4">
      {latest?.comparison && (
        <section className="sheet p-5">
          <h3 className="sheet-title">Latest scan</h3>
          <p className="label">{fmtTime(latest.t)}</p>
          <p className="mt-2 text-[15px] leading-snug">{latest.comparison.explanation ?? latest.comparison.message}</p>
          <div className="mt-3 flex justify-end text-[13px] text-ink-soft">now vs reference</div>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {Object.entries(latest.comparison.features ?? {}).map(([k, f]) => (
              <button key={k} onClick={() => setSel(k)} className={`flex items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-left text-[15px] ${sel === k ? "bg-cap-yellow" : "bg-water hover:bg-cap-yellow/40"}`}>
                <span className={`flex items-center gap-1.5 ${f.flagged ? "text-st-watch" : ""}`}>
                  {f.flagged && <StatusMark level="watch" size={13} />}
                  {f.label}
                </span>
                <span className="text-[13px] text-ink-soft">
                  {f.current.toFixed(3)} vs {f.reference.toFixed(3)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="sheet p-5">
        <div className="flex flex-wrap gap-1.5">
          {keys.map((k) => (
            <button key={k} onClick={() => setSel(k)} className={`chip min-h-[36px] ${sel === k ? "bg-cap-yellow" : "bg-water hover:bg-cap-yellow/40"}`}>
              {insights.facial_features[k].label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <TrendChart points={series} unit={insights.facial_features[sel].unit} decimals={3} />
        </div>
        <p className="mt-1 text-[13px] text-ink-soft">
          {insights.facial_features[sel].description} Hollow markers are enrollment reference scans.
        </p>
      </section>
      <p className="text-[13px] text-ink-soft">
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
  if (!latest) return <p className="text-[15px] text-ink-soft">No VOC fingerprints yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[20px] bg-cap-yellow px-5 py-3 text-[15px] leading-snug">
        Experimental research feature with a simulated e-nose. It tracks change from your own pattern only — it does not measure hormones or diagnose anything.
      </div>
      {a && (
        <section className="sheet p-5">
          <h3 className="sheet-title">Latest fingerprint</h3>
          <p className="label">{fmtTime(latest.t)}</p>
          <p className="mt-2 text-[15px] leading-snug">{a.explanation ?? a.message}</p>
          {a.similarity != null && <p className="mt-1 text-[13px] text-ink-soft">Similarity to baseline {a.similarity}% · history n={a.n_history}</p>}
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="sheet p-5">
          <h3 className="sheet-title">Channel deviation (robust z)</h3>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={bars}>
                <CartesianGrid stroke="rgba(44,46,42,0.1)" vertical={false} />
                <XAxis dataKey="ch" stroke="#5E6158" fontSize={12} />
                <YAxis stroke="#5E6158" fontSize={12} />
                <Tooltip cursor={{ fill: "rgba(44,46,42,0.06)" }} contentStyle={{ background: "#FFFFFF", border: "none", borderRadius: 16, fontSize: 13, color: "#2C2E2A", boxShadow: "0 6px 20px rgba(44,46,42,0.16)" }} />
                <Bar dataKey="z" isAnimationActive={false}>
                  {bars.map((b, i) => (
                    <Cell key={i} fill={Math.abs(b.z) >= 3.5 ? "#8A5A00" : "#2BA0FF"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="sheet p-5">
          <h3 className="sheet-title">Pattern map (PCA of your history)</h3>
          <div className="h-52">
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid stroke="rgba(44,46,42,0.1)" />
                <XAxis dataKey="x" type="number" stroke="#5E6158" fontSize={12} />
                <YAxis dataKey="y" type="number" stroke="#5E6158" fontSize={12} />
                <ZAxis range={[40, 40]} />
                <Scatter data={scatter} isAnimationActive={false}>
                  {scatter.map((p, i) => (
                    <Cell key={i} fill={p.kind === "current" ? "#2C2E2A" : "#2BA0FF"} fillOpacity={p.kind === "current" ? 1 : 0.55} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[13px] text-ink-soft">Blue: previous scans. Ink: current scan.</p>
        </section>
      </div>
      {a?.possible_interference && (
        <section className="sheet p-5">
          <h3 className="sheet-title">Possible measurement interference</h3>
          <ul className="mt-2 list-disc pl-5 text-[15px] text-ink-soft">
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
      <section className="sheet flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="sheet-title">Weekly blood assessment</h3>
          <p className="mt-1 text-[15px]">
            Next due {fmtDate(s.next_due)} · status <span className={s.due_now ? "rounded-full bg-cap-yellow px-2.5 py-0.5" : ""}>{s.status}</span>
          </p>
        </div>
        <p className="text-[13px] text-ink-soft">Demo interval: every {s.interval_days} days (configurable, not an official protocol).</p>
      </section>
      {latest ? (
        <>
          <section className="sheet overflow-x-auto p-5">
            <h3 className="sheet-title">Latest panel</h3>
            <p className="label">{fmtDate(latest.completed_at)} · {latest.analyzer}</p>
            <table className="mt-2 w-full text-[15px] tabular-nums">
              <thead className="text-left text-[13px] text-ink-soft">
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
                    <tr key={k} className={`cursor-pointer border-t border-rule hover:bg-water ${sel === k ? "bg-cap-yellow/40" : ""}`} onClick={() => setSel(k)}>
                      <td className="py-2">{r.label}</td>
                      <td className={out ? "text-st-watch" : undefined}>
                        <span className="inline-flex items-center gap-1.5">
                          {out && <StatusMark level="watch" size={13} />}
                          {r.value} {r.unit}
                        </span>
                      </td>
                      <td className="text-ink-soft">{prev?.results[k]?.value ?? "—"}</td>
                      <td className="text-ink-soft">
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
          <section className="sheet p-5">
            <h3 className="sheet-title">{latest.results[sel]?.label} history</h3>
            <TrendChart points={series} unit={latest.results[sel]?.unit ?? ""} refLow={latest.results[sel]?.ref_low} refHigh={latest.results[sel]?.ref_high} />
          </section>
        </>
      ) : (
        <p className="text-[15px] text-ink-soft">No lab results yet.</p>
      )}
    </div>
  );
}

function GuidanceList({ insights }: { insights: Insights }) {
  const items = insights.latest?.guidance ?? [];
  if (!items.length) return <p className="text-[15px] text-ink-soft">No guidance recorded for the latest check-in.</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((g) => (
        <section key={g.id} className="sheet p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[22px] leading-tight tracking-[-0.03em]">{g.title}</h3>
            <span className="chip shrink-0 bg-cap-lilac">{g.tier}</span>
          </div>
          <p className="mt-1 text-[15px] leading-snug text-ink-soft">{g.spoken}</p>
          <ul className="mt-2 list-disc pl-5 text-[15px] leading-snug">
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-ink-soft">
            Why: {g.why}{" "}
            <a className="text-ink underline" href={g.source} target="_blank" rel="noreferrer">
              source
            </a>{" "}
            · demonstration content, not clinically reviewed
          </p>
        </section>
      ))}
    </div>
  );
}
