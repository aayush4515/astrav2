import { AnimatePresence, motion } from "framer-motion";
import { LogOut, ScanFace, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useCamera } from "../hooks/useCamera";
import { api } from "../services/api";
import type { AuthSession, DeviceId, Insights } from "../types";
import { BoothView } from "../features/booth/BoothView";
import type { BoothPhase } from "../features/booth/Booth3D";
import { StandbyPanel } from "../features/booth/StandbyPanel";
import { StagePanel, ProgressSteps } from "../features/check-in/StagePanel";
import { useCheckinFlow, type FlowState } from "../features/check-in/useCheckinFlow";
import { DetailsPanel } from "../features/dashboard/DetailsPanel";
import { useEmergency } from "../features/emergency/EmergencyContext";
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

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col">
      {!inSession ? (
        <section className="relative flex flex-1 flex-col">
          {/* Booth fills the screen on mobile and the right ~60% on desktop. */}
          <div className="absolute inset-x-0 top-0 h-[46%] lg:inset-y-0 lg:left-[38%] lg:right-0 lg:h-auto">
            <BoothView
              activeDevice={recognition.result?.status === "matching" ? "face_camera" : null}
              phase={recognition.result?.status === "matching" ? "identifying" : "standby"}
              selected={selectedDevice}
              onSelect={setSelectedDevice}
            />
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-void via-void/85 to-transparent lg:block" />
          <div className="relative z-10 mt-auto flex min-h-[56%] flex-col bg-gradient-to-t from-void via-void to-void/0 px-6 pb-8 pt-16 lg:mt-0 lg:min-h-0 lg:w-[44%] lg:flex-1 lg:bg-none lg:px-12 lg:py-10 xl:px-16">
            <StandbyPanel
              camera={camera}
              active={boothActive}
              headline={recog}
              recognition={recognition.result}
              engineError={recognition.engineError}
              needsVoiceGesture={boothActive && needsGesture && !voice.unlocked}
              onActivate={activate}
              onDeactivate={deactivate}
              onEnableVoice={() => voice.unlock().then(() => setNeedsGesture(false))}
            />
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
    <section className={`relative grid flex-1 gap-4 p-4 transition-[grid-template-columns] duration-500 lg:h-[calc(100vh-64px)] lg:grid-rows-[minmax(0,1fr)] lg:p-6 ${compactBooth ? "lg:grid-cols-[0.8fr_1.2fr]" : "lg:grid-cols-[1.25fr_1fr]"}`}>
      <motion.div layout className={`panel relative overflow-hidden ${compactBooth ? "min-h-[260px] lg:min-h-0" : "min-h-[380px]"}`}>
        <BoothView activeDevice={flow.activeDevice} phase={phase} progress={flow.blood?.phase === "analyzing" ? 0.6 : 0} showInfo={false} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-void/90 to-transparent p-4 pb-10">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-glow/15 text-sm font-semibold text-cyan-soft ring-1 ring-cyan-glow/40">
            {(flow.session?.preferred_name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="leading-tight">
            <div className="text-lg font-semibold">{flow.checkin?.astronaut.display_name ?? flow.session?.display_name}</div>
            <div className="label flex items-center gap-1.5">
              {flow.session?.method === "operator_recovery" ? (
                <>
                  <ShieldAlert size={11} className="text-caution" /> Operator recovery session
                </>
              ) : (
                <>
                  <ScanFace size={11} className="text-ok" /> Face-authenticated
                </>
              )}
            </div>
          </div>
        </div>
        {flow.activity && (
          <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-line bg-void/70 px-3 py-1.5 backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${flow.activeDevice ? "animate-breathe bg-cyan-glow" : "bg-ink-faint"}`} />
            <span className="text-xs text-ink-muted">{flow.activity}</span>
          </div>
        )}
      </motion.div>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-6">
          <ProgressSteps stage={flow.stage} />
          <button className="btn-ghost shrink-0 px-3 py-1.5 text-xs" onClick={onEnd}>
            <LogOut size={13} /> End session
          </button>
        </div>
        <div className="panel flex flex-1 flex-col overflow-y-auto p-5">
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
        {flow.faults.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-caution">
            <ShieldAlert size={14} /> {flow.faults.join(" · ")}
          </div>
        )}
      </div>
      <AnimatePresence>
        {flow.details.open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-void/60 backdrop-blur-[2px]"
            onClick={() => setDetails({ open: false })}
            aria-hidden
          />
        )}
        {flow.details.open && (
          <motion.aside
            key="drawer"
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
