import type { Severity, StatusLevel } from "../../types";

export const STATUS_COLOR: Record<StatusLevel, string> = {
  clear: "#1E6B35",
  watch: "#8A5A00",
  review: "#B23E0A",
  urgent: "#C8102E",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  info: "#4A4D46",
  watch: "#8A5A00",
  review: "#B23E0A",
  urgent: "#C8102E",
};

export const METRIC_STATUS_COLOR: Record<string, string> = {
  normal: "#1E6B35",
  watch: "#8A5A00",
  notable: "#B23E0A",
  no_baseline: "#5E6158",
  context_excluded: "#5E6158",
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
