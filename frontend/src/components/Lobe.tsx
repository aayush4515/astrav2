import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

/** Deterministic pseudo-random sequence so a lobe keeps its coastline across renders. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Closed Catmull-Rom curve through points, as cubic Béziers. */
function smooth(pts: [number, number][]) {
  const n = pts.length;
  const p = (i: number) => pts[(i + n) % n];
  let d = `M${p(0)[0].toFixed(2)} ${p(0)[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

/** Points on a superellipse (squarish when `square` > 0) pushed inward by a seeded swell. */
function blob(seed: number, cx: number, cy: number, rx: number, ry: number, swell: number, count: number, square = 0) {
  const r = rng(seed);
  const offset = r() * Math.PI * 2;
  const e = 1 - square * 0.7;
  const sq = (v: number) => Math.sign(v) * Math.abs(v) ** e;
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    const k = 1 - swell * r();
    pts.push([cx + sq(Math.cos(a)) * rx * k, cy + sq(Math.sin(a)) * ry * k]);
  }
  return smooth(pts);
}

interface Props {
  seed?: number;
  /** How far the coastline swells inward, 0–0.4. */
  swell?: number;
  /** Open the lobe in its middle so the ground shows through. */
  hole?: { cx: number; cy: number; rx: number; ry: number };
  /** 0 = round lobe, 1 = squarish lobe that can carry rectangular content. */
  square?: number;
  className?: string;
  fill?: string;
}

/**
 * The world's signature: a flat land lobe whose coastline divides the screen. Fills its
 * positioned parent (or the box `className` positions); settles in with a 0.4s overshoot (skipped under reduced motion).
 */
export function Lobe({ seed = 7, swell = 0.16, hole, square = 0.6, className = "", fill = "#8ED462" }: Props) {
  const reduce = useReducedMotion();
  const d = useMemo(() => {
    const outer = blob(seed, 50, 50, 50, 50, swell, 9, square);
    return hole ? `${outer} ${blob(seed * 31 + 3, hole.cx, hole.cy, hole.rx, hole.ry, 0.12, 7, 0.2)}` : outer;
  }, [seed, swell, hole, square]);
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute ${className || "inset-0"}`}
      initial={reduce ? false : { scale: 0.94, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <path d={d} fill={fill} fillRule="evenodd" />
      </svg>
    </motion.div>
  );
}
