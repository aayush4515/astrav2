import { ShieldAlert } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, type HealthStatus } from "../services/api";
import { EmergencyOverlay } from "../features/emergency/EmergencyOverlay";
import { EmergencyProvider, useEmergency } from "../features/emergency/EmergencyContext";
import { voice } from "../features/voice/VoiceEngine";
import AstraHome from "../pages/AstraHome";

const EnrollPage = lazy(() => import("../pages/EnrollPage"));
const MissionControlPage = lazy(() => import("../pages/MissionControlPage"));
const OperatorPage = lazy(() => import("../pages/OperatorPage"));

export default function App() {
  return (
    <BrowserRouter>
      <EmergencyProvider>
        <Shell />
      </EmergencyProvider>
    </BrowserRouter>
  );
}

function Shell() {
  const loc = useLocation();
  const ground = loc.pathname.startsWith("/mission-control");
  return (
    <div className="grid-bg flex min-h-screen flex-col">
      <TopBar ground={ground} />
      <main className="flex flex-1 flex-col">
        <Suspense fallback={<div className="p-8 label">Loading…</div>}>
          <Routes>
            <Route path="/" element={<AstraHome />} />
            <Route path="/booth" element={<Navigate to="/" replace />} />
            <Route path="/enroll" element={<EnrollPage />} />
            <Route path="/emergency" element={<EmergencyRoute />} />
            <Route path="/mission-control" element={<MissionControlPage />} />
            <Route path="/operator" element={<OperatorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <EmergencyOverlay />
    </div>
  );
}

function TopBar({ ground }: { ground: boolean }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const load = () =>
      api
        .health()
        .then((h) => (setHealth(h), setOffline(false)))
        .catch(() => setOffline(true));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  const engines = health?.engines ?? {};
  const allReady = Object.values(engines).every((e) => e.ready);
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-line px-5">
      <Link to="/" className="flex items-center gap-3" aria-label="ASTRA home">
        <img src="/astra.svg" alt="" className="h-7 w-7" />
        <div className="leading-tight">
          <div className="font-semibold tracking-[0.3em]">ASTRA</div>
          <div className="font-mono text-[10px] text-ink-faint">{ground ? "GROUND SEGMENT" : health ? `${health.mission.name.toUpperCase()} · DAY ${health.mission.day}` : "SPACE TELEHEALTH"}</div>
        </div>
      </Link>
      <div className="hidden items-center gap-2 md:flex" title={Object.entries(engines).map(([k, v]) => `${k}: ${v.ready ? "ready" : v.error ?? "loading"}`).join("\n")}>
        <span className={`h-2 w-2 rounded-full ${offline ? "bg-alert" : allReady ? "bg-ok" : "bg-caution animate-breathe"}`} />
        <span className="label">{offline ? "Backend offline" : allReady ? "All systems local · offline-capable" : "Loading local models"}</span>
      </div>
      {!ground ? <EmergencyButton /> : <Link to="/operator" className="btn-ghost text-xs">Operator tools</Link>}
    </header>
  );
}

/** Always-available physical-equivalent emergency control. No authentication required. */
function EmergencyButton() {
  const { activate, event } = useEmergency();
  return (
    <button
      className="btn-danger px-4 py-2 font-semibold"
      onClick={async () => {
        await voice.unlock().catch(() => undefined);
        activate({ trigger: "button" });
      }}
      disabled={!!event && event.status === "active"}
      aria-label="Activate emergency assistance"
    >
      <ShieldAlert size={16} /> Emergency
    </button>
  );
}

function EmergencyRoute() {
  const { activate, event } = useEmergency();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <ShieldAlert size={48} className="text-alert" />
      <h1 className="text-3xl font-semibold">Emergency assistance</h1>
      <p className="max-w-md text-ink-muted">Available at all times, without facial recognition. Activating alerts the whole crew and queues a critical report for Mission Control.</p>
      {!event && (
        <button className="btn-danger px-8 py-4 text-lg" onClick={() => voice.unlock().finally(() => activate({ trigger: "button" }))}>
          Activate emergency
        </button>
      )}
    </div>
  );
}
