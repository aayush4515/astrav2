"""Metric and device catalog shared by sensors, analysis, guidance and the frontend.

Reference ranges are general adult reference values used for illustration. They are NOT NASA
flight-medicine criteria and must not be read as such.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    unit: str
    device: str
    region: str  # body-map region
    decimals: int
    ref_low: float | None = None
    ref_high: float | None = None
    why: str = ""
    how: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


METRICS: dict[str, Metric] = {
    m.key: m
    for m in [
        Metric("heart_rate", "Heart rate", "bpm", "vitals_module", "cardiovascular", 0, 50, 100,
               "Fluid shifts and deconditioning in microgravity change cardiovascular load.",
               "Sit or hold still at the booth handrail; the pulse oximeter clip reads your pulse."),
        Metric("resting_heart_rate", "Resting heart rate (sleep)", "bpm", "wearable_sync", "cardiovascular", 0, 40, 90,
               "Night-time resting heart rate is a sensitive marker of recovery, stress and illness.",
               "Measured automatically by your wrist wearable during sleep."),
        Metric("hrv_rmssd", "Heart-rate variability", "ms", "wearable_sync", "cardiovascular", 0, None, None,
               "Lower HRV relative to your own baseline can indicate stress or poor recovery.",
               "Calculated by the wearable from beat-to-beat intervals during sleep."),
        Metric("systolic_bp", "Systolic blood pressure", "mmHg", "vitals_module", "cardiovascular", 0, 90, 139,
               "Spaceflight alters blood volume and vascular regulation.",
               "Arm cuff inflates automatically. Keep your arm relaxed at heart level."),
        Metric("diastolic_bp", "Diastolic blood pressure", "mmHg", "vitals_module", "cardiovascular", 0, 60, 89,
               "Spaceflight alters blood volume and vascular regulation.",
               "Measured together with systolic pressure by the arm cuff."),
        Metric("spo2", "Blood oxygen saturation", "%", "vitals_module", "respiratory", 0, 95, 100,
               "Confirms that the body is oxygenating well in the closed cabin atmosphere.",
               "Finger clip pulse oximeter. Keep the finger still and warm."),
        Metric("respiratory_rate", "Respiratory rate", "/min", "thermal_module", "respiratory", 0, 12, 20,
               "Breathing rate rises with fever, anxiety, exertion or elevated cabin CO₂.",
               "Thermal camera tracks temperature changes at the nostrils while you breathe normally."),
        Metric("body_temperature", "Body temperature", "°C", "thermal_module", "general", 1, 36.1, 37.5,
               "Immune changes in spaceflight can make infections more likely; fever is an early sign.",
               "Thermal imaging of the inner eye corner estimates core temperature. Remove glasses."),
        Metric("body_mass", "Body mass", "kg", "mass_module", "musculoskeletal", 1, None, None,
               "Weight loss in flight is common and can reflect inadequate nutrition or muscle loss.",
               "Microgravity mass device: hold the handles; a spring mechanism measures your inertia."),
        Metric("sleep_duration", "Sleep duration", "h", "wearable_sync", "wellbeing", 1, 6.5, None,
               "Isolation, light cycles and workload disrupt sleep, affecting performance and mood.",
               "Recorded by your wrist wearable overnight."),
        Metric("sleep_efficiency", "Sleep efficiency", "%", "wearable_sync", "wellbeing", 0, 80, None,
               "Fragmented sleep lowers recovery even if total time looks normal.",
               "Share of time in bed actually asleep, from the wearable."),
        Metric("exercise_minutes", "Exercise (previous day)", "min", "wearable_sync", "musculoskeletal", 0, 90, None,
               "Daily resistive and aerobic exercise is the main countermeasure to bone and muscle loss.",
               "Counted from your wearable and exercise-device logs."),
    ]
}

ENVIRONMENT_METRICS: dict[str, Metric] = {
    m.key: m
    for m in [
        Metric("cabin_co2", "Cabin CO₂", "ppm", "environment", "environment", 0, None, 3000,
               "Elevated CO₂ in closed cabins is associated with headaches and reduced performance."),
        Metric("cabin_ppo2", "Oxygen partial pressure", "kPa", "environment", "environment", 1, 19.5, 23.1),
        Metric("cabin_temp", "Cabin temperature", "°C", "environment", "environment", 1, 18, 27),
        Metric("cabin_humidity", "Relative humidity", "%", "environment", "environment", 0, 25, 70),
        Metric("radiation_dose_rate", "Radiation dose rate", "mSv/day", "environment", "environment", 2, None, None,
               "Deep-space radiation exposure accumulates over the mission; tracked per crew member."),
    ]
}


@dataclass(frozen=True)
class Device:
    id: str
    label: str
    short: str
    description: str
    measures: tuple[str, ...]
    concept_note: str
    real_hardware_in_prototype: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


DEVICES: dict[str, Device] = {
    d.id: d
    for d in [
        Device("face_camera", "Facial recognition camera", "Face camera",
               "Identifies the astronaut and measures facial geometry against their personal reference.",
               ("identity", "facial_geometry"),
               "Uses the real webcam in this prototype.", True),
        Device("wearable_sync", "Wearable sync dock", "Wearable",
               "Downloads overnight data from the astronaut's wrist wearable.",
               ("resting_heart_rate", "hrv_rmssd", "sleep_duration", "sleep_efficiency", "exercise_minutes"),
               "Simulated wearable adapter."),
        Device("vitals_module", "Vitals module", "Vitals",
               "Automatic arm cuff and finger pulse oximeter.",
               ("heart_rate", "systolic_bp", "diastolic_bp", "spo2"),
               "Simulated cuff / oximeter adapter."),
        Device("thermal_module", "Thermal imaging array", "Thermal",
               "Contactless temperature and breathing-rate estimation.",
               ("body_temperature", "respiratory_rate"),
               "Simulated thermal camera adapter."),
        Device("mass_module", "Body-mass measurement device", "Mass",
               "Microgravity-compatible mass measurement using a known spring force and the resulting acceleration "
               "(the concept behind the ISS SLAMMD).",
               ("body_mass",),
               "Simulated adapter; concept only."),
        Device("e_nose", "Electronic nose (VOC array)", "E-nose",
               "Experimental 16-channel metal-oxide sensor array that records a skin volatile-organic-compound "
               "fingerprint. Research feature: tracks change from the astronaut's own pattern only.",
               ("voc_fingerprint",),
               "Simulated e-nose adapter; experimental."),
        Device("blood_analyzer", "Point-of-care blood analyzer", "Blood lab",
               "Weekly finger-stick sample analysed onboard for a small panel of markers. "
               "The astronaut collects the sample manually.",
               ("hemoglobin", "hematocrit", "glucose", "wbc", "lymphocytes_pct"),
               "Simulated analyzer; no real blood analysis."),
        Device("environment", "Cabin environment sensors", "Cabin",
               "Habitat atmosphere and radiation context for interpreting body measurements.",
               tuple(ENVIRONMENT_METRICS),
               "Simulated habitat telemetry."),
    ]
}

# Order in which the booth runs the automatic sensor stations.
CHECKIN_SENSOR_SEQUENCE = ["wearable_sync", "vitals_module", "thermal_module", "mass_module"]

LAB_MARKERS = {
    "hemoglobin": ("Hemoglobin", "g/dL", 12.0, 17.5, 1),
    "hematocrit": ("Hematocrit", "%", 36.0, 50.0, 1),
    "glucose": ("Glucose (fasting)", "mg/dL", 70.0, 99.0, 0),
    "wbc": ("White blood cells", "10⁹/L", 4.0, 11.0, 1),
    "lymphocytes_pct": ("Lymphocytes", "%", 20.0, 40.0, 0),
}

VOC_CHANNELS = 16
