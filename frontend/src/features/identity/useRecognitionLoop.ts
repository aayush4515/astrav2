import { useEffect, useRef, useState } from "react";
import type { Camera } from "../../hooks/useCamera";
import { api } from "../../services/api";
import type { AuthSession, RecognitionResult } from "../../types";

const CLIENT_ID = `booth-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Booth stand-by: send webcam frames to the local face engine until an enrolled astronaut is
 * confirmed over several consecutive frames. Paused whenever a session is active, so a second
 * face can never switch the active profile. After a session the loop waits until nobody is in
 * view before re-arming, so the same astronaut is not immediately checked in again.
 */
export function useRecognitionLoop(camera: Camera, enabled: boolean, onConfirmed: (s: AuthSession) => void) {
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [awaitingDeparture, setAwaitingDeparture] = useState(false);
  const cb = useRef(onConfirmed);
  cb.current = onConfirmed;
  const departure = useRef(false);

  useEffect(() => {
    if (!enabled || camera.state !== "on") return;
    let alive = true;
    let lastStatus = "no_face";
    let absentFrames = 0;
    const loop = async () => {
      while (alive) {
        const img = camera.grab(640, 0.8);
        if (img) {
          try {
            if (departure.current) {
              const r = await api.recognize(img, CLIENT_ID, "presence");
              absentFrames = r.status === "no_face" ? absentFrames + 1 : 0;
              if (absentFrames >= 3) {
                departure.current = false;
                setAwaitingDeparture(false);
              }
              lastStatus = r.status;
            } else {
              const r = await api.recognize(img, CLIENT_ID);
              if (!alive) return;
              setEngineError(null);
              setResult(r);
              lastStatus = r.status;
              if (r.status === "confirmed" && r.session) {
                alive = false;
                departure.current = true;
                setAwaitingDeparture(true);
                cb.current(r.session);
                return;
              }
            }
          } catch (e) {
            setEngineError((e as Error).message);
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        // Slow down when nobody is in view to save CPU.
        await new Promise((r) => setTimeout(r, lastStatus === "no_face" ? 450 : 220));
      }
    };
    loop();
    return () => {
      alive = false;
    };
  }, [enabled, camera.state]); // eslint-disable-line react-hooks/exhaustive-deps

  return { result: enabled && !awaitingDeparture ? result : null, engineError, awaitingDeparture: enabled && awaitingDeparture };
}
