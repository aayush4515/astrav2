import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "../../types";
import { fmtDate, fmtTime } from "./format";

interface Props {
  points: SeriesPoint[];
  unit: string;
  baseline?: { median: number; spread: number } | null;
  refLow?: number | null;
  refHigh?: number | null;
  color?: string;
  height?: number;
  decimals?: number;
}

/** Metric history with the astronaut's personal baseline band (median ± 2 robust SD). */
export function TrendChart({ points, unit, baseline, refLow, refHigh, color = "#5ee7ff", height = 220, decimals = 1 }: Props) {
  const data = points.filter((p) => p.valid).map((p) => ({ t: new Date(p.t).getTime(), v: p.v }));
  if (!data.length) return <div className="flex h-40 items-center justify-center text-sm text-ink-faint">No measurements yet.</div>;
  const vals = data.map((d) => d.v);
  const lo = Math.min(...vals, baseline ? baseline.median - 2.5 * baseline.spread : Infinity);
  const hi = Math.max(...vals, baseline ? baseline.median + 2.5 * baseline.spread : -Infinity);
  const pad = (hi - lo) * 0.12 || 1;
  return (
    <div style={{ height }} role="img" aria-label={`Trend chart in ${unit}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="rgba(120,170,255,0.08)" vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => fmtDate(new Date(t).toISOString())} stroke="#5b6785" fontSize={11} tickLine={false} />
          <YAxis domain={[lo - pad, hi + pad]} stroke="#5b6785" fontSize={11} tickLine={false} width={46} tickFormatter={(v) => Number(v).toFixed(decimals)} />
          {baseline && (
            <ReferenceArea y1={baseline.median - 2 * baseline.spread} y2={baseline.median + 2 * baseline.spread} fill={color} fillOpacity={0.07} stroke="none" />
          )}
          {baseline && <ReferenceLine y={baseline.median} stroke={color} strokeOpacity={0.4} strokeDasharray="4 4" />}
          {refLow != null && <ReferenceLine y={refLow} stroke="#fbbf24" strokeOpacity={0.35} strokeDasharray="2 6" />}
          {refHigh != null && <ReferenceLine y={refHigh} stroke="#fbbf24" strokeOpacity={0.35} strokeDasharray="2 6" />}
          <Tooltip
            contentStyle={{ background: "#0a1224", border: "1px solid rgba(120,170,255,0.2)", borderRadius: 10, fontSize: 12 }}
            labelFormatter={(t) => fmtTime(new Date(Number(t)).toISOString())}
            formatter={(v: number) => [`${v} ${unit}`, "Value"]}
          />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
