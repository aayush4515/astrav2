/**
 * Hands-free check-in orchestrator (client side).
 *
 * Drives the state machine STANDBY → … → COMPLETED. Every visible transition is the result of a real
 * event: a backend response (face match, sensor reading, analysis) or a voice turn finishing.
 * Animations in the 3D booth read `activeDevice`, which only changes when a device is actually collecting.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera } from "../../hooks/useCamera";
import { api, tokens, type CheckinStart, type FacialFrameResult } from "../../services/api";
import type { AnalysisResult, AuthSession, DeviceId, LabTest, Question, Reading, VocAnalysis } from "../../types";
import { voice, wait } from "../voice/VoiceEngine";

export type Stage =
  | "STANDBY"
  | "IDENTITY_CONFIRMED"
  | "VOICE_GREETING"
  | "CHECKIN_STARTED"
  | "FACIAL_SCAN"
  | "SENSOR_COLLECTION"
  | "VOC_SCAN"
  | "BLOOD_TEST"
  | "VOICE_QUESTIONNAIRE"
  | "PROCESSING"
  | "RESULTS_READY"
  | "VOICE_SUMMARY"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export const STEPS: { key: string; label: string; stages: Stage[] }[] = [
  { key: "identity", label: "Identity", stages: ["IDENTITY_CONFIRMED", "VOICE_GREETING", "CHECKIN_STARTED"] },
  { key: "face", label: "Face scan", stages: ["FACIAL_SCAN"] },
  { key: "sensors", label: "Vitals", stages: ["SENSOR_COLLECTION"] },
  { key: "voc", label: "Chemistry", stages: ["VOC_SCAN", "BLOOD_TEST"] },
  { key: "questions", label: "Questions", stages: ["VOICE_QUESTIONNAIRE"] },
  { key: "summary", label: "Summary", stages: ["PROCESSING", "RESULTS_READY", "VOICE_SUMMARY", "COMPLETED"] },
];

export type DeviceStatus = "pending" | "active" | "done" | "fault";

export interface DetailsState {
  open: boolean;
  section: string;
  metric?: string;
  region?: string;
}

export interface BloodState {
  phase: "offer" | "collect" | "ready" | "analyzing" | "done" | "deferred";
  steps: string[];
  stepIndex: number;
  result?: LabTest;
  previous?: LabTest | null;
}

export interface FlowState {
  stage: Stage;
  session: AuthSession | null;
  checkin: CheckinStart | null;
  activity: string;
  activeDevice: DeviceId | null;
  deviceStatus: Record<string, DeviceStatus>;
  readings: Reading[];
  facial: (FacialFrameResult & { lastGuidance?: string }) | null;
  voc: { channels: number[]; analysis: VocAnalysis } | null;
  question: Question | null;
  questionCount: number;
  blood: BloodState | null;
  result: AnalysisResult | null;
  details: DetailsState;
  faults: string[];
  error: string | null;
  endingIn: number | null;
}

const INITIAL: FlowState = {
  stage: "STANDBY",
  session: null,
  checkin: null,
  activity: "",
  activeDevice: null,
  deviceStatus: {},
  readings: [],
  facial: null,
  voc: null,
  question: null,
  questionCount: 0,
  blood: null,
  result: null,
  details: { open: false, section: "overview" },
  faults: [],
  error: null,
  endingIn: null,
};

class FlowAbort extends Error {
  constructor(public reason: "emergency" | "cancel" | "end", public transcript = "") {
    super(reason);
  }
}

const isAbort = (e: unknown) => e instanceof FlowAbort || (e as DOMException)?.name === "AbortError";

interface Options {
  camera: Camera;
  onEmergency: (transcript: string, patientId?: string) => void;
}

export function useCheckinFlow({ camera, onEmergency }: Options) {
  const [state, setState] = useState<FlowState>(INITIAL);
  const ctrl = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastSpeech = useRef("");
  // Synchronous mirror of the active check-in (React state may not have re-rendered when we abort).
  const live = useRef<{ checkinId: string | null; completed: boolean }>({ checkinId: null, completed: false });

  const patch = useCallback((p: Partial<FlowState> | ((s: FlowState) => Partial<FlowState>)) => {
    setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  }, []);

  const reset = useCallback(() => {
    tokens.setAstronaut(null);
    voice.closeMic();
    voice.clearCaptions();
    setState(INITIAL);
  }, []);

  const end = useCallback(
    async (reason: "cancel" | "end" | "emergency", note?: string) => {
      ctrl.current?.abort();
      ctrl.current = null;
      voice.stopSpeaking();
      const { checkinId, completed } = live.current;
      live.current = { checkinId: null, completed: false };
      if (checkinId && !completed) {
        await api.cancel(checkinId, note ?? reason).catch(() => undefined);
      }
      // On emergency the session ends but the microphone stays with the emergency assistant.
      await api.logout().catch(() => undefined);
      tokens.setAstronaut(null);
      if (reason !== "emergency") reset();
      else setState(INITIAL);
    },
    [reset],
  );

  // ----------------------------------------------------------------- voice helpers
  const speak = useCallback(async (text: string, signal: AbortSignal) => {
    lastSpeech.current = text;
    await voice.speak(text, signal);
  }, []);

  /** Ask a yes / no / later question. Returns null if unanswered after retries. */
  const confirm = useCallback(
    async (prompt: string, signal: AbortSignal): Promise<"affirm" | "deny" | "defer" | null> => {
      let p = prompt;
      for (let attempt = 0; attempt < 3; attempt++) {
        await speak(p, signal);
        const heard = await voice.listen({ signal, noSpeechTimeoutMs: 7000 });
        if (!heard) {
          p = "I didn't hear an answer. " + prompt;
          continue;
        }
        const intent = await api.interpret(heard.text, "confirm");
        if (intent.intent === "emergency") throw new FlowAbort("emergency", heard.text);
        if (intent.intent === "end_checkin") throw new FlowAbort("end");
        if (intent.intent === "repeat") {
          p = prompt;
          continue;
        }
        if (intent.intent === "affirm" || intent.intent === "deny" || intent.intent === "defer") return intent.intent;
        p = "Please say yes, not now, or remind me later.";
      }
      return null;
    },
    [speak],
  );

  // ----------------------------------------------------------------- stages
  const runFacialScan = useCallback(
    async (checkinId: string, signal: AbortSignal) => {
      patch({ stage: "FACIAL_SCAN", activeDevice: "face_camera", activity: "Facial geometry scan", facial: null });
      await speak("Please look directly at the camera and keep a relaxed, neutral expression.", signal);
      if (camera.state !== "on") {
        await api.facialSkip(checkinId, "camera unavailable");
        patch((s) => ({ faults: [...s.faults, "Facial scan skipped: camera unavailable"] }));
        await speak("The camera is unavailable, so I'll skip the facial scan.", signal);
        return;
      }
      const deadline = Date.now() + 30000;
      let lastSpoken = 0;
      let lastIssue = "";
      while (Date.now() < deadline) {
        if (signal.aborted) throw new FlowAbort("cancel");
        const img = camera.grab(640, 0.85);
        if (!img) {
          await wait(200, signal);
          continue;
        }
        let r: FacialFrameResult;
        try {
          r = await api.facialFrame(checkinId, img);
        } catch (e) {
          patch((s) => ({ faults: [...s.faults, `Facial scan error: ${(e as Error).message}`] }));
          await api.facialSkip(checkinId, "analysis unavailable").catch(() => undefined);
          await speak("The facial analysis module is unavailable. Continuing without it.", signal);
          return;
        }
        patch({ facial: { ...r, lastGuidance: r.guidance } });
        if (r.complete) {
          const flagged = r.observation?.comparison?.status === "changed";
          await speak(flagged ? "Facial scan complete. I noted a change from your reference; we'll review it in your summary." : "Facial scan complete.", signal);
          return;
        }
        const issue = r.issues?.[0] ?? "";
        if (!r.accepted && r.guidance && (Date.now() - lastSpoken > 6000 || issue !== lastIssue)) {
          lastSpoken = Date.now();
          lastIssue = issue;
          await speak(r.guidance, signal);
        }
        await wait(90, signal);
      }
      await api.facialSkip(checkinId, "no stable capture within time limit");
      patch((s) => ({ faults: [...s.faults, "Facial scan incomplete: no stable capture"] }));
      await speak("I couldn't get a stable facial scan this time. We'll repeat it at your next check-in.", signal);
    },
    [camera, patch, speak],
  );

  const runSensors = useCallback(
    async (start: CheckinStart, signal: AbortSignal) => {
      const plan = start.sensor_plan;
      patch({ stage: "SENSOR_COLLECTION", deviceStatus: Object.fromEntries(plan.map((p) => [p.device, "pending"])) });
      const ANNOUNCE: Record<string, string> = {
        wearable_sync: "Syncing your wearable's overnight data.",
        vitals_module: "Measuring your vital signs. Keep your arm relaxed.",
        thermal_module: "Thermal scan for temperature and breathing rate.",
        mass_module: "Measuring body mass. Hold the handles and stay still.",
      };
      for (const p of plan) {
        if (signal.aborted) throw new FlowAbort("cancel");
        patch((s) => ({ activeDevice: p.device as DeviceId, activity: p.label, deviceStatus: { ...s.deviceStatus, [p.device]: "active" } }));
        const [res] = await Promise.all([api.collectSensor(start.checkin.id, p.device), speak(ANNOUNCE[p.device] ?? `Collecting ${p.label}.`, signal)]);
        patch((s) => ({
          readings: [...s.readings, ...res.readings],
          deviceStatus: { ...s.deviceStatus, [p.device]: res.status === "ok" ? "done" : "fault" },
          faults: res.status === "fault" ? [...s.faults, res.message ?? `${p.label} fault`] : s.faults,
        }));
        if (res.status === "fault") await speak(`${p.label} did not respond. I'll note that and continue.`, signal);
      }
      patch({ activeDevice: null });
      await speak("Sensor readings collected.", signal);
    },
    [patch, speak],
  );

  const runVoc = useCallback(
    async (checkinId: string, signal: AbortSignal) => {
      patch({ stage: "VOC_SCAN", activeDevice: "e_nose", activity: "Biochemical fingerprint (experimental)" });
      const [res] = await Promise.all([
        api.collectVoc(checkinId),
        speak("Beginning biochemical fingerprint assessment. Hold your forearm near the sensor.", signal),
      ]);
      patch({ voc: { channels: res.channels, analysis: res.analysis }, activeDevice: null });
      await speak(res.analysis.flagged ? "Fingerprint scan complete. It differs from your usual pattern; this is experimental and noted for review." : "Fingerprint scan complete.", signal);
    },
    [patch, speak],
  );

  const offerBlood = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      patch({ stage: "BLOOD_TEST", activeDevice: "blood_analyzer", activity: "Weekly blood assessment due", blood: { phase: "offer", steps: [], stepIndex: 0 } });
      const ans = await confirm("Your weekly blood assessment is due. Would you like to complete it during this check-in?", signal);
      if (ans === "affirm") {
        await api.bloodRespond("yes");
        await speak("Great. We'll do it after the chemistry scan.", signal);
        patch({ activeDevice: null });
        return true;
      }
      const mode = ans === "defer" ? "later" : "not_now";
      await api.bloodRespond(mode);
      patch({ blood: { phase: "deferred", steps: [], stepIndex: 0 }, activeDevice: null });
      await speak(mode === "later" ? "Okay, I'll remind you in two hours." : "Okay, I'll ask again at your next check-in.", signal);
      return false;
    },
    [confirm, patch, speak],
  );

  const runBlood = useCallback(
    async (checkinId: string, signal: AbortSignal) => {
      const test = await api.bloodStart(checkinId);
      patch({ stage: "BLOOD_TEST", activeDevice: "blood_analyzer", activity: "Blood sample collection", blood: { phase: "collect", steps: test.steps, stepIndex: 0 } });
      for (let i = 0; i < test.steps.length; i++) {
        patch((s) => ({ blood: s.blood && { ...s.blood, stepIndex: i } }));
        await speak(test.steps[i], signal);
        await wait(600, signal);
      }
      patch((s) => ({ blood: s.blood && { ...s.blood, phase: "ready" } }));
      let ready = false;
      for (let attempt = 0; attempt < 4 && !ready; attempt++) {
        await speak(attempt === 0 ? "Say 'sample ready' when the cartridge is in the analyzer." : "Say 'sample ready' when you're done.", signal);
        const heard = await voice.listen({ signal, noSpeechTimeoutMs: 15000 });
        if (!heard) continue;
        const intent = await api.interpret(heard.text, "confirm");
        if (intent.intent === "emergency") throw new FlowAbort("emergency", heard.text);
        ready = /ready|done|insert|finished|complete|go ahead/i.test(heard.text) || intent.intent === "affirm" || intent.intent === "continue";
      }
      patch((s) => ({ blood: s.blood && { ...s.blood, phase: "analyzing" }, activity: "Analyzing sample" }));
      const [res] = await Promise.all([api.bloodAnalyze(test.id), speak("Analyzing your sample. This takes a few seconds.", signal)]);
      patch((s) => ({ blood: s.blood && { ...s.blood, phase: "done", result: res.test, previous: res.previous }, activeDevice: null }));
      const out = Object.values(res.test.results).filter((r) => (r.ref_low !== null && r.value < r.ref_low) || (r.ref_high !== null && r.value > r.ref_high));
      await speak(
        out.length
          ? `Your results are ready. Outside the expected range: ${out.map((r) => r.label).join(", ")}. These are simulated results.`
          : "Your results are ready, and all markers are within the expected range. These are simulated results.",
        signal,
      );
    },
    [patch, speak],
  );

  const runQuestionnaire = useCallback(
    async (checkinId: string, signal: AbortSignal) => {
      patch({ stage: "VOICE_QUESTIONNAIRE", activity: "Health questions", activeDevice: null });
      await speak("Now a few quick questions. Answer in your own words.", signal);
      for (;;) {
        const next = await api.nextQuestion(checkinId);
        if (next.done || !next.question) break;
        const q = next.question;
        patch({ question: q, questionCount: next.answered });
        let prompt = q.text;
        let failures = 0;
        for (;;) {
          await speak(prompt, signal);
          const heard = await voice.listen({ signal, noSpeechTimeoutMs: 8000 });
          if (!heard) {
            failures++;
            prompt = failures >= 2 ? "I still didn't hear you. You can also answer with the on-screen buttons. " + q.text : "I didn't catch that. " + q.text;
            continue;
          }
          const r = await api.answer(checkinId, q.id, heard.text, heard.source);
          if (r.command === "emergency") {
            throw new FlowAbort("emergency", heard.text);
          }
          if (r.command === "end_checkin" || r.command === "cancel") throw new FlowAbort("end");
          if (r.command === "repeat") {
            prompt = q.text;
            continue;
          }
          if (r.command === "go_back") {
            prompt = "Earlier answers are already saved. " + q.text;
            continue;
          }
          if (!r.accepted) {
            failures++;
            prompt = r.clarification ?? q.text;
            continue;
          }
          if (r.chest_pain) {
            await speak("You mentioned chest pain. If it is severe, sudden, or spreading, say emergency now.", signal);
            const h = await voice.listen({ signal, noSpeechTimeoutMs: 4500, optional: true });
            if (h && /emergency|help/i.test(h.text)) {
              throw new FlowAbort("emergency", h.text);
            }
          } else if (r.acknowledgement) {
            await speak(r.acknowledgement, signal);
          }
          break;
        }
      }
      patch({ question: null });
    },
    [onEmergency, patch, speak],
  );

  const applyUi = useCallback(
    (ui: { action: string; section?: string; metric?: string; region?: string } | null | undefined) => {
      if (!ui) return;
      if (ui.action === "open_details") patch({ details: { open: true, section: ui.section ?? "overview", metric: ui.metric, region: ui.region } });
      if (ui.action === "close_details" || ui.action === "summary") patch((s) => ({ details: { ...s.details, open: false } }));
    },
    [patch],
  );

  const runSummary = useCallback(
    async (checkinId: string, result: AnalysisResult, signal: AbortSignal, name: string) => {
      patch({ stage: "VOICE_SUMMARY" });
      await speak(result.summary_text, signal);
      let silent = 0;
      for (;;) {
        const heard = await voice.listen({ signal, noSpeechTimeoutMs: 15000, optional: true });
        if (!heard) {
          silent++;
          if (silent >= 2) break;
          await speak("Is there anything else? You can ask me to explain a result, or say end check-in.", signal);
          continue;
        }
        silent = 0;
        const r = await api.ask(heard.text, checkinId);
        if (r.intent === "emergency") {
          throw new FlowAbort("emergency", heard.text);
        }
        if (["end_checkin", "cancel", "home", "deny"].includes(r.intent)) break;
        if (r.intent === "repeat") {
          await speak(lastSpeech.current || result.summary_text, signal);
          continue;
        }
        if (r.intent === "unknown" || r.intent === "none" || !r.speech) {
          await speak("Sorry, I didn't understand. You can say: explain, show my heart-rate history, what changed since yesterday, or end check-in.", signal);
          continue;
        }
        applyUi(r.ui);
        await speak(r.speech, signal);
      }
      patch({ stage: "COMPLETED", endingIn: 6 });
      await speak(`Your session is complete. Have a good ${new Date().getHours() < 14 ? "day" : "evening"}, ${name}.`, signal);
    },
    [applyUi, onEmergency, patch, speak],
  );

  // ----------------------------------------------------------------- main run
  const begin = useCallback(
    async (session: AuthSession) => {
      if (ctrl.current) return; // a session is already running: never switch astronauts mid-session
      const c = new AbortController();
      ctrl.current = c;
      const signal = c.signal;
      tokens.setAstronaut(session.token);
      setState({ ...INITIAL, session, stage: "IDENTITY_CONFIRMED", activity: "Identity confirmed", activeDevice: "face_camera" });
      voice.clearCaptions();
      try {
        await voice.openMic();
        const start = await api.startCheckin();
        live.current = { checkinId: start.checkin.id, completed: false };
        patch({ checkin: start, stage: "VOICE_GREETING", activity: "Greeting" });
        // Brief opportunity to cancel before the automatic start.
        await speak(`${start.greeting} Say cancel to stop.`, signal);
        const heard = await voice.listen({ signal, noSpeechTimeoutMs: 2800, maxMs: 5000, optional: true });
        if (heard) {
          const i = await api.interpret(heard.text);
          if (i.intent === "emergency") {
            throw new FlowAbort("emergency", heard.text);
          }
          if (i.intent === "cancel" || i.intent === "end_checkin" || i.intent === "deny") {
            await speak("Check-in cancelled. See you later.", signal);
            throw new FlowAbort("cancel");
          }
        }
        patch({ stage: "CHECKIN_STARTED" });
        const id = start.checkin.id;
        const bloodAccepted = start.blood_test.due_now ? await offerBlood(signal) : false;
        await runFacialScan(id, signal);
        await runSensors(start, signal);
        await runVoc(id, signal);
        if (bloodAccepted) await runBlood(id, signal);
        await runQuestionnaire(id, signal);
        patch({ stage: "PROCESSING", activity: "Analyzing against your personal baseline", activeDevice: null });
        voice.setProcessing(true);
        const result = await api.complete(id);
        live.current.completed = true;
        voice.setProcessing(false);
        patch({ stage: "RESULTS_READY", result, activity: "Assessment complete" });
        await runSummary(id, result, signal, session.preferred_name);
        await wait(3500, signal);
        ctrl.current = null;
        await api.logout().catch(() => undefined);
        reset();
      } catch (e) {
        voice.setProcessing(false);
        if (e instanceof FlowAbort) {
          ctrl.current = null;
          if (e.reason === "emergency") {
            onEmergency(e.transcript);
            await end("emergency");
            return;
          }
          await end(e.reason);
          return;
        }
        if (isAbort(e)) return;
        console.error(e);
        patch({ stage: "FAILED", error: e instanceof Error ? e.message : String(e) });
        try {
          await voice.speak("Something went wrong with this check-in. Your collected data is saved. Please try again.", signal);
        } catch {
          /* aborted */
        }
        ctrl.current = null;
      }
    },
    [end, offerBlood, onEmergency, patch, reset, runBlood, runFacialScan, runQuestionnaire, runSensors, runSummary, runVoc, speak],
  );

  const setDetails = useCallback((d: Partial<DetailsState>) => patch((s) => ({ details: { ...s.details, ...d } })), [patch]);

  useEffect(() => () => ctrl.current?.abort(), []);

  return { state, begin, end, reset, setDetails, running: () => !!ctrl.current };
}
