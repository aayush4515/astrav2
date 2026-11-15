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
export function TrendChart({ points, unit, baseline, refLow, refHigh, color = "#2C2E2A", height = 220, decimals = 1 }: Props) {
  const data = points.filter((p) => p.valid && p.v != null).map((p) => ({ t: new Date(p.t).getTime(), v: p.v, ref: p.context === "reference" }));
  if (!data.length) return <div className="flex h-40 items-center justify-center text-[15px] text-ink-soft">No measurements yet.</div>;
  const vals = data.map((d) => d.v);
  const lo = Math.min(...vals, baseline ? baseline.median - 2.5 * baseline.spread : Infinity);
  const hi = Math.max(...vals, baseline ? baseline.median + 2.5 * baseline.spread : -Infinity);
  const pad = (hi - lo) * 0.12 || 1;
  // Short histories (e.g. today's facial scans) need time-of-day ticks rather than dates.
  const shortSpan = data.length > 1 && data[data.length - 1].t - data[0].t < 2 * 86400_000;
  const tick = (t: number) =>
    shortSpan ? new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : fmtDate(new Date(t).toISOString());
  return (
    <div style={{ height }} role="img" aria-label={`Trend chart in ${unit}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="rgba(44,46,42,0.1)" vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={tick} stroke="#5E6158" fontSize={12} tickLine={false} minTickGap={24} />
          <YAxis domain={[lo - pad, hi + pad]} stroke="#5E6158" fontSize={12} tickLine={false} width={46} tickFormatter={(v) => Number(v).toFixed(decimals)} />
          {baseline && (
            <ReferenceArea y1={baseline.median - 2 * baseline.spread} y2={baseline.median + 2 * baseline.spread} fill="#2C2E2A" fillOpacity={0.09} stroke="none" />
          )}
          {baseline && <ReferenceLine y={baseline.median} stroke="#2C2E2A" strokeOpacity={0.5} strokeDasharray="4 4" />}
          {refLow != null && <ReferenceLine y={refLow} stroke="#8A5A00" strokeOpacity={0.7} strokeDasharray="2 6" />}
          {refHigh != null && <ReferenceLine y={refHigh} stroke="#8A5A00" strokeOpacity={0.7} strokeDasharray="2 6" />}
          <Tooltip
            contentStyle={{ background: "#FFFFFF", border: "none", borderRadius: 16, fontSize: 13, color: "#2C2E2A", boxShadow: "0 6px 20px rgba(44,46,42,0.16)" }}
            labelFormatter={(t) => fmtTime(new Date(Number(t)).toISOString())}
            formatter={(v: number) => [`${v} ${unit}`, "Value"]}
          />
          <Line
            type="linear"
            dataKey="v"
            stroke={color}
            strokeWidth={2.25}
            strokeOpacity={1}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: { ref: boolean } }) => (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={props.payload?.ref ? 4 : 2.5}
                fill={props.payload?.ref ? "#F5F1E4" : color}
                stroke={color}
                strokeWidth={props.payload?.ref ? 1.5 : 0}
              />
            )}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
