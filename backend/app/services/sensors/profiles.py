"""Deterministic physiology profiles and scenario effects for the simulated hardware.

Nothing here is random at call time: every value is a pure function of (astronaut, timestamp,
period, metric, scenario) so demos are reproducible.
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

from app.services.sensors.catalog import VOC_CHANNELS


@dataclass(frozen=True)
class Profile:
    means: dict[str, float]
    sds: dict[str, float]
    voc_base: tuple[float, ...] = field(default_factory=tuple)


_POPULATION = {
    "heart_rate": (66, 4), "resting_heart_rate": (56, 2.5), "hrv_rmssd": (52, 6), "systolic_bp": (116, 5),
    "diastolic_bp": (74, 4), "spo2": (98, 0.8), "respiratory_rate": (14, 1.0), "body_temperature": (36.7, 0.15),
    "body_mass": (74, 0.25), "sleep_duration": (7.3, 0.45), "sleep_efficiency": (90, 3),
    "exercise_minutes": (135, 15),
}

# Hand-tuned baselines for the seeded crew so each astronaut is visibly different.
_SEEDED: dict[str, dict[str, float]] = {
    "AST-001": {"heart_rate": 62, "resting_heart_rate": 52, "hrv_rmssd": 61, "systolic_bp": 118, "diastolic_bp": 76,
                "body_mass": 81.4, "sleep_duration": 7.4, "body_temperature": 36.6},
    "AST-002": {"heart_rate": 64, "resting_heart_rate": 55, "hrv_rmssd": 58, "systolic_bp": 108, "diastolic_bp": 69,
                "body_mass": 61.2, "sleep_duration": 7.6, "body_temperature": 36.8},
    "AST-003": {"heart_rate": 70, "resting_heart_rate": 59, "hrv_rmssd": 44, "systolic_bp": 124, "diastolic_bp": 80,
                "body_mass": 77.9, "sleep_duration": 6.9, "body_temperature": 36.7},
    "AST-004": {"heart_rate": 67, "resting_heart_rate": 57, "hrv_rmssd": 49, "systolic_bp": 121, "diastolic_bp": 78,
                "body_mass": 84.6, "sleep_duration": 7.1, "body_temperature": 36.6},
}


def seed_for(*parts: object) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode()) & 0x7FFFFFFF


def rng_for(*parts: object) -> np.random.RandomState:
    return np.random.RandomState(seed_for(*parts))


def profile_for(astronaut_id: str) -> Profile:
    r = rng_for("profile", astronaut_id)
    means, sds = {}, {}
    for k, (m, sd) in _POPULATION.items():
        means[k] = _SEEDED.get(astronaut_id, {}).get(k, m + r.normal(0, sd * 1.5))
        sds[k] = sd
    voc = tuple(float(v) for v in 0.35 + 0.5 * rng_for("voc-base", astronaut_id).rand(VOC_CHANNELS))
    return Profile(means, sds, voc)


SCENARIOS: dict[str, dict] = {
    "normal": {"label": "A · Normal assessment", "effects": {}},
    "gradual_change": {
        "label": "B · Gradual pattern change (sleep / heart rate / fatigue)",
        "effects": {"resting_heart_rate": 10, "heart_rate": 12, "hrv_rmssd": -19, "sleep_duration": -2.0,
                    "sleep_efficiency": -11, "exercise_minutes": -45},
        "ramp_days": 6,
    },
    "voc_anomaly": {"label": "D · Experimental VOC anomaly", "effects": {}, "voc_shift": True},
    "fever": {"label": "Elevated temperature", "effects": {"body_temperature": 1.6, "heart_rate": 18,
                                                            "respiratory_rate": 5, "resting_heart_rate": 9}},
    "mass_loss": {"label": "Body-mass decline", "effects": {"body_mass": -2.6}, "ramp_days": 14},
    "sensor_fault": {"label": "Vitals module fault", "effects": {}, "faulty_devices": ["vitals_module"]},
    "high_co2": {"label": "Elevated cabin CO₂", "effects": {}, "environment": {"cabin_co2": 5200}},
    "acute_event": {"label": "F · Acute cardiovascular event (emergency drill)",
                    "effects": {"heart_rate": 52, "systolic_bp": -28, "diastolic_bp": -16, "spo2": -7,
                                "respiratory_rate": 9}},
}

# Subjective answers used when seeding history so questionnaires match each scenario.
SCENARIO_SUBJECTIVE = {
    "normal": {"health_rating": 8, "fatigue": False, "mood": "positive"},
    "gradual_change": {"health_rating": 5, "fatigue": True, "mood": "low"},
    "fever": {"health_rating": 4, "fatigue": True, "mood": "neutral"},
}


def scenario_strength(scenario: str, days_into: float | None) -> float:
    """1.0 for live check-ins; ramps 0→1 across the seeded history for gradual scenarios."""
    spec = SCENARIOS.get(scenario, SCENARIOS["normal"])
    ramp = spec.get("ramp_days")
    if days_into is None or not ramp:
        return 1.0 if days_into is None or days_into >= 0 else 0.0
    if days_into < 0:
        return 0.0
    return float(min(1.0, (days_into + 1) / ramp))


def metric_value(astronaut_id: str, metric: str, ts: datetime, period: str, scenario: str,
                 strength: float) -> float:
    prof = profile_for(astronaut_id)
    r = rng_for(astronaut_id, metric, ts.date().isoformat(), period)
    base = prof.means[metric]
    # Small circadian difference between morning and evening sessions.
    if period == "evening" and metric in {"heart_rate", "body_temperature", "systolic_bp"}:
        base += {"heart_rate": 3, "body_temperature": 0.2, "systolic_bp": 2}[metric]
    val = base + r.normal(0, prof.sds[metric])
    val += SCENARIOS.get(scenario, {}).get("effects", {}).get(metric, 0) * strength
    if metric == "spo2":
        val = min(100.0, val)
    if metric == "sleep_efficiency":
        val = min(99.0, val)
    return val


def voc_vector(astronaut_id: str, ts: datetime, period: str, scenario: str, strength: float) -> list[float]:
    prof = profile_for(astronaut_id)
    r = rng_for("voc", astronaut_id, ts.date().isoformat(), period)
    base = np.array(prof.voc_base)
    vec = base * (1 + r.normal(0, 0.04, VOC_CHANNELS)) + r.normal(0, 0.01, VOC_CHANNELS)
    if SCENARIOS.get(scenario, {}).get("voc_shift"):
        shift = np.zeros(VOC_CHANNELS)
        shift[[2, 5, 6, 11]] = [0.32, -0.22, 0.27, 0.18]
        vec = vec + shift * strength
    return [round(float(v), 4) for v in np.clip(vec, 0.01, 1.5)]


def environment_values(ts: datetime, period: str, scenario: str) -> dict[str, float]:
    r = rng_for("env", ts.date().isoformat(), period)
    vals = {
        "cabin_co2": 2300 + r.normal(0, 180),
        "cabin_ppo2": 21.2 + r.normal(0, 0.2),
        "cabin_temp": 22.4 + r.normal(0, 0.5),
        "cabin_humidity": 45 + r.normal(0, 3),
        "radiation_dose_rate": 1.80 + r.normal(0, 0.06),
    }
    vals.update(SCENARIOS.get(scenario, {}).get("environment", {}))
    return vals


def lab_values(astronaut_id: str, ts: datetime, scenario: str) -> dict[str, float]:
    r = rng_for("lab", astronaut_id, ts.date().isoformat())
    female = astronaut_id in {"AST-002"}
    vals = {
        "hemoglobin": (13.6 if female else 15.1) + r.normal(0, 0.3),
        "hematocrit": (40.5 if female else 44.5) + r.normal(0, 0.9),
        "glucose": 88 + r.normal(0, 5),
        "wbc": 6.3 + r.normal(0, 0.5),
        "lymphocytes_pct": 31 + r.normal(0, 2.5),
    }
    if scenario == "fever":
        vals["wbc"] += 4.2
        vals["lymphocytes_pct"] -= 9
    if scenario == "gradual_change":
        vals["lymphocytes_pct"] -= 5
    return vals
