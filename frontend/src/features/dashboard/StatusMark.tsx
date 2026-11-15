import type { Severity, StatusLevel } from "../../types";
import { STATUS_COLOR } from "./format";

export type MarkLevel = StatusLevel | "none";

const SHAPE: Record<MarkLevel, string> = {
  clear: "M8 1.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13Z",
  watch: "M8 1.5L15 14H1Z",
  review: "M8 0.8L15.2 8L8 15.2L0.8 8Z",
  urgent: "M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2Z",
  none: "M8 2.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 0 1 0-11Z",
};

export const MARK_NAME: Record<MarkLevel, string> = {
  clear: "within your usual range",
  watch: "worth a closer look",
  review: "notable change",
  urgent: "urgent",
  none: "no baseline",
};

/**
 * Status as shape plus colour, so it never relies on colour alone:
 * circle = clear, triangle = watch, diamond = review, octagon = urgent, ring = no baseline.
 */
export function StatusMark({ level, size = 14, className = "", color }: { level: MarkLevel; size?: number; className?: string; color?: string }) {
  const none = level === "none";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`shrink-0 ${className}`} role="img" aria-label={MARK_NAME[level]}>
      <path d={SHAPE[level]} fill={none ? "none" : color ?? STATUS_COLOR[level]} stroke={none ? color ?? "#5E6158" : "none"} strokeWidth={1.6} />
    </svg>
  );
}

export const METRIC_MARK: Record<string, MarkLevel> = {
  normal: "clear",
  watch: "watch",
  notable: "review",
  no_baseline: "none",
  context_excluded: "none",
};

export const SEVERITY_MARK: Record<Severity, MarkLevel> = { info: "none", watch: "watch", review: "review", urgent: "urgent" };
