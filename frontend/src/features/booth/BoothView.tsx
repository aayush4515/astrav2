import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cpu, X } from "lucide-react";
import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";
import type { DeviceId } from "../../types";
import type { BoothPhase } from "./Booth3D";
import { BOOTH_DEVICES } from "./devices";

const Booth3D = lazy(() => import("./Booth3D"));

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

class GLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface Props {
  activeDevice: DeviceId | null;
  phase: BoothPhase;
  selected?: DeviceId | null;
  onSelect?: (id: DeviceId | null) => void;
  progress?: number;
  showInfo?: boolean;
  className?: string;
}

export function BoothView({ activeDevice, phase, selected = null, onSelect, progress, showInfo = true, className = "" }: Props) {
  const reduce = useReducedMotion() ?? false;
  const webgl = useMemo(hasWebGL, []);
  const fallback = <BoothFallback activeDevice={activeDevice} onSelect={onSelect} />;
  const info = selected ? BOOTH_DEVICES[selected] : null;
  return (
    <div className={`relative h-full w-full ${className}`}>
      {webgl ? (
        <GLBoundary fallback={fallback}>
          <Suspense fallback={<div className="label flex h-full items-center justify-center">Initializing booth…</div>}>
            <Booth3D activeDevice={activeDevice} phase={phase} selected={selected} onSelect={onSelect} reduceMotion={reduce} progress={progress} />
          </Suspense>
        </GLBoundary>
      ) : (
        fallback
      )}
      <AnimatePresence>
        {showInfo && info && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="sheet absolute bottom-4 right-4 max-w-sm p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl leading-tight tracking-[-0.02em]">{info.label}</h3>
              <button className="-mr-1 -mt-1 rounded-full p-1.5 hover:bg-water" aria-label="Close device info" onClick={() => onSelect?.(null)}>
                <X size={18} />
              </button>
            </div>
            <span className="chip mt-2" style={{ background: info.color }}>
              {info.real ? "Real hardware in prototype" : "Simulated device"}
            </span>
            <p className="mt-3 text-[15px] leading-snug text-ink">{info.description}</p>
            <p className="mt-2 text-[13px] text-ink-soft">{info.measures}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Non-WebGL fallback: same devices, same activation state, as an accessible list. */
function BoothFallback({ activeDevice, onSelect }: { activeDevice: DeviceId | null; onSelect?: (id: DeviceId) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <Cpu />
      <p className="label">3D view unavailable (WebGL disabled) — booth devices</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.values(BOOTH_DEVICES).map((d) => (
          <button
            key={d.id}
            onClick={() => onSelect?.(d.id)}
            className="rounded-full px-4 py-2 text-left text-[15px] text-ink"
            style={{ background: activeDevice === d.id ? d.color : "#FFFFFF" }}
          >
            {activeDevice === d.id && (
              <>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink align-middle" aria-hidden />
                <span className="sr-only">Active: </span>
              </>
            )}
            {d.short}
          </button>
        ))}
      </div>
    </div>
  );
}
