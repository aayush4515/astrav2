import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Radio, Satellite, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import type { EmergencyProtocol } from "../../types";
import { Captions } from "../voice/Captions";
import { VoiceOrb } from "../voice/VoiceOrb";
import { voice } from "../voice/VoiceEngine";
import { useEmergency } from "./EmergencyContext";

const STATUS_TEXT: Record<string, string> = {
  created: "Report created",
  queued: "Queued — waiting for Earth link",
  in_transit: "In transit to Earth",
  delivered: "Delivered to Mission Control",
  acknowledged: "Acknowledged by flight surgeon",
};

/** Focused, distraction-free emergency interface. Replaces routine content while active. */
export function EmergencyOverlay() {
  const { event, setEvent, dismiss } = useEmergency();
  const [protocols, setProtocols] = useState<EmergencyProtocol[]>([]);
  const [crew, setCrew] = useState<{ id: string; name: string }[]>([]);
  const voiceCtrl = useRef<AbortController | null>(null);
  const eventRef = useRef(event);
  eventRef.current = event;

  useEffect(() => {
    if (!event) return;
    api.emergencyProtocols().then(setProtocols).catch(() => undefined);
    api.emergencyCrew().then(setCrew).catch(() => undefined);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = useCallback(
    async (action: "next" | "back") => {
      const ev = eventRef.current;
      if (!ev) return;
      setEvent(await api.emergencyStep(ev.id, action));
    },
    [setEvent],
  );

  // Voice loop: announce the step, listen for next / back / repeat / resolved.
  useEffect(() => {
    if (!event || event.status !== "active") return;
    const c = new AbortController();
    voiceCtrl.current = c;
    const run = async () => {
      try {
        await voice.openMic();
        const first = eventRef.current!;
        await voice.speak(`Emergency assistance activated. All crew have been alerted. ${first.protocol?.priority_action ?? ""}`, c.signal);
        let lastAnnounced = -1;
        for (;;) {
          const ev = eventRef.current;
          if (!ev || ev.status !== "active" || c.signal.aborted) return;
          const s = ev.protocol?.steps[ev.current_step];
          if (s && lastAnnounced !== ev.current_step) {
            lastAnnounced = ev.current_step;
            await voice.speak(`Step ${ev.current_step + 1}. ${s.title}. ${s.instruction}`, c.signal);
          }
          const heard = await voice.listen({ signal: c.signal, noSpeechTimeoutMs: 8000, optional: true });
          if (!heard) continue;
          const t = heard.text.toLowerCase();
          if (/\b(next|done|continue|okay next)\b/.test(t)) await step("next");
          else if (/\b(back|previous)\b/.test(t)) await step("back");
          else if (/\b(repeat|again)\b/.test(t)) lastAnnounced = -1;
          else if (/\b(resolved|stand down|all clear)\b/.test(t)) {
            setEvent(await api.emergencyResolve(ev.id));
            await voice.speak("Emergency marked as resolved. The log has been queued for Mission Control.", c.signal);
            return;
          } else if (/collapse|unconscious|not breathing/.test(t)) setEvent(await api.emergencyProtocol(ev.id, "collapse_chest_pain"));
          else if (/chest/.test(t)) setEvent(await api.emergencyProtocol(ev.id, "chest_pain_self"));
          else if (/breath/.test(t)) setEvent(await api.emergencyProtocol(ev.id, "breathing_difficulty"));
          else if (/bleed|injur|cut/.test(t)) setEvent(await api.emergencyProtocol(ev.id, "injury_bleeding"));
        }
      } catch {
        /* aborted */
      }
    };
    run();
    return () => {
      c.abort();
      voice.stopSpeaking();
    };
  }, [event?.id, event?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!event) return null;
  const proto = event.protocol;
  const current = proto?.steps[event.current_step];
  const resolved = event.status === "resolved";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0306]/95 backdrop-blur-sm" role="alertdialog" aria-labelledby="em-title">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-5 p-5 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full ${resolved ? "bg-ok/20 text-ok" : "bg-alert/20 text-alert"}`}>
              {resolved ? <CheckCircle2 /> : <AlertTriangle />}
            </span>
            <div>
              <div className="label text-alert">{resolved ? "Emergency resolved" : "Emergency active"}</div>
              <h1 id="em-title" className="text-2xl font-semibold md:text-3xl">
                {proto?.title ?? "Medical emergency"}
              </h1>
            </div>
          </div>
          <div className="flex gap-2">
            {!resolved && (
              <button className="btn-ghost" onClick={async () => setEvent(await api.emergencyResolve(event.id))}>
                <CheckCircle2 size={16} /> Mark resolved
              </button>
            )}
            {resolved && (
              <button className="btn-primary" onClick={dismiss}>
                Return to ASTRA
              </button>
            )}
          </div>
        </header>

        {!resolved && proto && (
          <div className="rounded-2xl border-2 border-alert/60 bg-alert/10 p-5">
            <div className="label text-alert">Immediate priority</div>
            <p className="mt-1 text-2xl font-semibold md:text-3xl">{proto.priority_action}</p>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="panel border-alert/30 p-5">
            <div className="flex items-center justify-between">
              <span className="label">
                Step {event.current_step + 1} of {proto?.steps.length ?? 0}
              </span>
              <span className="label text-ink-faint">Demonstration protocol · follow approved onboard procedures</span>
            </div>
            {current && (
              <div className="mt-3">
                <h2 className="text-2xl font-semibold">{current.title}</h2>
                <p className="mt-2 text-xl leading-relaxed text-ink">{current.instruction}</p>
              </div>
            )}
            <ol className="mt-5 space-y-1.5">
              {proto?.steps.map((s, i) => (
                <li key={i} className={`flex gap-3 text-sm ${i === event.current_step ? "text-ink" : i < event.current_step ? "text-ink-faint line-through" : "text-ink-muted"}`}>
                  <span className="font-mono">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-3">
              <button className="btn-ghost" onClick={() => step("back")} disabled={event.current_step === 0 || resolved}>
                <ChevronLeft size={16} /> Back
              </button>
              <button className="btn-danger flex-1 py-3 text-base" onClick={() => step("next")} disabled={resolved || event.current_step >= (proto?.steps.length ?? 1) - 1}>
                Next step <ChevronRight size={16} />
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-faint">Voice: “next”, “back”, “repeat”, “resolved”, or describe the situation (“collapsed”, “chest pain”, “breathing”, “bleeding”).</p>
          </section>

          <aside className="flex flex-col gap-4">
            <div className="panel p-4">
              <div className="flex items-center gap-2 label">
                <Users size={14} /> Crew notification
              </div>
              <p className="mt-2 text-lg text-ok">All crew alerted {event.crew_alerted_at ? new Date(event.crew_alerted_at).toLocaleTimeString() : ""}</p>
              <p className="text-xs text-ink-faint">Simulated cabin-wide alarm and crew-device notification.</p>
            </div>
            <div className="panel p-4">
              <div className="flex items-center gap-2 label">
                <Satellite size={14} /> Mission Control
              </div>
              <p className="mt-2 text-lg">{event.message ? STATUS_TEXT[event.message.status] : "Preparing report"}</p>
              <p className="text-xs text-ink-faint">
                Earth link {event.link.link_up ? `up · one-way delay ${event.link.delay_s}s` : "DOWN — report stays queued; onboard guidance continues"}
              </p>
            </div>
            <div className="panel p-4">
              <div className="label">Patient</div>
              <select
                className="input mt-2"
                value={event.patient?.id ?? ""}
                aria-label="Select patient"
                onChange={async (e) => setEvent(await api.emergencyProtocol(event.id, proto?.id ?? "collapse_chest_pain", e.target.value || undefined))}
              >
                <option value="">Unknown / not selected</option>
                {crew.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {event.patient && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(event.patient.latest_vitals)
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[11px] text-ink-faint">{v.label}</div>
                        <div className="font-mono">
                          {v.value} {v.unit}
                        </div>
                      </div>
                    ))}
                  <p className="col-span-2 text-[11px] text-ink-faint">Most recent stored readings (simulated). Not live monitoring.</p>
                </div>
              )}
            </div>
            <div className="panel p-4">
              <div className="label">Situation</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {protocols.map((p) => (
                  <button
                    key={p.id}
                    className={`rounded-lg border px-2 py-2 text-left text-xs ${p.id === proto?.id ? "border-alert text-alert" : "border-line text-ink-muted hover:text-ink"}`}
                    onClick={async () => setEvent(await api.emergencyProtocol(event.id, p.id, event.patient?.id))}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
        <div className="flex flex-col items-center gap-3 pb-6">
          <VoiceOrb size={70} />
          <div className="w-full max-w-2xl">
            <Captions max={2} />
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <Radio size={12} /> Runs fully offline. Decision support only — not a certified medical device.
          </div>
        </div>
      </div>
    </div>
  );
}
