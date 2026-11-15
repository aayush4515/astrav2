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
import { Lobe } from "../components/Lobe";
import { StatusMark } from "../features/dashboard/StatusMark";
import { voice } from "../features/voice/VoiceEngine";

const BOOTH_KEY = "astra.boothActive";

function boothPhase(stage: FlowState["stage"]): BoothPhase {
  if (stage === "STANDBY") return "standby";
  if (stage === "VOICE_QUESTIONNAIRE" || stage === "PROCESSING") return "conversation";
  if (stage === "RESULTS_READY" || stage === "VOICE_SUMMARY" || stage === "COMPLETED") return "results";
  return "scanning";
}

// `color` outlines the detected face on the camera preview; the headline itself stays ink.
const RECOG_TEXT: Record<string, { text: string; color: string }> = {
  no_face: { text: "Approach for health check-in", color: "#F5F1E4" },
  multiple_faces: { text: "One astronaut at a time, please", color: "#F5E211" },
  low_quality: { text: "Hold still and face the camera", color: "#EBC1FF" },
  unknown: { text: "Face not recognized", color: "#F5E211" },
  ambiguous: { text: "Identity uncertain — face the camera", color: "#F5E211" },
  no_enrollments: { text: "No astronauts enrolled yet", color: "#F5E211" },
  matching: { text: "Verifying identity…", color: "#2BA0FF" },
  confirmed: { text: "Identity confirmed", color: "#8ED462" },
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
    ? { text: "Session complete · see you next time", color: "#8ED462" }
    : recognition.result
      ? RECOG_TEXT[recognition.result.status] ?? RECOG_TEXT.no_face
      : RECOG_TEXT.no_face;

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col">
      {!inSession ? (
        <section className="relative flex flex-1 flex-col">
          {/* Booth sits above the lobe on mobile and fills the right ~60% on desktop. */}
          <div className="relative order-1 h-[42vh] min-h-[280px] lg:absolute lg:inset-y-0 lg:left-[38%] lg:right-0 lg:h-auto">
            <BoothView
              activeDevice={recognition.result?.status === "matching" ? "face_camera" : null}
              phase={recognition.result?.status === "matching" ? "identifying" : "standby"}
              selected={selectedDevice}
              onSelect={setSelectedDevice}
            />
          </div>
          <div className="relative z-10 flex flex-1 flex-col overflow-hidden px-6 pb-12 pt-12 lg:w-[46%] lg:overflow-visible lg:py-10 lg:pl-12 lg:pr-[5%] xl:pl-16">
            <Lobe seed={11} swell={0.14} square={0.6} className="-left-[14%] -right-[10%] top-0 bottom-0 lg:-left-[34%] lg:-right-[15%] lg:-top-[3%] lg:bottom-[-12%]" />
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
    <section className={`relative grid flex-1 gap-4 p-4 transition-[grid-template-columns] duration-500 lg:h-[calc(100vh-64px)] lg:flex-none lg:grid-rows-[minmax(0,1fr)] lg:p-6 ${compactBooth ? "lg:grid-cols-[0.8fr_1.2fr]" : "lg:grid-cols-[1.25fr_1fr]"}`}>
      <motion.div layout className={`relative overflow-hidden rounded-[32px] ${compactBooth ? "min-h-[260px] lg:min-h-0" : "min-h-[380px]"}`}>
        <BoothView activeDevice={flow.activeDevice} phase={phase} progress={flow.blood?.phase === "analyzing" ? 0.6 : 0} showInfo={false} />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
          <span className="chip bg-cap-yellow px-4 py-2 text-[17px]">{flow.checkin?.astronaut.display_name ?? flow.session?.display_name}</span>
          <span className="chip bg-sheet">
            {flow.session?.method === "operator_recovery" ? (
              <>
                <ShieldAlert size={14} /> Operator recovery session
              </>
            ) : (
              <>
                <ScanFace size={14} /> Face-authenticated
              </>
            )}
          </span>
        </div>
        {flow.activity && (
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-sheet px-4 py-2">
            <span className={`h-2.5 w-2.5 rounded-full ${flow.activeDevice ? "animate-breathe bg-cap-coral" : "bg-ink-faint"}`} />
            <span className="text-[15px] text-ink">{flow.activity}</span>
          </div>
        )}
      </motion.div>
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <ProgressSteps stage={flow.stage} />
          <button className="btn-ghost shrink-0" onClick={onEnd} aria-label="End session">
            <LogOut size={15} /> End<span className="hidden sm:inline"> session</span>
          </button>
        </div>
        <div className="relative flex min-h-[420px] flex-1 flex-col lg:min-h-0">
          <Lobe seed={23} swell={0.06} square={0.85} className="-inset-x-[3%] -inset-y-[2%]" />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-[6%] py-[5%]">
            <StagePanel flow={flow} camera={camera} onDetails={onDetails} />
          </div>
        </div>
        {flow.stage !== "VOICE_QUESTIONNAIRE" && flow.stage !== "PROCESSING" && (
          <div className="sheet flex flex-col items-center gap-3 p-4 sm:flex-row sm:gap-4 sm:p-3 sm:pr-6">
            <VoiceOrb size={56} />
            <div className="min-w-0 flex-1">
              <Captions max={2} />
            </div>
          </div>
        )}
        {flow.faults.length > 0 && (
          <div className="flex items-start gap-2 text-[15px] text-st-watch">
            <StatusMark level="watch" className="mt-1" /> {flow.faults.join(" · ")}
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
            className="fixed inset-0 z-30 bg-ink/40"
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
            className="fixed inset-y-0 right-0 z-40 w-full max-w-3xl bg-water shadow-[-16px_0_48px_rgba(44,46,42,0.22)]"
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
