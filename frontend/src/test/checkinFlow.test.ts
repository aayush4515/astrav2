/**
 * Hands-free check-in integration test: face session in, scripted spoken answers, no manual input.
 * Hardware (mic, speaker, camera) and the backend are mocked; the orchestrator logic is real.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

const { spoken, manualUsed, answerSpy, cancelSpy } = vi.hoisted(() => ({
  spoken: [] as string[],
  manualUsed: vi.fn(),
  answerSpy: vi.fn(),
  cancelSpy: vi.fn(),
}));

const QUESTIONS = [
  { id: "feeling", text: "How are you feeling today?", kind: "free_mood", hint: "", choices: [] },
  { id: "health_rating", text: "How would you rate your overall health today, from one to ten?", kind: "rating", hint: "", choices: [] },
];
let qIndex = 0;
let commandTurns = 0;

function answerFor(lastSpoken: string): string | null {
  if (lastSpoken.includes("Say cancel")) return null; // silence → check-in proceeds automatically
  if (lastSpoken.includes("blood assessment is due")) return "yes";
  if (lastSpoken.includes("sample ready")) return "sample ready";
  if (lastSpoken.includes("feeling today")) return "I feel good";
  if (lastSpoken.includes("from one to ten")) return "I'd say about seven";
  if (lastSpoken.includes("assessment is complete") || lastSpoken.includes("heart rate is")) {
    commandTurns++;
    return commandTurns === 1 ? "What's my heart rate?" : "End check-in";
  }
  return null;
}

vi.mock("../features/voice/VoiceEngine", () => {
  const voice = {
    speak: vi.fn(async (t: string) => {
      spoken.push(t);
    }),
    listen: vi.fn(async () => {
      const text = answerFor(spoken[spoken.length - 1] ?? "");
      return text ? { text, source: "voice" } : null;
    }),
    openMic: vi.fn(async () => true),
    closeMic: vi.fn(),
    clearCaptions: vi.fn(),
    stopSpeaking: vi.fn(),
    setProcessing: vi.fn(),
    provideManual: manualUsed,
  };
  return { voice, wait: () => Promise.resolve() };
});

vi.mock("../services/api", () => {
  const api = {
    startCheckin: vi.fn(async () => ({
      checkin: { id: "ci-1", period: "evening", started_at: "2026-11-14T20:00:00Z", resumed: false },
      astronaut: { id: "AST-001", display_name: "Commander Alex", preferred_name: "Alex" },
      greeting: "Welcome back, Commander Alex. Your evening health assessment is beginning.",
      blood_test: { due_now: true },
      sensor_plan: [
        { device: "wearable_sync", label: "Wearable sync dock", short: "Wearable" },
        { device: "vitals_module", label: "Vitals module", short: "Vitals" },
      ],
    })),
    facialFrame: vi.fn(async () => ({ accepted: true, frames: 8, needed: 8, landmarks: [], complete: true, observation: { comparison: { status: "consistent" } } })),
    facialSkip: vi.fn(async () => ({})),
    collectSensor: vi.fn(async (_id: string, device: string) => ({ device, status: "ok", readings: [{ metric: "heart_rate", value: 64, unit: "bpm", device }] })),
    collectVoc: vi.fn(async () => ({ channels: [0.4, 0.5], analysis: { flagged: false, status: "consistent" }, simulated: true })),
    bloodRespond: vi.fn(async () => ({ accepted: true })),
    bloodStart: vi.fn(async () => ({ id: "bt-1", steps: ["Clean your fingertip.", "Insert the cartridge."] })),
    bloodAnalyze: vi.fn(async () => ({ test: { results: { hemoglobin: { label: "Hemoglobin", value: 15, unit: "g/dL", ref_low: 12, ref_high: 17.5 } } }, previous: null, schedule: {} })),
    nextQuestion: vi.fn(async () => (qIndex < QUESTIONS.length ? { done: false, question: QUESTIONS[qIndex], answered: qIndex } : { done: true, question: null, answered: qIndex })),
    answer: vi.fn(async (_id: string, qid: string, transcript: string) => {
      answerSpy(qid, transcript);
      qIndex++;
      return { accepted: true, acknowledgement: "Noted." };
    }),
    complete: vi.fn(async () => ({ status_level: "clear", status: "No significant changes detected", summary_text: "Alex, your assessment is complete. No significant changes detected.", observations: [], guidance: [], metrics: {} })),
    interpret: vi.fn(async (text: string) => ({ intent: /yes|ready/i.test(text) ? "affirm" : "unknown", params: {}, confidence: 1 })),
    ask: vi.fn(async (text: string) =>
      /heart rate/i.test(text)
        ? { intent: "query_metric", params: {}, confidence: 1, speech: "Your heart rate is 64 beats per minute.", ui: { action: "open_details", section: "trends", metric: "heart_rate" } }
        : { intent: "end_checkin", params: {}, confidence: 1, speech: null, ui: null },
    ),
    cancel: vi.fn(async () => cancelSpy()),
    logout: vi.fn(async () => ({})),
  };
  return { api, tokens: { setAstronaut: vi.fn() } };
});

import { useCheckinFlow } from "../features/check-in/useCheckinFlow";
import { api } from "../services/api";

const camera = { state: "on", grab: () => "data:image/jpeg;base64,AAAA" } as never;

describe("hands-free check-in", () => {
  beforeEach(() => {
    spoken.length = 0;
    qIndex = 0;
    commandTurns = 0;
    vi.clearAllMocks();
  });

  it("completes the whole assessment from a face session and spoken answers only", async () => {
    const onEmergency = vi.fn();
    const { result } = renderHook(() => useCheckinFlow({ camera, onEmergency }));
    const detailsOpened: boolean[] = [];

    await act(async () => {
      await result.current.begin({ token: "t", astronaut_id: "AST-001", display_name: "Commander Alex", preferred_name: "Alex" });
    });
    detailsOpened.push(result.current.state.details.open);

    // Spoken answers were parsed by the backend, not typed.
    expect(answerSpy).toHaveBeenCalledWith("feeling", "I feel good");
    expect(answerSpy).toHaveBeenCalledWith("health_rating", "I'd say about seven");
    expect(manualUsed).not.toHaveBeenCalled();
    // Every stage ran.
    expect(api.facialFrame).toHaveBeenCalled();
    expect(api.collectSensor).toHaveBeenCalledTimes(2);
    expect(api.collectVoc).toHaveBeenCalled();
    expect(api.bloodAnalyze).toHaveBeenCalledWith("bt-1");
    expect(api.complete).toHaveBeenCalledWith("ci-1");
    // Voice command in the summary triggered a real query.
    expect(api.ask).toHaveBeenCalledWith("What's my heart rate?", "ci-1");
    expect(spoken).toContain("Your heart rate is 64 beats per minute.");
    expect(spoken.some((s) => s.startsWith("Welcome back, Commander Alex"))).toBe(true);
    expect(onEmergency).not.toHaveBeenCalled();
    // Session closed and booth returned to stand-by.
    await waitFor(() => expect(result.current.state.stage).toBe("STANDBY"));
    expect(api.logout).toHaveBeenCalled();
  });

  it("switches to emergency when the astronaut says so mid-questionnaire", async () => {
    (api.answer as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ accepted: false, command: "emergency" }));
    const onEmergency = vi.fn();
    const { result } = renderHook(() => useCheckinFlow({ camera, onEmergency }));
    await act(async () => {
      await result.current.begin({ token: "t", astronaut_id: "AST-001", display_name: "Commander Alex", preferred_name: "Alex" });
    });
    expect(onEmergency).toHaveBeenCalledWith("I feel good");
    expect(cancelSpy).toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
  });
});
