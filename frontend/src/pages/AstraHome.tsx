import { AnimatePresence, motion } from "framer-motion";
import { Camera as CameraIcon, LogOut, Power, ScanFace, ShieldAlert, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCamera } from "../hooks/useCamera";
import { api } from "../services/api";
import type { AuthSession, DeviceId, Insights } from "../types";
import { BoothView } from "../features/booth/BoothView";
import type { BoothPhase } from "../features/booth/Booth3D";
import { StagePanel, ProgressSteps } from "../features/check-in/StagePanel";
import { useCheckinFlow, type FlowState } from "../features/check-in/useCheckinFlow";
import { DetailsPanel } from "../features/dashboard/DetailsPanel";
import { useEmergency } from "../features/emergency/EmergencyContext";
import { CameraView } from "../features/facial-analysis/CameraView";
import { useRecognitionLoop } from "../features/identity/useRecognitionLoop";
import { Captions } from "../features/voice/Captions";
import { VoiceOrb } from "../features/voice/VoiceOrb";
import { voice } from "../features/voice/VoiceEngine";

const BOOTH_KEY = "astra.boothActive";

function boothPhase(stage: FlowState["stage"]): BoothPhase {
  if (stage === "STANDBY") return "standby";
  if (stage === "VOICE_QUESTIONNAIRE" || stage === "PROCESSING") return "conversation";
  if (stage === "RESULTS_READY" || stage === "VOICE_SUMMARY" || stage === "COMPLETED") return "results";
  return "scanning";
}

const RECOG_TEXT: Record<string, { text: string; color: string }> = {
  no_face: { text: "Approach for health check-in", color: "#e8eefc" },
  multiple_faces: { text: "One astronaut at a time, please", color: "#fbbf24" },
  low_quality: { text: "Hold still and face the camera", color: "#8fdcff" },
  unknown: { text: "Face not recognized", color: "#fbbf24" },
  ambiguous: { text: "Identity uncertain — face the camera", color: "#fbbf24" },
  no_enrollments: { text: "No astronauts enrolled yet", color: "#fbbf24" },
  matching: { text: "Verifying identity…", color: "#5ee7ff" },
  confirmed: { text: "Identity confirmed", color: "#4ade80" },
};

/**
 * The single astronaut-facing experience: stand-by → automatic recognition → guided check-in →
 * summary → detailed insights on demand. No navigation is required.
 */
export default function AstraHome() {
  const camera = useCamera();
  const emergency = useEmergency();
  const location = useLocation();
  const [boothActive, setBoothActive] = useState(() => {
    try {
      return sessionStorage.getItem(BOOTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [needsGesture, setNeedsGesture] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<DeviceId | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);

  const onEmergency = useCallback((transcript: string) => emergency.activate({ trigger: "voice", transcript }), [emergency]);
  const { state: flow, begin, end, setDetails } = useCheckinFlow({ camera, onEmergency });
  const inSession = flow.stage !== "STANDBY";

  const onConfirmed = useCallback((s: AuthSession) => {
    begin(s);
  }, [begin]);
  const recognition = useRecognitionLoop(camera, boothActive && !inSession && !emergency.event, onConfirmed);

  // Activating the booth is the one-time consented gesture: camera + audio playback permission.
  const activate = useCallback(async () => {
    await voice.unlock().catch(() => undefined);
    const ok = await camera.start();
    setNeedsGesture(false);
    if (ok) {
      setBoothActive(true);
      try {
        sessionStorage.setItem(BOOTH_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }, [camera]);

  const deactivate = useCallback(() => {
    camera.stop();
    setBoothActive(false);
    try {
      sessionStorage.removeItem(BOOTH_KEY);
    } catch {
      /* ignore */
    }
  }, [camera]);

  // Re-open the camera after a reload if the booth was previously activated (audio still needs a gesture).
  useEffect(() => {
    if (boothActive && camera.state === "off") camera.start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Operator recovery sessions arrive via navigation state.
  useEffect(() => {
    const rec = (location.state as { recovery?: AuthSession } | null)?.recovery;
    if (rec && !inSession) {
      window.history.replaceState({}, "");
      voice.unlock().then(() => begin(rec));
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load detailed insights whenever the details surface opens.
  useEffect(() => {
    if (!flow.details.open || !flow.session) return;
    api.insights().then(setInsights).catch(() => setInsights(null));
  }, [flow.details.open, flow.session, flow.result]);

  const recog = recognition.awaitingDeparture
    ? { text: "Session complete · see you next time", color: "#4ade80" }
    : recognition.result
      ? RECOG_TEXT[recognition.result.status] ?? RECOG_TEXT.no_face
      : RECOG_TEXT.no_face;
  const boxes = (recognition.result?.faces ?? []).map((f) => f.bbox);

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col">
      {!inSession ? (
        <section className="relative flex flex-1 flex-col">
          <div className="absolute inset-0">
            <BoothView activeDevice={recognition.result?.status === "matching" ? "face_camera" : null} phase={recognition.result?.status === "matching" ? "identifying" : "standby"} selected={selectedDevice} onSelect={setSelectedDevice} />
          </div>
          <div className="pointer-events-none relative z-10 mt-auto flex flex-col items-center gap-4 bg-gradient-to-t from-void via-void/80 to-transparent px-6 pb-10 pt-28 text-center">
            <AnimatePresence mode="wait">
              <motion.h1
                key={boothActive ? recog.text : "inactive"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-3xl font-light tracking-tight md:text-5xl"
                style={{ color: boothActive ? recog.color : undefined }}
              >
                {boothActive ? recog.text : "ASTRA health booth"}
              </motion.h1>
            </AnimatePresence>
            {boothActive && recognition.result?.status === "unknown" && (
              <p className="pointer-events-auto text-sm text-ink-muted">
                Not enrolled yet?{" "}
                <Link to="/enroll" className="text-cyan-soft underline">
                  One-time enrollment
                </Link>
              </p>
            )}
            {recognition.engineError && <p className="text-sm text-caution">Face engine unavailable: {recognition.engineError}</p>}
            {!boothActive && (
              <div className="pointer-events-auto flex flex-col items-center gap-3">
                <p className="max-w-md text-sm text-ink-muted">
                  Activate stand-by once to allow the camera and voice. After that, enrolled astronauts are recognized automatically — no login, no buttons.
                </p>
                <button className="btn-primary px-6 py-3 text-base" onClick={activate}>
                  <Power size={18} /> Activate booth
                </button>
                {camera.error && <p className="text-sm text-caution">{camera.error}</p>}
              </div>
            )}
            {boothActive && needsGesture && !voice.unlocked && (
              <button className="pointer-events-auto text-xs text-ink-faint underline" onClick={() => voice.unlock().then(() => setNeedsGesture(false))}>
                Tap once to enable ASTRA's voice (browser audio policy)
              </button>
            )}
          </div>
          {boothActive && (
            <div className="absolute bottom-6 right-6 z-10 hidden w-56 md:block">
              <CameraView camera={camera} boxes={boxes} boxColor={recog.color} className="aspect-[4/3]" label="Stand-by" />
              <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
                <span className="flex items-center gap-1">
                  <CameraIcon size={11} /> local processing only
                </span>
                <button className="hover:text-ink" onClick={deactivate}>
                  Deactivate
                </button>
              </div>
            </div>
          )}
          <div className="absolute bottom-6 left-6 z-10 flex gap-3 text-xs text-ink-faint">
            <Link to="/enroll" className="flex items-center gap-1 hover:text-ink">
              <UserPlus size={13} /> Enrollment
            </Link>
          </div>
        </section>
      ) : (
        <CheckinLayout
          flow={flow}
          camera={camera}
          onEnd={() => end("end", "ended by astronaut")}
          onDetails={() => setDetails({ open: true, section: "overview" })}
          insights={insights}
          setDetails={setDetails}
        />
      )}
    </div>
  );
}

function CheckinLayout({ flow, camera, onEnd, onDetails, insights, setDetails }: { flow: FlowState; camera: ReturnType<typeof useCamera>; onEnd: () => void; onDetails: () => void; insights: Insights | null; setDetails: (d: Partial<FlowState["details"]>) => void }) {
  const phase = boothPhase(flow.stage);
  const compactBooth = phase === "conversation" || phase === "results";
  return (
    <section className="relative grid flex-1 gap-4 p-4 lg:grid-cols-[1.25fr_1fr] lg:p-6">
      <motion.div layout className={`panel relative overflow-hidden ${compactBooth ? "min-h-[260px] lg:min-h-0" : "min-h-[380px]"}`}>
        <BoothView activeDevice={flow.activeDevice} phase={phase} progress={flow.blood?.phase === "analyzing" ? 0.6 : 0} showInfo={false} />
        <div className="absolute left-4 top-4 flex flex-col gap-1">
          <span className="label">{flow.session?.method === "operator_recovery" ? "Operator recovery session" : "Face-authenticated"}</span>
          <span className="text-xl font-semibold">{flow.checkin?.astronaut.display_name ?? flow.session?.display_name}</span>
        </div>
        {flow.activity && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2">
            <ScanFace size={14} className="text-cyan-glow" />
            <span className="text-sm text-ink-muted">{flow.activity}</span>
          </div>
        )}
      </motion.div>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <ProgressSteps stage={flow.stage} />
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onEnd}>
            <LogOut size={13} /> End session
          </button>
        </div>
        <div className="panel flex-1 overflow-y-auto p-5">
          <StagePanel flow={flow} camera={camera} onDetails={onDetails} />
        </div>
        {flow.stage !== "VOICE_QUESTIONNAIRE" && flow.stage !== "PROCESSING" && (
          <div className="panel flex items-center gap-4 p-3">
            <VoiceOrb size={56} />
            <div className="min-w-0 flex-1">
              <Captions max={2} />
            </div>
          </div>
        )}
        {flow.stage === "VOICE_QUESTIONNAIRE" && (
          <div className="px-2">
            <Captions max={2} />
          </div>
        )}
        {flow.faults.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-caution">
            <ShieldAlert size={14} /> {flow.faults.join(" · ")}
          </div>
        )}
      </div>
      <AnimatePresence>
        {flow.details.open && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            className="fixed inset-y-0 right-0 z-40 w-full max-w-3xl border-l border-line bg-deep/95 backdrop-blur-xl"
          >
            <DetailsPanel
              insights={insights}
              section={flow.details.section}
              metric={flow.details.metric}
              region={flow.details.region}
              onSection={(section, extra) => setDetails({ section, ...extra })}
              onClose={() => setDetails({ open: false })}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </section>
  );
}
