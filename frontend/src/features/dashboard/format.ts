import type { Severity, StatusLevel } from "../../types";

export const STATUS_COLOR: Record<StatusLevel, string> = {
  clear: "#4ade80",
  watch: "#fbbf24",
  review: "#fb923c",
  urgent: "#f87171",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  info: "#8b97b3",
  watch: "#fbbf24",
  review: "#fb923c",
  urgent: "#f87171",
};

export const METRIC_STATUS_COLOR: Record<string, string> = {
  normal: "#4ade80",
  watch: "#fbbf24",
  notable: "#fb923c",
  no_baseline: "#8b97b3",
  context_excluded: "#8b97b3",
};

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function relTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.max(0, Math.round(s))}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
