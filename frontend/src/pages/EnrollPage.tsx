import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, ScanFace, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useCamera } from "../hooks/useCamera";
import { api, ApiError, tokens, type EnrollFrameResult } from "../services/api";
import type { Astronaut, RosterEntry } from "../types";
import { CameraView } from "../features/facial-analysis/CameraView";
import { voice } from "../features/voice/VoiceEngine";
import { Lobe } from "../components/Lobe";
import { StatusMark } from "../features/dashboard/StatusMark";

type Step = "choose" | "form" | "capture" | "done";

/** One-time registration and facial enrollment. Kept out of the routine astronaut flow. */
export default function EnrollPage() {
  const [step, setStep] = useState<Step>("choose");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [ticket, setTicket] = useState<string | null>(null);
  const [astro, setAstro] = useState<Astronaut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operator = !!tokens.operator;

  useEffect(() => {
    api.roster().then(setRoster).catch((e) => setError(e.message));
  }, []);

  const claim = async (id: string) => {
    setError(null);
    try {
      const r = await api.enrollStart(id);
      setTicket(r.ticket);
      setAstro(r.astronaut);
      setStep("capture");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[clamp(2.75rem,6vw,5.5rem)]">Astronaut enrollment</h1>
          <p className="mt-3 text-lg text-ink-soft">One-time setup. After this, the booth recognizes you on its own.</p>
        </div>
        <Link to="/" className="btn-ghost">
          <ArrowLeft size={17} /> Back to booth
        </Link>
      </div>
      {error && <div className="flex items-center gap-2 rounded-[20px] bg-sheet px-5 py-3 text-[15px] text-st-urgent" role="alert"><StatusMark level="urgent" size={15} /> {error}</div>}

      {step === "choose" && (
        <div className="grid items-start gap-5 md:grid-cols-[1fr_1.15fr]">
          <section className="relative px-[9%] py-[12%]">
            <Lobe seed={53} swell={0.12} square={0.55} className="-inset-x-[2%] inset-y-0" />
            <div className="relative">
              <UserPlus size={28} />
              <h2 className="mt-3 text-[clamp(2rem,3.2vw,2.75rem)] leading-[1] tracking-[-0.05em]">Register a new astronaut</h2>
              <p className="mt-3 max-w-[30ch] text-lg leading-snug">Create a profile, then capture facial reference data with the webcam.</p>
              <button className="btn-primary mt-5 px-6 text-[17px]" onClick={() => setStep("form")}>
                Start registration
              </button>
            </div>
          </section>
          <section className="sheet p-6">
            <h2 className="flex items-center gap-2 text-[24px] leading-tight tracking-[-0.035em]">
              <ScanFace size={22} className="shrink-0" /> Enroll a face for an existing profile
            </h2>
            <p className="mt-1 text-[15px] leading-snug text-ink-soft">
              Seeded demo astronauts have synthetic history but no face. Link a real person's face to one of them. {operator ? "Operator session active: re-enrollment allowed." : "Already-enrolled profiles require an authorized operator."}
            </p>
            <ul className="mt-3 divide-y divide-rule">
              {roster.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="text-[17px]">{r.display_name}</div>
                    <div className="text-[13px] text-ink-soft">
                      {r.id} · {r.role}
                    </div>
                  </div>
                  {r.face_enrolled && !operator ? (
                    <span className="chip bg-cap-lilac">enrolled</span>
                  ) : (
                    <button className="btn-ghost min-h-[40px] shrink-0 px-4 text-[15px]" onClick={() => claim(r.id)}>
                      {r.face_enrolled ? "Re-enroll" : "Enroll face"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {step === "form" && (
        <RegistrationForm
          onCancel={() => setStep("choose")}
          onCreated={(a, t) => {
            setAstro(a);
            setTicket(t);
            setStep("capture");
          }}
          onError={setError}
        />
      )}

      {step === "capture" && ticket && astro && (
        <FaceCapture
          ticket={ticket}
          astronaut={astro}
          onDone={(a) => {
            setAstro(a);
            setStep("done");
          }}
          onError={setError}
        />
      )}

      {step === "done" && astro && (
        <motion.section initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative flex flex-col items-center gap-4 px-6 py-24 text-center">
          <Lobe seed={61} swell={0.12} square={0.35} hole={{ cx: 50, cy: 50, rx: 32, ry: 30 }} />
          <CheckCircle2 size={56} className="relative" />
          <h2 className="display relative text-[clamp(2.5rem,5vw,4.5rem)]">Enrollment complete</h2>
          <p className="relative max-w-[34ch] text-lg leading-snug text-ink">
            {astro.display_name} can now walk up to the booth and will be recognized automatically. No login or profile selection is needed.
          </p>
          <Link to="/" className="btn-primary relative px-6 py-3 text-[17px]">
            Return to booth stand-by
          </Link>
        </motion.section>
      )}
    </div>
  );
}

function RegistrationForm({ onCreated, onCancel, onError }: { onCreated: (a: Astronaut, ticket: string) => void; onCancel: () => void; onError: (e: string) => void }) {
  const [f, setF] = useState({ full_name: "", preferred_name: "", title: "", role: "Mission Specialist", date_of_birth: "", generate_demo_history: true });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form
      className="sheet grid gap-5 p-6 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api.register({ ...f, date_of_birth: f.date_of_birth || null, preferred_name: f.preferred_name || f.full_name.split(" ")[0] });
          onCreated(r.astronaut, r.enrollment_ticket);
        } catch (err) {
          onError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1.5 text-[15px]">
        Full name
        <input className="input" required minLength={2} value={f.full_name} onChange={set("full_name")} />
      </label>
      <label className="flex flex-col gap-1.5 text-[15px]">
        Preferred name (used by ASTRA's voice)
        <input className="input" value={f.preferred_name} onChange={set("preferred_name")} placeholder="e.g. Sam" />
      </label>
      <label className="flex flex-col gap-1.5 text-[15px]">
        Title
        <input className="input" value={f.title} onChange={set("title")} placeholder="e.g. Commander, Dr." />
      </label>
      <label className="flex flex-col gap-1.5 text-[15px]">
        Mission role
        <input className="input" required value={f.role} onChange={set("role")} />
      </label>
      <label className="flex flex-col gap-1.5 text-[15px]">
        Date of birth (optional)
        <input className="input" type="date" value={f.date_of_birth} onChange={set("date_of_birth")} />
      </label>
      <label className="flex items-start gap-3 self-end text-[15px] leading-snug text-ink-soft">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={f.generate_demo_history} onChange={set("generate_demo_history")} />
        Generate 21 days of clearly-labelled synthetic history so personalized baselines can be demonstrated immediately.
      </label>
      <div className="flex gap-2 md:col-span-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Creating profile…" : "Create profile & continue to face capture"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function FaceCapture({ ticket, astronaut, onDone, onError }: { ticket: string; astronaut: Astronaut; onDone: (a: Astronaut) => void; onError: (e: string) => void }) {
  const camera = useCamera();
  const [res, setRes] = useState<EnrollFrameResult | null>(null);
  const [prompt, setPrompt] = useState("Look straight at the camera.");
  const [finishing, setFinishing] = useState(false);
  const running = useRef(true);

  const finalize = useCallback(async () => {
    setFinishing(true);
    try {
      const r = await api.enrollFinalize(ticket);
      camera.stop();
      voice.speak(`Enrollment complete. Welcome aboard, ${astronaut.preferred_name}.`).catch(() => undefined);
      onDone(r.astronaut);
    } catch (e) {
      onError((e as Error).message);
      setFinishing(false);
    }
  }, [astronaut.preferred_name, camera, onDone, onError, ticket]);

  useEffect(() => {
    running.current = true;
    camera.start();
    voice.unlock().then(() => voice.speak("Please look straight at the camera. I'll capture a few reference images of your face geometry.")).catch(() => undefined);
    return () => {
      running.current = false;
      camera.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (camera.state !== "on") return;
    let alive = true;
    let lastPrompt = "";
    const loop = async () => {
      while (alive && running.current) {
        const img = camera.grab(640, 0.85);
        if (img) {
          try {
            const r = await api.enrollFrame(ticket, img);
            if (!alive) return;
            setRes(r);
            if (r.next_prompt && r.next_prompt !== lastPrompt) {
              lastPrompt = r.next_prompt;
              setPrompt(r.next_prompt);
              voice.speak(r.next_prompt).catch(() => undefined);
              await new Promise((x) => setTimeout(x, 1200)); // give time to move
            }
            if (r.status === "complete") {
              alive = false;
              await finalize();
              return;
            }
          } catch (e) {
            onError((e as Error).message);
            await new Promise((x) => setTimeout(x, 1500));
          }
        }
        await new Promise((x) => setTimeout(x, 350));
      }
    };
    loop();
    return () => {
      alive = false;
    };
  }, [camera.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = res ? (res.captured / res.needed) * 100 : 0;
  return (
    <section className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
      <CameraView camera={camera} boxes={(res?.faces ?? []).map((f) => f.bbox)} boxColor={res?.accepted ? "#8ED462" : "#F5E211"} className="aspect-[4/3]" scanning label={`Enrolling ${astronaut.display_name}`} />
      <div className="relative flex flex-col gap-4 px-[9%] py-[8%]">
        <Lobe seed={67} swell={0.08} square={0.8} className="-inset-x-[3%] -inset-y-[2%]" />
        <h2 className="display relative text-[clamp(2rem,3.4vw,3rem)]">{prompt}</h2>
        <p className="relative flex items-center gap-2 text-lg">
          {res?.accepted && <CheckCircle2 size={20} />}
          {res?.message ?? "Waiting for the camera…"}
        </p>
        <div className="relative">
          <div className="mb-1.5 flex justify-between text-[15px]">
            <span>Captures</span>
            <span>
              {res?.captured ?? 0}/{res?.needed ?? 6}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-sheet">
            <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {finishing && <p className="relative w-fit rounded-full bg-cap-yellow px-4 py-1.5 text-[15px]">Saving biometric templates…</p>}
        <ul className="relative mt-auto list-disc space-y-1 pl-5 text-[13px] leading-snug text-ink">
          <li>Only 128-number face embeddings and geometry measurements are stored, locally in SQLite.</li>
          <li>No photos are saved. Templates can be deleted by an authorized operator.</li>
          <li>Frontal captures also become your facial-geometry reference for later change detection.</li>
        </ul>
        <button
          className="btn-ghost relative w-fit"
          onClick={async () => {
            await api.enrollCancel(ticket).catch(() => undefined);
            window.location.assign("/enroll");
          }}
        >
          Cancel enrollment
        </button>
      </div>
    </section>
  );
}
