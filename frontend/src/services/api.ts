import type {
  AnalysisResult,
  Astronaut,
  AuthSession,
  BloodSchedule,
  CommMessage,
  EmergencyEvent,
  EmergencyProtocol,
  Insights,
  LabTest,
  LinkState,
  Question,
  Reading,
  RecognitionResult,
  RosterEntry,
  VocAnalysis,
  VoiceIntent,
} from "../types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let astronautToken: string | null = null;
const OP_KEY = "astra.operatorToken";

export const tokens = {
  setAstronaut(t: string | null) {
    astronautToken = t;
  },
  get astronaut() {
    return astronautToken;
  },
  setOperator(t: string | null) {
    try {
      if (t) sessionStorage.setItem(OP_KEY, t);
      else sessionStorage.removeItem(OP_KEY);
    } catch {
      /* storage unavailable */
    }
  },
  get operator(): string | null {
    try {
      return sessionStorage.getItem(OP_KEY);
    } catch {
      return null;
    }
  },
};

type Auth = "astronaut" | "operator" | "none";

async function request<T>(path: string, opts: { method?: string; body?: unknown; auth?: Auth; raw?: BodyInit; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = opts.auth === "astronaut" ? astronautToken : opts.auth === "operator" ? tokens.operator : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined = opts.raw;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.raw) headers["Content-Type"] = "audio/wav";
  const res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal });
  if (!res.ok) {
    if (res.status === 401 && opts.auth === "operator") {
      tokens.setOperator(null);
      window.dispatchEvent(new Event("astra:operator-expired"));
    }
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.headers.get("content-type")?.includes("application/json")) return (await res.json()) as T;
  return (await res.arrayBuffer()) as unknown as T;
}

export interface HealthStatus {
  status: string;
  mission: { name: string; day: number };
  engines: Record<string, { ready: boolean; error?: string | null; loading?: boolean; engine?: string }>;
}

export interface CheckinStart {
  checkin: { id: string; period: string; started_at: string; resumed: boolean };
  astronaut: Astronaut;
  greeting: string;
  blood_test: BloodSchedule;
  sensor_plan: { device: string; label: string; short: string }[];
}

export interface FacialFrameResult {
  accepted: boolean;
  frames: number;
  needed: number;
  issues?: string[];
  guidance?: string;
  landmarks: [number, number][];
  complete?: boolean;
  quality?: Record<string, unknown>;
  observation?: { id: string; features: Record<string, number>; comparison: AnalysisResult["facial"] } | null;
}

export interface AnswerResult {
  accepted: boolean;
  command?: string;
  clarification?: string;
  acknowledgement?: string;
  chest_pain?: boolean;
}

export interface EnrollFrameResult {
  captured: number;
  needed: number;
  accepted: boolean;
  status: string;
  message: string;
  next_prompt?: string | null;
  faces?: { bbox: [number, number, number, number] }[];
}

export const api = {
  health: () => request<HealthStatus>("/api/health"),
  roster: () => request<RosterEntry[]>("/api/astronauts"),
  register: (body: Record<string, unknown>) =>
    request<{ astronaut: Astronaut; enrollment_ticket: string }>("/api/astronauts", { body }),

  enrollStart: (astronaut_id: string) =>
    request<{ ticket: string; astronaut: Astronaut; captures_needed: number; first_prompt: string }>("/api/enrollment/start", {
      body: { astronaut_id },
      auth: tokens.operator ? "operator" : "none",
    }),
  enrollFrame: (ticket: string, image: string) => request<EnrollFrameResult>("/api/enrollment/frame", { body: { ticket, image } }),
  enrollFinalize: (ticket: string) =>
    request<{ enrolled: boolean; astronaut: Astronaut; templates: number; facial_reference: boolean }>("/api/enrollment/finalize", { body: { ticket } }),
  enrollCancel: (ticket: string) => request("/api/enrollment/cancel", { body: { ticket } }),

  recognize: (image: string, client_id: string, mode: "identify" | "presence" = "identify") =>
    request<RecognitionResult>("/api/auth/face", { body: { image, client_id, mode } }),
  logout: () => request("/api/auth/logout", { method: "POST", auth: "astronaut" }),
  operatorLogin: (pin: string) => request<{ token: string }>("/api/auth/operator", { body: { pin } }),
  recovery: (astronaut_id: string, reason: string) =>
    request<AuthSession>("/api/auth/recovery", { body: { astronaut_id, reason }, auth: "operator" }),

  startCheckin: () => request<CheckinStart>("/api/checkins", { method: "POST", auth: "astronaut" }),
  facialFrame: (id: string, image: string) =>
    request<FacialFrameResult>(`/api/checkins/${id}/facial/frame`, { body: { image }, auth: "astronaut" }),
  facialSkip: (id: string, reason: string) => request(`/api/checkins/${id}/facial/skip`, { body: { reason }, auth: "astronaut" }),
  collectSensor: (id: string, device: string) =>
    request<{ device: string; status: "ok" | "fault"; message?: string; readings: Reading[] }>(`/api/checkins/${id}/sensors/${device}`, {
      method: "POST",
      auth: "astronaut",
    }),
  collectVoc: (id: string) =>
    request<{ channels: number[]; analysis: VocAnalysis; simulated: boolean }>(`/api/checkins/${id}/voc`, { method: "POST", auth: "astronaut" }),
  nextQuestion: (id: string) =>
    request<{ done: boolean; question: Question | null; answered: number }>(`/api/checkins/${id}/questionnaire/next`, { auth: "astronaut" }),
  answer: (id: string, question_id: string, transcript: string, input_mode: "voice" | "manual" = "voice") =>
    request<AnswerResult>(`/api/checkins/${id}/questionnaire/answer`, { body: { question_id, transcript, input_mode }, auth: "astronaut" }),
  complete: (id: string) => request<AnalysisResult>(`/api/checkins/${id}/complete`, { method: "POST", auth: "astronaut" }),
  cancel: (id: string, reason: string) => request(`/api/checkins/${id}/cancel`, { body: { reason }, auth: "astronaut" }),
  insights: () => request<Insights>("/api/me/insights", { auth: "astronaut" }),

  bloodSchedule: () => request<BloodSchedule>("/api/blood-tests/schedule", { auth: "astronaut" }),
  bloodRespond: (answer: "yes" | "not_now" | "later") =>
    request<{ accepted: boolean; steps?: string[]; schedule?: BloodSchedule }>("/api/blood-tests/respond", { body: { answer }, auth: "astronaut" }),
  bloodStart: (checkin_id: string | null) =>
    request<{ id: string; steps: string[] }>("/api/blood-tests", { body: { checkin_id }, auth: "astronaut" }),
  bloodAnalyze: (id: string) =>
    request<{ test: LabTest; previous: LabTest | null; schedule: BloodSchedule }>(`/api/blood-tests/${id}/analyze`, {
      method: "POST",
      auth: "astronaut",
    }),

  transcribe: (wav: Blob, signal?: AbortSignal) =>
    request<{ text: string; confidence: number; duration: number }>("/api/voice/transcribe", { raw: wav, signal, method: "POST" }),
  synthesize: async (text: string, signal?: AbortSignal): Promise<ArrayBuffer> =>
    request<ArrayBuffer>("/api/voice/synthesize", { body: { text }, signal }),
  interpret: (text: string, context?: string) => request<VoiceIntent>("/api/voice/interpret", { body: { text, context } }),
  ask: (text: string, checkin_id?: string | null, context?: string) =>
    request<VoiceIntent>("/api/voice/ask", { body: { text, checkin_id, context }, auth: "astronaut" }),
  voiceStatus: () => request<{ stt: { ready: boolean }; tts: { ready: boolean } }>("/api/voice/status"),

  emergencyProtocols: () => request<EmergencyProtocol[]>("/api/emergencies/protocols"),
  emergencyCrew: () => request<{ id: string; name: string }[]>("/api/emergencies/crew"),
  emergencyActivate: (body: { trigger: "voice" | "button"; protocol_id?: string; patient_id?: string; transcript?: string; reporter_id?: string }) =>
    request<EmergencyEvent>("/api/emergencies", { body }),
  emergencyActive: () => request<EmergencyEvent | null>("/api/emergencies/active"),
  emergencyStep: (id: string, action: "next" | "back" | "goto", step?: number) =>
    request<EmergencyEvent>(`/api/emergencies/${id}/step`, { body: { action, step } }),
  emergencyProtocol: (id: string, protocol_id: string, patient_id?: string) =>
    request<EmergencyEvent>(`/api/emergencies/${id}/protocol`, { body: { protocol_id, patient_id } }),
  emergencyResolve: (id: string) => request<EmergencyEvent>(`/api/emergencies/${id}/resolve`, { method: "POST" }),

  mcOverview: () =>
    request<{ link: LinkState; crew: (Astronaut & { last_report: CommMessage | null; pending_reports: number })[]; messages: CommMessage[]; emergencies: CommMessage[]; counts: Record<string, number> }>(
      "/api/mission-control/overview",
      { auth: "operator" },
    ),
  mcMessage: (id: string) => request<CommMessage>(`/api/mission-control/messages/${id}`, { auth: "operator" }),
  mcAck: (id: string, by: string) => request<CommMessage>(`/api/mission-control/messages/${id}/ack`, { body: { by }, auth: "operator" }),
  mcAstronaut: (id: string) => request<Insights>(`/api/mission-control/astronauts/${id}`, { auth: "operator" }),
  setLink: (body: Partial<LinkState>) => request<LinkState>("/api/comms/link", { body, auth: "operator" }),

  demoScenarios: () =>
    request<{ scenarios: Record<string, string>; astronauts: { id: string; display_name: string; scenario: string; face_enrolled: boolean; blood_test: BloodSchedule }[]; environment: Record<string, { value: number; unit: string }> }>(
      "/api/demo/scenarios",
      { auth: "operator" },
    ),
  setScenario: (id: string, scenario: string) => request(`/api/demo/astronauts/${id}/scenario`, { body: { scenario }, auth: "operator" }),
  forceBloodDue: (id: string) => request(`/api/demo/astronauts/${id}/blood-test-due`, { method: "POST", auth: "operator" }),
  resetDemo: () => request("/api/demo/reset", { method: "POST", auth: "operator" }),
  deleteBiometrics: (id: string) => request(`/api/admin/astronauts/${id}/biometrics`, { method: "DELETE", auth: "operator" }),
  audit: () => request<{ t: string; actor: string; action: string; astronaut_id: string | null; detail: string | null }[]>("/api/admin/audit", { auth: "operator" }),
};
