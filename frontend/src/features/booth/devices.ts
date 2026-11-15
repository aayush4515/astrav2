import type { DeviceId } from "../../types";

export interface BoothDevice {
  id: DeviceId;
  label: string;
  short: string;
  description: string;
  measures: string;
  real: boolean;
  /** Where the camera looks when this device is active. */
  focus: [number, number, number];
  color: string;
}

export const BOOTH_DEVICES: Record<DeviceId, BoothDevice> = {
  face_camera: {
    id: "face_camera",
    label: "Facial recognition camera",
    short: "Face camera",
    description: "Identifies the astronaut and measures facial geometry against their personal reference.",
    measures: "Identity · eyelid opening · facial symmetry · brow and mouth alignment",
    real: true,
    focus: [0, 1.62, 0],
    color: "#5ee7ff",
  },
  thermal_module: {
    id: "thermal_module",
    label: "Thermal imaging array",
    short: "Thermal",
    description: "Contactless body temperature and breathing-rate estimation.",
    measures: "Body temperature · breathing rate",
    real: false,
    focus: [0.6, 1.5, 0.2],
    color: "#fb923c",
  },
  wearable_sync: {
    id: "wearable_sync",
    label: "Wearable sync dock",
    short: "Wearable",
    description: "Downloads overnight sleep, resting heart rate and heart-rate variability from the wrist wearable.",
    measures: "Sleep duration · sleep efficiency · resting heart rate · HRV · exercise minutes",
    real: false,
    focus: [-0.45, 1.0, 0.2],
    color: "#a78bfa",
  },
  vitals_module: {
    id: "vitals_module",
    label: "Vitals module",
    short: "Vitals",
    description: "Automatic arm cuff and finger pulse oximeter.",
    measures: "Heart rate · blood pressure · blood oxygen (SpO₂)",
    real: false,
    focus: [0.45, 1.15, 0.1],
    color: "#f472b6",
  },
  mass_module: {
    id: "mass_module",
    label: "Body-mass measurement",
    short: "Mass",
    description: "Microgravity mass measurement: a known spring force and the resulting acceleration give body mass (the SLAMMD principle).",
    measures: "Body mass (kg)",
    real: false,
    focus: [0, 0.85, 0],
    color: "#4ade80",
  },
  e_nose: {
    id: "e_nose",
    label: "Electronic nose (VOC)",
    short: "E-nose",
    description: "Experimental 16-channel metal-oxide array recording a skin volatile-organic-compound fingerprint. Tracks change from your own pattern only.",
    measures: "Skin VOC fingerprint (experimental)",
    real: false,
    focus: [-0.75, 1.1, 0.35],
    color: "#facc15",
  },
  blood_analyzer: {
    id: "blood_analyzer",
    label: "Point-of-care blood analyzer",
    short: "Blood lab",
    description: "Weekly finger-stick sample analysed onboard. The astronaut collects the sample manually.",
    measures: "Hemoglobin · hematocrit · glucose · WBC · lymphocytes",
    real: false,
    focus: [1.15, 1.0, 0.35],
    color: "#f87171",
  },
  environment: {
    id: "environment",
    label: "Cabin environment sensors",
    short: "Cabin",
    description: "Cabin CO₂, oxygen, temperature, humidity and radiation dose — context for interpreting body measurements.",
    measures: "CO₂ · ppO₂ · temperature · humidity · radiation",
    real: false,
    focus: [-1.1, 2.0, -0.4],
    color: "#38bdf8",
  },
};
