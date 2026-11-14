"""Read models for the astronaut's detailed health insights and Mission Control."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Astronaut,
    CheckIn,
    EnvironmentReading,
    FacialObservation,
    HealthObservation,
    PersonalBaseline,
    QuestionnaireResponse,
    SensorReading,
    VocMeasurement,
)
from app.models.base import utcnow
from app.services.facial.features import FEATURES
from app.services.guidance.library import LIBRARY
from app.services.scheduling import blood_tests
from app.services.sensors.catalog import METRICS


def iso(dt) -> str | None:
    return dt.isoformat() + "Z" if dt else None


def astronaut_dict(a: Astronaut) -> dict:
    return {"id": a.id, "full_name": a.full_name, "preferred_name": a.preferred_name, "title": a.title,
            "display_name": a.display_name, "role": a.role, "mission": a.mission, "face_enrolled": a.face_enrolled,
            "scenario": a.scenario, "synthetic_profile": a.synthetic_profile, "date_of_birth": a.date_of_birth}


def latest_checkin(db: Session, astronaut_id: str, completed_only: bool = True) -> CheckIn | None:
    stmt = select(CheckIn).where(CheckIn.astronaut_id == astronaut_id)
    if completed_only:
        stmt = stmt.where(CheckIn.status == "completed")
    return db.scalars(stmt.order_by(CheckIn.started_at.desc())).first()


def metric_series(db: Session, astronaut_id: str, days: int = 28) -> dict[str, list[dict]]:
    since = utcnow() - timedelta(days=days)
    rows = db.scalars(select(SensorReading).where(SensorReading.astronaut_id == astronaut_id,
                                                  SensorReading.timestamp >= since)
                      .order_by(SensorReading.timestamp)).all()
    out: dict[str, list[dict]] = {k: [] for k in METRICS}
    for r in rows:
        out.setdefault(r.metric, []).append({"t": iso(r.timestamp), "v": r.value, "valid": r.valid,
                                              "simulated": r.simulated, "context": r.context})
    return out


def baselines(db: Session, astronaut_id: str) -> dict[str, dict]:
    rows = db.scalars(select(PersonalBaseline).where(PersonalBaseline.astronaut_id == astronaut_id)).all()
    return {r.metric: {"median": r.median, "spread": r.mad, "n": r.n, "trend_per_day": r.trend_per_day,
                       "computed_at": iso(r.computed_at)} for r in rows}


def facial_history(db: Session, astronaut_id: str) -> list[dict]:
    rows = db.scalars(select(FacialObservation).where(FacialObservation.astronaut_id == astronaut_id)
                      .order_by(FacialObservation.timestamp)).all()
    return [{"id": r.id, "t": iso(r.timestamp), "features": r.features, "is_reference": r.is_reference,
             "valid": r.valid, "comparison": r.comparison, "frames": r.frames_used} for r in rows]


def voc_history(db: Session, astronaut_id: str, limit: int = 30) -> list[dict]:
    rows = db.scalars(select(VocMeasurement).where(VocMeasurement.astronaut_id == astronaut_id)
                      .order_by(VocMeasurement.timestamp.desc()).limit(limit)).all()
    return [{"id": r.id, "t": iso(r.timestamp), "channels": r.channels, "simulated": r.simulated,
             "status": (r.analysis or {}).get("status"), "similarity": (r.analysis or {}).get("similarity"),
             "analysis": r.analysis if i == 0 else None, "conditions": r.conditions}
            for i, r in enumerate(rows)][::-1]


def observations(db: Session, astronaut_id: str, days: int = 14) -> list[dict]:
    since = utcnow() - timedelta(days=days)
    rows = db.scalars(select(HealthObservation).where(HealthObservation.astronaut_id == astronaut_id,
                                                      HealthObservation.timestamp >= since,
                                                      HealthObservation.severity != "info")
                      .order_by(HealthObservation.timestamp.desc()).limit(40)).all()
    return [{"id": r.id, "t": iso(r.timestamp), "checkin_id": r.checkin_id, "severity": r.severity,
             "category": r.category, "method": r.method, "title": r.title, "explanation": r.explanation,
             "metrics": r.metrics, "experimental": r.experimental, "uncertainty": r.uncertainty} for r in rows]


def checkin_history(db: Session, astronaut_id: str, limit: int = 30) -> list[dict]:
    rows = db.scalars(select(CheckIn).where(CheckIn.astronaut_id == astronaut_id, CheckIn.status == "completed")
                      .order_by(CheckIn.started_at.desc()).limit(limit)).all()
    return [{"id": c.id, "t": iso(c.started_at), "period": c.period, "status_level": c.overall_status,
             "status": (c.analysis or {}).get("status"), "seeded": c.seeded} for c in rows]


def mood_series(db: Session, astronaut_id: str, days: int = 28) -> list[dict]:
    since = utcnow() - timedelta(days=days)
    rows = db.scalars(select(QuestionnaireResponse).where(
        QuestionnaireResponse.astronaut_id == astronaut_id, QuestionnaireResponse.timestamp >= since,
        QuestionnaireResponse.question_id.in_(["health_rating", "mood", "feeling", "sleep_quality", "fatigue"]))
        .order_by(QuestionnaireResponse.timestamp)).all()
    out = []
    for r in rows:
        v = r.value.get("value")
        out.append({"t": iso(r.timestamp), "q": r.question_id,
                    "v": v.get("valence") if isinstance(v, dict) else v})
    return out


def environment_latest(db: Session) -> dict:
    rows = db.scalars(select(EnvironmentReading).order_by(EnvironmentReading.timestamp.desc()).limit(10)).all()
    seen: dict[str, dict] = {}
    for r in rows:
        seen.setdefault(r.metric, {"value": r.value, "unit": r.unit, "t": iso(r.timestamp), "simulated": r.simulated})
    return seen


def insights(db: Session, astro: Astronaut) -> dict:
    last = latest_checkin(db, astro.id)
    return {
        "astronaut": astronaut_dict(astro),
        "latest": ({"id": last.id, "t": iso(last.started_at), "period": last.period, **(last.analysis or {}),
                    "guidance": [LIBRARY[g].to_dict() for g in (last.analysis or {}).get("guidance_ids", []) if g in LIBRARY]}
                   if last else None),
        "series": metric_series(db, astro.id),
        "baselines": baselines(db, astro.id),
        "facial": facial_history(db, astro.id),
        "facial_features": {k: {"label": v.label, "unit": v.unit, "description": v.description}
                            for k, v in FEATURES.items()},
        "voc": voc_history(db, astro.id),
        "labs": blood_tests.history(db, astro.id),
        "blood_schedule": blood_tests.schedule_info(db, astro.id),
        "observations": observations(db, astro.id),
        "checkins": checkin_history(db, astro.id),
        "subjective": mood_series(db, astro.id),
        "metrics_catalog": {k: m.to_dict() for k, m in METRICS.items()},
    }
