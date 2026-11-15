"""Personalized, explainable health assessment for one check-in.

Layers (all deterministic and reproducible from stored data):
  1. Safety rules on general reference values (illustrative; NOT NASA flight-medicine criteria)
  2. Per-astronaut robust baseline deviation and 7-day trend for each metric
  3. Multimodal pattern rules combining vitals, sleep, face, VOC, labs, questionnaire and environment
  4. A multivariate Isolation Forest departure score as supporting evidence only

Statistical anomalies are never presented as diagnoses, and the emergency workflow never depends on them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Astronaut,
    BloodTestResult,
    CheckIn,
    EnvironmentReading,
    FacialObservation,
    GuidanceRecord,
    HealthObservation,
    QuestionnaireResponse,
    SensorReading,
    VocMeasurement,
)
from app.services.guidance.library import LIBRARY
from app.services.health import baselines as bl
from app.services.sensors.catalog import LAB_MARKERS, METRICS

SEVERITY_RANK = {"info": 0, "watch": 1, "review": 2, "urgent": 3}
STATUS = {
    0: ("clear", "No significant changes detected"),
    1: ("watch", "Additional assessment suggested"),
    2: ("review", "Crew medical review recommended"),
    3: ("urgent", "Urgent crew medical attention"),
}
# Deviations that only matter in one direction (a higher SpO2 or longer exercise is not a concern).
ONE_SIDED = {"spo2": "low", "hrv_rmssd": "low", "sleep_efficiency": "low", "exercise_minutes": "low"}
MULTIVARIATE_METRICS = ["resting_heart_rate", "hrv_rmssd", "sleep_duration", "heart_rate", "systolic_bp",
                        "body_temperature"]


@dataclass
class Finding:
    category: str
    severity: str
    method: str
    title: str
    explanation: str
    metrics: list[str] = field(default_factory=list)
    comparison: dict = field(default_factory=dict)
    guidance: list[str] = field(default_factory=list)
    uncertainty: str | None = None
    experimental: bool = False
    spoken: str | None = None


def _subjective(responses: list[QuestionnaireResponse]) -> dict:
    return {r.question_id: (r.value or {}).get("value") for r in responses}


def _metric_state(cur: float, base: bl.Baseline | None) -> dict:
    if base is None:
        return {"z": None, "baseline": None, "spread": None, "trend_per_day": None, "status": "no_baseline"}
    z = base.z(cur)
    status = "notable" if abs(z) >= 3 else "watch" if abs(z) >= 2 else "normal"
    return {"z": round(z, 2), "baseline": round(base.median, 2), "spread": round(base.spread, 2),
            "trend_per_day": None if base.trend_per_day is None else round(base.trend_per_day, 3),
            "n": base.n, "status": status}


def _direction(z: float) -> str:
    return "higher" if z > 0 else "lower"


def analyze_checkin(db: Session, checkin: CheckIn, *, persist: bool = True, multivariate: bool = True) -> dict:
    astro = db.get(Astronaut, checkin.astronaut_id)
    at = checkin.started_at
    readings = list(db.scalars(select(SensorReading).where(SensorReading.checkin_id == checkin.id)))
    responses = list(db.scalars(select(QuestionnaireResponse).where(QuestionnaireResponse.checkin_id == checkin.id)))
    subj = _subjective(responses)
    facial = db.scalars(select(FacialObservation).where(FacialObservation.checkin_id == checkin.id)).first()
    voc = db.scalars(select(VocMeasurement).where(VocMeasurement.checkin_id == checkin.id)).first()
    env = {e.metric: e.value for e in db.scalars(select(EnvironmentReading).where(EnvironmentReading.checkin_id == checkin.id))}
    labs = list(db.scalars(select(BloodTestResult).where(
        BloodTestResult.astronaut_id == astro.id, BloodTestResult.timestamp >= at - timedelta(hours=2),
        BloodTestResult.timestamp <= at + timedelta(hours=3))))

    findings: list[Finding] = []
    metrics: dict[str, dict] = {}
    exercised = subj.get("recent_exercise") is True
    computed: list[bl.Baseline] = []

    for r in readings:
        spec = METRICS.get(r.metric)
        if spec is None:
            continue
        if not r.valid:
            findings.append(Finding("measurement", "info", "data_quality", f"{spec.label} reading rejected",
                                    f"The {spec.label.lower()} value looked implausible and was excluded.",
                                    [r.metric], guidance=["repeat_measurement"]))
            continue
        ctx = r.context
        if exercised and r.metric in {"heart_rate", "systolic_bp", "respiratory_rate"}:
            ctx = "post_exercise"
            r.context = ctx
        base = None if ctx == "post_exercise" else bl.compute(db, astro.id, r.metric, at)
        if base is not None:
            computed.append(base)
        state = _metric_state(r.value, base)
        out_of_range = (spec.ref_low is not None and r.value < spec.ref_low) or (
            spec.ref_high is not None and r.value > spec.ref_high)
        metrics[r.metric] = {"label": spec.label, "value": r.value, "unit": spec.unit, "region": spec.region,
                             "device": r.device, "simulated": r.simulated, "context": ctx,
                             "ref_low": spec.ref_low, "ref_high": spec.ref_high, "outside_reference": out_of_range,
                             **state}
        if ctx == "post_exercise":
            metrics[r.metric]["status"] = "context_excluded"
            continue
        z = state["z"] or 0.0
        side = ONE_SIDED.get(r.metric)
        favourable = (side == "low" and z > 0) or (side == "high" and z < 0)
        if favourable:
            metrics[r.metric]["status"] = "normal"
        if base is not None and abs(z) >= 3 and not favourable:
            findings.append(Finding(
                spec.region, "watch", "baseline_deviation",
                f"{spec.label} {_direction(state['z'])} than your usual range",
                f"{spec.label} is {r.value:g} {spec.unit}; your personal baseline is {base.median:.1f} ± {base.spread:.1f} "
                f"{spec.unit} over the last {bl.WINDOW_DAYS} days ({base.n} readings), a robust z-score of {state['z']:+.1f}.",
                [r.metric], {"current": r.value, "baseline": round(base.median, 2), "z": state["z"]},
                guidance=["repeat_measurement"],
            ))
        elif base is None:
            metrics[r.metric]["status"] = "no_baseline"

    _safety_rules(metrics, subj, findings)
    _pattern_rules(db, astro, at, metrics, subj, facial, voc, env, labs, findings)
    if checkin.faults:
        for fault in dict.fromkeys(checkin.faults):
            what = "Facial scan" if fault.lower().startswith("facial scan") else fault.split(" did not")[0]
            findings.append(Finding("measurement", "info", "data_quality", f"{what} unavailable",
                                    f"{fault}. Readings from this device are missing from today's assessment.",
                                    guidance=["repeat_measurement"]))
    mv = _multivariate(db, astro.id, at, metrics) if multivariate else None

    # Collapse duplicate single-metric findings into patterns where a pattern already covers them.
    pattern_metrics = {m for f in findings if f.method == "pattern" for m in f.metrics}
    findings = [f for f in findings if not (f.method == "baseline_deviation" and set(f.metrics) <= pattern_metrics)]
    findings.sort(key=lambda f: -SEVERITY_RANK[f.severity])

    worst = max([SEVERITY_RANK[f.severity] for f in findings if not f.experimental] + [0])
    if worst == 0 and any(f.experimental and f.severity != "info" for f in findings):
        worst = 1
    level, status_text = STATUS[worst]
    guidance_ids: list[str] = []
    for f in findings:
        for g in f.guidance:
            if g not in guidance_ids:
                guidance_ids.append(g)
    if worst >= 2 and "crew_medical_review" not in guidance_ids and worst < 3:
        guidance_ids.append("crew_medical_review")
    if worst == 3 and "urgent_medical" not in guidance_ids:
        guidance_ids.insert(0, "urgent_medical")
    if not guidance_ids:
        guidance_ids = ["routine_keep_going"]
    guidance_ids.sort(key=lambda g: -["routine", "confirm", "review", "urgent"].index(LIBRARY[g].tier))

    result = {
        "checkin_id": checkin.id,
        "astronaut_id": astro.id,
        "timestamp": at.isoformat() + "Z",
        "status_level": level,
        "status": status_text,
        "metrics": metrics,
        "observations": [_finding_dict(f) for f in findings],
        "guidance": [LIBRARY[g].to_dict() for g in guidance_ids],
        "facial": facial.comparison if facial else None,
        "voc": voc.analysis if voc else None,
        "multivariate": mv,
        "subjective": subj,
        "environment": env,
        "data_provenance": {
            "simulated_readings": sum(1 for r in readings if r.simulated),
            "real_readings": sum(1 for r in readings if not r.simulated) + (1 if facial else 0),
            "user_reported": len(responses),
            "note": "Vitals, VOC and lab values come from simulated adapters; facial geometry from the real webcam.",
        },
        "disclaimer": "Technology demonstrator. Not a medical device; observations are not diagnoses.",
    }
    result["summary_text"] = spoken_summary(astro, result)
    if persist:
        _persist(db, checkin, findings, guidance_ids, result)
        bl.store(db, astro.id, computed)
    return result


def _finding_dict(f: Finding) -> dict:
    return {"category": f.category, "severity": f.severity, "method": f.method, "title": f.title,
            "explanation": f.explanation, "metrics": f.metrics, "comparison": f.comparison,
            "guidance_ids": f.guidance, "uncertainty": f.uncertainty, "experimental": f.experimental}


def _safety_rules(metrics: dict, subj: dict, findings: list[Finding]) -> None:
    def v(k):
        m = metrics.get(k)
        return None if m is None or m.get("context") == "post_exercise" else m["value"]

    spo2, hr, sbp, dbp, temp, rr = (v(k) for k in ("spo2", "heart_rate", "systolic_bp", "diastolic_bp",
                                                     "body_temperature", "respiratory_rate"))
    rules: list[tuple[bool, str, str, list[str]]] = [
        (spo2 is not None and spo2 < 92, "urgent", f"Blood oxygen {spo2}% is below the general safety range", ["spo2"]),
        (hr is not None and hr > 120, "urgent", f"Resting heart rate {hr} bpm is very high", ["heart_rate"]),
        (hr is not None and hr < 40, "urgent", f"Resting heart rate {hr} bpm is very low", ["heart_rate"]),
        (sbp is not None and sbp < 90 and (hr or 0) > 100, "urgent",
         f"Low blood pressure ({sbp} mmHg) with a fast heart rate", ["systolic_bp", "heart_rate"]),
        (sbp is not None and (sbp >= 160 or (dbp or 0) >= 100), "review", f"Blood pressure {sbp}/{dbp} mmHg is high",
         ["systolic_bp", "diastolic_bp"]),
        (temp is not None and temp >= 39.0, "urgent", f"Body temperature {temp} °C is high", ["body_temperature"]),
        (temp is not None and 38.0 <= temp < 39.0, "review", f"Body temperature {temp} °C indicates fever",
         ["body_temperature"]),
        (rr is not None and rr > 24, "review", f"Breathing rate {rr}/min is elevated", ["respiratory_rate"]),
        (subj.get("chest_pain") is True, "urgent", "You reported chest pain", []),
    ]
    for hit, sev, title, mets in rules:
        if hit:
            findings.append(Finding(
                "safety", sev, "safety_rule", title,
                "This value is outside a general adult safety range (illustrative reference, not a NASA criterion). "
                "Human medical assessment is needed regardless of your personal baseline.",
                mets, guidance=["urgent_medical"] if sev == "urgent" else
                ["temperature_watch"] if "body_temperature" in mets else ["crew_medical_review"],
            ))


def _z(metrics: dict, key: str) -> float | None:
    m = metrics.get(key)
    return None if m is None else m.get("z")


def _pattern_rules(db, astro, at, metrics, subj, facial, voc, env, labs, findings) -> None:
    # Recovery / fatigue pattern: objective + subjective signals together.
    objective, subjective = [], []
    rhr_z, hrv_z, sleep_z = _z(metrics, "resting_heart_rate"), _z(metrics, "hrv_rmssd"), _z(metrics, "sleep_duration")
    trend = (metrics.get("resting_heart_rate") or {}).get("trend_per_day")
    if (rhr_z is not None and rhr_z >= 2) or (trend is not None and trend > 0.8):
        objective.append("resting_heart_rate")
    if hrv_z is not None and hrv_z <= -2:
        objective.append("hrv_rmssd")
    sleep_v = (metrics.get("sleep_duration") or {}).get("value")
    if (sleep_z is not None and sleep_z <= -2) or (sleep_v is not None and sleep_v < 6):
        objective.append("sleep_duration")
    if subj.get("fatigue") is True:
        subjective.append("reported fatigue")
    rating = subj.get("health_rating")
    if isinstance(rating, (int, float)) and rating <= 5:
        subjective.append(f"self-rated health {rating}/10")
    if subj.get("sleep_quality") is not None and subj.get("sleep_quality") <= 4:
        subjective.append("poor sleep quality reported")
    if len(objective) >= 2 or (objective and subjective):
        sev = "review" if len(objective) + len(subjective) >= 4 else "watch"
        parts = [f"{metrics[m]['label'].lower()} {_direction(metrics[m]['z'] or -1)} than baseline"
                 for m in objective if metrics[m].get("z") is not None]
        findings.append(Finding(
            "wellbeing", sev, "pattern", "Combined change in recovery indicators",
            "Several indicators moved away from your personal baseline together: "
            + ", ".join(parts + subjective) + ". Together these are more meaningful than any single value; "
            "they can reflect sleep disruption, workload, stress or early illness and need follow-up rather than a "
            "conclusion.",
            objective, {m: metrics[m].get("z") for m in objective},
            guidance=["sleep_hygiene", "recovery_followup"] if "sleep_duration" in objective else ["recovery_followup"],
            uncertainty="Based on simulated wearable data and self-report.",
        ))

    # Temperature with symptoms.
    t = metrics.get("body_temperature")
    if t and t.get("z") is not None and t["z"] >= 3 and t["value"] < 38.0 and (
            subj.get("fatigue") or subj.get("new_symptoms")):
        findings.append(Finding("general", "watch", "pattern", "Raised temperature with reported symptoms",
                                f"Temperature {t['value']} °C is above your usual {t['baseline']} °C and you reported "
                                "symptoms.", ["body_temperature"], guidance=["temperature_watch"]))

    # Behavioral health: low mood today and on recent check-ins.
    mood = subj.get("mood")
    if isinstance(mood, dict) and mood.get("valence", 0) < 0:
        recent = db.scalars(select(QuestionnaireResponse).where(
            QuestionnaireResponse.astronaut_id == astro.id, QuestionnaireResponse.question_id == "mood",
            QuestionnaireResponse.timestamp < at, QuestionnaireResponse.timestamp > at - timedelta(days=3))).all()
        low_days = sum(1 for r in recent if (r.value.get("value") or {}).get("valence", 0) < 0)
        if low_days >= 2:
            findings.append(Finding("behavioral", "watch", "pattern", "Mood lower than usual for several days",
                                    f"You described your mood as {mood.get('label', 'low')} today and on {low_days} "
                                    "recent check-ins.", [], guidance=["mood_support"]))
        else:
            findings.append(Finding("behavioral", "info", "self_report", "Lower mood today",
                                    f"You described your mood as {mood.get('label', 'low')}.", [],
                                    guidance=["mood_support"]))

    # Body-mass decline relative to two weeks earlier.
    mass = metrics.get("body_mass")
    if mass:
        old = bl.compute(db, astro.id, "body_mass", at - timedelta(days=10))
        if old and (mass["value"] - old.median) / old.median <= -0.02:
            pct = (mass["value"] - old.median) / old.median * 100
            findings.append(Finding("nutrition", "watch", "trend", "Body mass trending down",
                                    f"Body mass is {mass['value']} kg, {pct:.1f}% below your level from two weeks ago "
                                    f"({old.median:.1f} kg).", ["body_mass"], guidance=["hydration_nutrition"]))

    ex = metrics.get("exercise_minutes")
    if ex and ex["value"] < 90:
        findings.append(Finding("musculoskeletal", "info", "self_care", "Exercise below plan",
                                f"Yesterday's exercise was {ex['value']:.0f} minutes.", ["exercise_minutes"],
                                guidance=["exercise_adherence"]))

    # Facial geometry change (real webcam).
    if facial and facial.comparison and facial.comparison.get("flagged"):
        symptoms = subj.get("vision_headache") is True
        findings.append(Finding(
            "head_eyes", "review" if symptoms else "watch", "baseline_deviation",
            "Facial geometry differs from your reference",
            facial.comparison.get("explanation", ""),
            ["facial_geometry"],
            {k: facial.comparison["features"][k] for k in facial.comparison["flagged"]},
            guidance=["vision_check"] if symptoms else ["repeat_measurement", "vision_check"],
            uncertainty="Webcam geometry is sensitive to lighting, angle and expression. Not a medical measurement.",
        ))

    # Experimental VOC fingerprint.
    if voc and voc.analysis and voc.analysis.get("flagged"):
        findings.append(Finding("experimental", "watch", "experimental", "VOC fingerprint deviation (experimental)",
                                "Your skin VOC fingerprint differs from your baseline "
                                f"(similarity {voc.analysis.get('similarity')}%). Experimental research measurement: "
                                "it cannot identify a cause or measure hormones.",
                                ["voc_fingerprint"], {"deviating_channels": voc.analysis.get("deviating_channels")},
                                guidance=["voc_repeat"], experimental=True,
                                uncertainty="Simulated e-nose; susceptible to environmental interference."))

    # Labs drawn during this session.
    for res in labs:
        name, unit, lo, hi, _ = LAB_MARKERS[res.marker]
        if (lo is not None and res.value < lo) or (hi is not None and res.value > hi):
            findings.append(Finding("labs", "watch", "reference_range", f"{name} outside expected range",
                                    f"{name} is {res.value} {unit} (expected {lo}–{hi} {unit}, illustrative range).",
                                    [res.marker], guidance=["lab_review"]))

    co2 = env.get("cabin_co2")
    if co2 and co2 > 4000:
        findings.append(Finding("environment", "info", "environment", "Cabin CO₂ elevated",
                                f"Cabin CO₂ is {co2:.0f} ppm. Elevated CO₂ can cause headaches and affect breathing "
                                "rate; consider it when interpreting today's readings.", [],
                                guidance=["co2_environment"]))


def _multivariate(db: Session, astronaut_id: str, at: datetime, metrics: dict) -> dict | None:
    if not all(k in metrics and metrics[k].get("z") is not None for k in MULTIVARIATE_METRICS):
        return None
    rows = db.execute(select(SensorReading.checkin_id, SensorReading.metric, SensorReading.value).where(
        SensorReading.astronaut_id == astronaut_id, SensorReading.metric.in_(MULTIVARIATE_METRICS),
        SensorReading.valid.is_(True), SensorReading.timestamp < at,
        SensorReading.timestamp >= at - timedelta(days=bl.WINDOW_DAYS))).all()
    by_ci: dict[str, dict[str, float]] = {}
    for cid, m, val in rows:
        by_ci.setdefault(cid, {})[m] = val
    X = np.array([[d[m] for m in MULTIVARIATE_METRICS] for d in by_ci.values() if len(d) == len(MULTIVARIATE_METRICS)])
    if len(X) < 14:
        return None
    mu, sd = X.mean(axis=0), X.std(axis=0) + 1e-6
    iso = IsolationForest(n_estimators=120, random_state=11).fit((X - mu) / sd)
    cur = (np.array([metrics[m]["value"] for m in MULTIVARIATE_METRICS]) - mu) / sd
    hist_scores = -iso.score_samples((X - mu) / sd)
    score = float(-iso.score_samples(cur.reshape(1, -1))[0])
    pct = float((hist_scores < score).mean() * 100)
    contrib = sorted(((m, abs(metrics[m]["z"])) for m in MULTIVARIATE_METRICS), key=lambda t: -t[1])[:3]
    return {"score": round(score, 3), "percentile_vs_history": round(pct, 1), "n_history": int(len(X)),
            "top_contributors": [{"metric": m, "abs_z": round(z, 2)} for m, z in contrib],
            "note": "Isolation Forest on this astronaut's own history; supporting evidence only."}


def spoken_summary(astro: Astronaut, result: dict) -> str:
    name = astro.preferred_name
    obs = [o for o in result["observations"] if o["severity"] != "info"]
    if result["status_level"] == "clear":
        return f"{name}, your assessment is complete. No significant changes detected. " + result["guidance"][0]["spoken"]
    lead = f"{name}, your assessment is complete. {result['status']}. "
    if obs:
        lead += "I noticed: " + "; ".join(o["title"].lower() for o in obs[:3]) + ". "
    g = result["guidance"][0]
    lead += g["spoken"] + " Say 'explain' for details, or 'show details' to see your history."
    return lead


def _persist(db: Session, checkin: CheckIn, findings: list[Finding], guidance_ids: list[str], result: dict) -> None:
    for f in findings:
        db.add(HealthObservation(
            astronaut_id=checkin.astronaut_id, checkin_id=checkin.id, timestamp=checkin.started_at,
            category=f.category, severity=f.severity, method=f.method, title=f.title, explanation=f.explanation,
            metrics=f.metrics, comparison=f.comparison, uncertainty=f.uncertainty, guidance_ids=f.guidance,
            experimental=f.experimental,
            provenance={"checkin_id": checkin.id, "simulated_inputs": result["data_provenance"]["simulated_readings"] > 0},
        ))
    for gid in guidance_ids:
        db.add(GuidanceRecord(astronaut_id=checkin.astronaut_id, checkin_id=checkin.id, guidance_id=gid,
                              tier=LIBRARY[gid].tier, reason=result["status"], timestamp=checkin.started_at))
    checkin.overall_status = result["status_level"]
    checkin.summary_text = result["summary_text"]
    checkin.analysis = {k: result[k] for k in ("status_level", "status", "metrics", "observations", "facial", "voc",
                                               "multivariate", "subjective", "environment", "data_provenance")} | {
        "guidance_ids": guidance_ids}
