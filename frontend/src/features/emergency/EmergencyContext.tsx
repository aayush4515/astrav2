import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../services/api";
import type { EmergencyEvent } from "../../types";
import { voice } from "../voice/VoiceEngine";

interface EmergencyApi {
  event: EmergencyEvent | null;
  activate: (opts: { trigger: "voice" | "button"; transcript?: string; patientId?: string; protocolId?: string }) => Promise<void>;
  setEvent: (e: EmergencyEvent | null) => void;
  dismiss: () => void;
}

const Ctx = createContext<EmergencyApi | null>(null);

export function EmergencyProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<EmergencyEvent | null>(null);
  const activating = useRef(false);

  const activate = useCallback<EmergencyApi["activate"]>(async ({ trigger, transcript, patientId, protocolId }) => {
    if (activating.current) return;
    activating.current = true;
    voice.stopSpeaking();
    try {
      const ev = await api.emergencyActivate({ trigger, transcript, patient_id: patientId, protocol_id: protocolId });
      setEvent(ev);
    } catch (e) {
      // Even if the backend is unreachable, show the emergency interface with local protocol content.
      console.error(e);
    } finally {
      activating.current = false;
    }
  }, []);

  // Pick up an emergency triggered from another screen or tab.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const ev = await api.emergencyActive();
        if (alive && ev && (!event || ev.id !== event.id)) setEvent(ev);
      } catch {
        /* offline backend: keep current state */
      }
    };
    poll();
    const t = setInterval(poll, event ? 2500 : 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [event]);

  return <Ctx.Provider value={{ event, activate, setEvent, dismiss: () => setEvent(null) }}>{children}</Ctx.Provider>;
}

export function useEmergency() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEmergency outside provider");
  return c;
}
