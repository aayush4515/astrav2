export type StatusLevel = "clear" | "watch" | "review" | "urgent";
export type Severity = "info" | "watch" | "review" | "urgent";

export interface Astronaut {
  id: string;
  full_name: string;
  preferred_name: string;
  title: string;
  display_name: string;
  role: string;
  mission: string;
  face_enrolled: boolean;
  scenario: string;
  synthetic_profile: boolean;
  date_of_birth?: string | null;
}

export interface RosterEntry {
  id: string;
  display_name: string;
  full_name: string;
  role: string;
  face_enrolled: boolean;
  synthetic_profile: boolean;
}

export interface AuthSession {
  token: string;
  astronaut_id: string;
  display_name: string;
  preferred_name: string;
  method?: "face" | "operator_recovery";
}

export interface FaceBox {
  bbox: [number, number, number, number];
  score: number;
  quality: { ok: boolean; issues: string[] };
}

export type RecognitionStatus =
  | "no_face"
  | "multiple_faces"
  | "low_quality"
  | "unknown"
  | "ambiguous"
  | "no_enrollments"
  | "matching"
  | "confirmed"
  | "present";

export interface RecognitionResult {
  status: RecognitionStatus;
  message: string;
  faces?: FaceBox[];
  similarity?: number;
  progress?: number;
  session?: AuthSession;
}

export interface Reading {
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
  source: string;
  device: string;
  quality: string;
  simulated: boolean;
  valid: boolean;
}

export interface MetricState {
  label: string;
  value: number;
  unit: string;
  region: string;
  device: string;
  simulated: boolean;
  context: string;
  ref_low: number | null;
  ref_high: number | null;
  outside_reference: boolean;
  z: number | null;
  baseline: number | null;
  spread: number | null;
  trend_per_day: number | null;
  n?: number;
  status: "normal" | "watch" | "notable" | "no_baseline" | "context_excluded";
}

export interface Observation {
  category: string;
  severity: Severity;
  method: string;
  title: string;
  explanation: string;
  metrics: string[];
  comparison: Record<string, unknown>;
  guidance_ids: string[];
  uncertainty: string | null;
  experimental: boolean;
}

export interface Guidance {
  id: string;
  tier: "routine" | "confirm" | "review" | "urgent";
  category: string;
  title: string;
  spoken: string;
  steps: string[];
  why: string;
  source: string;
  demo_only: boolean;
}

export interface FacialFeatureComparison {
  label: string;
  unit: string;
  current: number;
  reference: number;
  delta: number;
  z: number;
  flagged: boolean;
  n_reference: number;
}

export interface FacialComparison {
  status: "insufficient_history" | "consistent" | "changed";
  flagged: string[];
  features: Record<string, FacialFeatureComparison>;
  explanation?: string;
  message?: string;
}

export interface VocAnalysis {
  status: "insufficient_history" | "consistent" | "deviation";
  flagged: boolean;
  similarity?: number;
  deviating_channels?: { channel: number; label: string; z: number; current: number; baseline: number }[];
  channel_z?: number[];
  baseline?: number[];
  pca?: { history: [number, number][]; current: [number, number] };
  isolation_score?: number | null;
  explanation?: string;
  message?: string;
  n_history?: number;
  possible_interference?: string[];
}

export interface AnalysisResult {
  checkin_id: string;
  status_level: StatusLevel;
  status: string;
  metrics: Record<string, MetricState>;
  observations: Observation[];
  guidance: Guidance[];
  facial: FacialComparison | null;
  voc: VocAnalysis | null;
  multivariate: { score: number; percentile_vs_history: number; n_history: number; note: string } | null;
  summary_text: string;
  data_provenance: { simulated_readings: number; real_readings: number; user_reported: number; note: string };
  disclaimer: string;
  reminders?: { kind: string; title: string; due: string; status: string }[];
  report?: CommMessage;
}

export interface Question {
  id: string;
  text: string;
  kind: string;
  hint: string;
  choices: string[];
}

export interface BloodSchedule {
  reminder_id: string;
  next_due: string;
  status: "scheduled" | "due" | "overdue" | "snoozed";
  due_now: boolean;
  snoozed_until: string | null;
  last_completed: string | null;
  interval_days: number;
  steps?: string[];
}

export interface LabResult {
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
  label: string;
}

export interface LabTest {
  id: string;
  completed_at: string;
  simulated: boolean;
  analyzer: string;
  results: Record<string, LabResult>;
}

export interface CommMessage {
  id: string;
  kind: string;
  priority: "routine" | "high" | "critical";
  astronaut_id: string | null;
  subject: string;
  status: "created" | "queued" | "in_transit" | "delivered" | "acknowledged";
  attempts: number;
  created_at: string | null;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  payload?: Record<string, any>;
}

export interface LinkState {
  link_up: boolean;
  delay_s: number;
}

export interface SeriesPoint {
  t: string;
  v: number;
  valid: boolean;
  simulated: boolean;
  context: string;
}

export interface Insights {
  astronaut: Astronaut;
  latest: (Partial<AnalysisResult> & { id: string; t: string; period: string; guidance_ids?: string[] }) | null;
  series: Record<string, SeriesPoint[]>;
  baselines: Record<string, { median: number; spread: number; n: number; trend_per_day: number | null }>;
  facial: { id: string; t: string; features: Record<string, number>; is_reference: boolean; comparison: FacialComparison | null }[];
  facial_features: Record<string, { label: string; unit: string; description: string }>;
  voc: { id: string; t: string; channels: number[]; status: string | null; similarity: number | null; analysis: VocAnalysis | null }[];
  labs: LabTest[];
  blood_schedule: BloodSchedule;
  observations: (Observation & { id: string; t: string })[];
  checkins: { id: string; t: string; period: string; status_level: StatusLevel | null; status: string | null; seeded: boolean }[];
  subjective: { t: string; q: string; v: number | boolean | null }[];
  metrics_catalog: Record<string, { key: string; label: string; unit: string; region: string; why: string; how: string; ref_low: number | null; ref_high: number | null }>;
}

export interface EmergencyProtocol {
  id: string;
  title: string;
  priority_action: string;
  steps: { title: string; instruction: string }[];
  for_crewmate: boolean;
}

export interface EmergencyEvent {
  id: string;
  status: "active" | "resolved";
  trigger: string;
  protocol: EmergencyProtocol | null;
  current_step: number;
  started_at: string;
  crew_alerted_at: string | null;
  resolved_at: string | null;
  log: { t: string; event: string }[];
  patient: { id: string; name: string; full_name: string; latest_vitals: Record<string, { label: string; value: number; unit: string; simulated: boolean }> } | null;
  message: CommMessage | null;
  link: LinkState;
}

export interface VoiceIntent {
  intent: string;
  params: Record<string, string | boolean>;
  confidence: number;
  speech?: string | null;
  ui?: { action: string; section?: string; metric?: string; region?: string } | null;
}

export type VoiceState = "idle" | "speaking" | "listening" | "transcribing" | "processing" | "confirming" | "error";

export type DeviceId =
  | "face_camera"
  | "wearable_sync"
  | "vitals_module"
  | "thermal_module"
  | "mass_module"
  | "e_nose"
  | "blood_analyzer"
  | "environment";
