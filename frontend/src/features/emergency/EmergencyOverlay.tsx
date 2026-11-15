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
    <div className={`fixed inset-0 z-50 overflow-y-auto ${resolved ? "bg-water" : "bg-st-urgent"}`} role="alertdialog" aria-labelledby="em-title">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-5 p-5 md:p-8">
        <header className={`flex flex-wrap items-center justify-between gap-4 ${resolved ? "text-ink" : "text-white"}`}>
          <div className="flex items-center gap-4">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${resolved ? "bg-st-clear text-white" : "bg-white text-st-urgent"}`}>
              {resolved ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
            </span>
            <div>
              <h1 id="em-title" className="text-[clamp(2.25rem,4.6vw,4.25rem)] leading-map tracking-map">
                {proto?.title ?? "Medical emergency"}
              </h1>
              <p className="mt-2 text-lg">{resolved ? "Emergency resolved" : "Emergency active · all crew alerted"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!resolved && (
              <button className="btn-ghost ring-0" onClick={async () => setEvent(await api.emergencyResolve(event.id))}>
                <CheckCircle2 size={17} /> Mark resolved
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
          <div className="rounded-[28px] bg-cap-yellow px-6 py-5">
            <p className="text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.05] tracking-[-0.04em]">{proto.priority_action}</p>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="sheet p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip bg-ink text-white">
                Step {event.current_step + 1} of {proto?.steps.length ?? 0}
              </span>
              <span className="label">Demonstration protocol · follow approved onboard procedures</span>
            </div>
            {current && (
              <div className="mt-4">
                <h2 className="text-[32px] leading-tight tracking-[-0.04em]">{current.title}</h2>
                <p className="mt-2 text-2xl leading-snug text-ink">{current.instruction}</p>
              </div>
            )}
            <ol className="mt-5 space-y-1">
              {proto?.steps.map((s, i) => (
                <li key={i} className={`flex gap-3 rounded-full px-3 py-1.5 text-[15px] ${i === event.current_step ? "bg-cap-yellow text-ink" : i < event.current_step ? "text-ink-soft line-through" : "text-ink"}`}>
                  <span className="w-5 shrink-0">{i + 1}</span>
                  {s.title}
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-3">
              <button className="btn-ghost" onClick={() => step("back")} disabled={event.current_step === 0 || resolved}>
                <ChevronLeft size={17} /> Back
              </button>
              <button className="btn-danger flex-1 py-3.5 text-lg" onClick={() => step("next")} disabled={resolved || event.current_step >= (proto?.steps.length ?? 1) - 1}>
                Next step <ChevronRight size={18} />
              </button>
            </div>
            <p className="mt-3 text-[13px] text-ink-soft">Voice: “next”, “back”, “repeat”, “resolved”, or describe the situation (“collapsed”, “chest pain”, “breathing”, “bleeding”).</p>
          </section>

          <aside className="flex flex-col gap-4">
            <div className="sheet p-5">
              <h3 className="sheet-title flex items-center gap-2">
                <Users size={17} /> Crew notification
              </h3>
              <p className="mt-2 flex items-center gap-2 text-xl">
                <CheckCircle2 size={20} className="text-st-clear" /> All crew alerted {event.crew_alerted_at ? new Date(event.crew_alerted_at).toLocaleTimeString() : ""}
              </p>
              <p className="text-[13px] text-ink-soft">Simulated cabin-wide alarm and crew-device notification.</p>
            </div>
            <div className="sheet p-5">
              <h3 className="sheet-title flex items-center gap-2">
                <Satellite size={17} /> Mission Control
              </h3>
              <p className="mt-2 text-xl">{event.message ? STATUS_TEXT[event.message.status] : "Preparing report"}</p>
              <p className="text-[13px] text-ink-soft">
                Earth link {event.link.link_up ? `up · one-way delay ${event.link.delay_s}s` : "DOWN — report stays queued; onboard guidance continues"}
              </p>
            </div>
            <div className="sheet p-5">
              <h3 className="sheet-title">Patient</h3>
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
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {Object.entries(event.patient.latest_vitals)
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[13px] text-ink-soft">{v.label}</div>
                        <div className="text-xl tabular-nums tracking-[-0.03em]">
                          {v.value} {v.unit}
                        </div>
                      </div>
                    ))}
                  <p className="col-span-2 text-[13px] text-ink-soft">Most recent stored readings (simulated). Not live monitoring.</p>
                </div>
              )}
            </div>
            <div className="sheet p-5">
              <h3 className="sheet-title">Situation</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {protocols.map((p) => (
                  <button
                    key={p.id}
                    className={`rounded-[18px] px-3 py-2.5 text-left text-[13px] leading-snug ${p.id === proto?.id ? "bg-ink text-white" : "bg-water text-ink hover:bg-cap-yellow/50"}`}
                    aria-pressed={p.id === proto?.id}
                    onClick={async () => setEvent(await api.emergencyProtocol(event.id, p.id, event.patient?.id))}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
        <div className="sheet flex flex-col items-center gap-3 p-5 pb-6">
          <VoiceOrb size={70} />
          <div className="w-full max-w-2xl">
            <Captions max={2} />
          </div>
          <div className="flex items-center gap-2 text-[13px] text-ink-soft">
            <Radio size={14} /> Runs fully offline. Decision support only — not a certified medical device.
          </div>
        </div>
      </div>
    </div>
  );
}
