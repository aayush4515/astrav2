"""Deterministic synthetic crew and multi-week health history.

All seeded data is marked simulated/seeded. Seeded profiles start WITHOUT facial enrollment: a real
person must enroll through the webcam before any profile can be recognized.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import Base
from app.database import session as dbs
from app.models import Astronaut, CheckIn, QuestionnaireResponse, SystemSetting, VocMeasurement
from app.models.base import utcnow
from app.services.communications import queue as comms
from app.services.checkin.orchestrator import report_payload
from app.services.health.analysis import analyze_checkin
from app.services.scheduling import blood_tests
from app.services.sensors import voc as voc_service
from app.services.sensors.base import CollectionContext
from app.services.sensors.profiles import SCENARIO_SUBJECTIVE, SCENARIOS, voc_vector
from app.services.sensors.registry import persist_readings, record_environment, registry
from app.services.sensors.catalog import CHECKIN_SENSOR_SEQUENCE

log = logging.getLogger("astra.seed")

CREW = [
    dict(id="AST-001", full_name="Alex Moreno", preferred_name="Alex", title="Commander", role="Mission Commander",
         date_of_birth="1984-03-12", height_cm=180, scenario="normal", blood_offsets=[27, 20, 13, 6]),
    dict(id="AST-002", full_name="Priya Nair", preferred_name="Priya", title="Dr.", role="Flight Engineer / Crew Medical Officer",
         date_of_birth="1988-09-02", height_cm=165, scenario="gradual_change", blood_offsets=[25, 18, 11, 4]),
    dict(id="AST-003", full_name="Kenji Watanabe", preferred_name="Kenji", title="Specialist", role="Mission Specialist",
         date_of_birth="1986-12-21", height_cm=176, scenario="voc_anomaly", blood_offsets=[29, 22, 15, 8]),
    dict(id="AST-004", full_name="Lucas Oliveira", preferred_name="Lucas", title="Pilot", role="Pilot",
         date_of_birth="1990-05-30", height_cm=183, scenario="mass_loss", blood_offsets=[26, 19, 12, 5]),
]
HISTORY_DAYS = 28
SESSIONS = (("morning", 7, 30), ("evening", 20, 45))


def reset_database() -> None:
    from app import models  # noqa: F401  (register tables)

    Base.metadata.drop_all(bind=dbs.engine)
    Base.metadata.create_all(bind=dbs.engine)


def _subjective_for(scenario: str, strength: float, day_index: int) -> dict:
    normal = SCENARIO_SUBJECTIVE["normal"]
    target = SCENARIO_SUBJECTIVE.get(scenario, normal)
    rating = round(normal["health_rating"] + (target["health_rating"] - normal["health_rating"]) * strength
                   - (1 if day_index % 5 == 0 else 0))
    fatigue = target["fatigue"] and strength > 0.45
    if strength > 0.5 and target["mood"] == "low":
        mood = {"valence": -1, "label": "tired"}
    elif day_index % 7 == 3:
        mood = {"valence": 0, "label": "okay"}
    else:
        mood = {"valence": 1, "label": "good"}
    sleep_q = max(2, min(10, round(8 - 4 * strength * (1 if scenario == "gradual_change" else 0)) - (day_index % 3 == 0)))
    return {"health_rating": rating, "fatigue": fatigue, "mood": mood, "sleep_quality": sleep_q}


def seed_history(db: Session, astro: Astronaut, now: datetime, days: int = HISTORY_DAYS, analyze_from_day: int = 10) -> None:
    start_day = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    blood_days = {(now - timedelta(days=o)).date() for o in CREW_BY_ID.get(astro.id, {}).get("blood_offsets", [])}
    if not blood_days:
        blood_days = {(now - timedelta(days=o)).date() for o in (20, 13, 6)}
    for d in range(days):
        day = start_day + timedelta(days=d)
        days_before_today = days - 1 - d
        for period, hh, mm in SESSIONS:
            ts = day.replace(hour=hh, minute=mm)
            if ts >= now - timedelta(hours=1):
                continue
            # Gradual scenarios ramp up over the final days of history; others (VOC anomaly, fever, ...)
            # only affect the live check-in.
            ramp = SCENARIOS.get(astro.scenario, {}).get("ramp_days")
            strength = max(0.0, min(1.0, (ramp - days_before_today) / ramp)) if ramp else 0.0
            ci = CheckIn(astronaut_id=astro.id, period=period, status="completed", stage="COMPLETED",
                         started_at=ts, completed_at=ts + timedelta(minutes=6), seeded=True, faults=[])
            db.add(ci)
            db.flush()
            ctx = CollectionContext(astro.id, ts, period, astro.scenario if ramp else "normal", strength)
            for dev in CHECKIN_SENSOR_SEQUENCE:
                adapter = registry.get(dev)
                readings = [adapter.validate(r) for r in adapter.collect(ctx)]
                persist_readings(db, readings, ci.id)
            record_environment(db, ci.id, astro.id, ts, period, "normal")
            if period == "evening" or d % 2 == 0:
                channels = voc_vector(astro.id, ts, period, "normal", 0.0)
                hist = voc_service.history(db, astro.id, before=ts)
                analysis = voc_service.analyze(channels, hist)
                analysis["explanation"] = voc_service.explain(analysis)
                db.add(VocMeasurement(astronaut_id=astro.id, checkin_id=ci.id, timestamp=ts, channels=channels,
                                      conditions={"sample_site": "forearm skin"}, source="simulated_e_nose",
                                      analysis=analysis))
            subj = _subjective_for(astro.scenario if ramp else "normal", strength, d)
            for qid, val, kind in (("health_rating", subj["health_rating"], "rating"),
                                   ("fatigue", subj["fatigue"], "yes_no"),
                                   ("mood", subj["mood"], "free_mood"),
                                   ("sleep_quality", subj["sleep_quality"], "rating")):
                db.add(QuestionnaireResponse(checkin_id=ci.id, astronaut_id=astro.id, question_id=qid,
                                             question_text="(seeded synthetic response)", transcript="",
                                             value={"type": kind, "value": val}, input_mode="seeded", timestamp=ts))
            db.flush()
            if period == "morning" and ts.date() in blood_days:
                test = blood_tests.start(db, astro.id, ci.id)
                test.started_at = ts
                blood_tests.complete(db, test, "normal", ts + timedelta(minutes=10))
            if d >= analyze_from_day:
                result = analyze_checkin(db, ci, multivariate=d >= days - 3)
                if d >= days - 2:
                    msg = comms.enqueue(db, kind="checkin_report",
                                        priority={"urgent": "critical", "review": "high"}.get(result["status_level"], "routine"),
                                        astronaut_id=astro.id,
                                        subject=f"{astro.display_name} · {period} check-in · {result['status']}",
                                        payload=report_payload(astro, ci, result), related_id=ci.id)
                    msg.created_at = msg.queued_at = ts + timedelta(minutes=6)
                    msg.sent_at = ts + timedelta(minutes=7)
                    msg.delivered_at = ts + timedelta(minutes=19)
                    msg.status = "acknowledged" if d < days - 1 else "delivered"
                    if msg.status == "acknowledged":
                        msg.acknowledged_at = ts + timedelta(minutes=45)
                        msg.acknowledged_by = "Flight Surgeon (seed)"
                    msg.attempts = 1
        db.commit()


CREW_BY_ID = {c["id"]: c for c in CREW}


def seed(db: Session, now: datetime | None = None, days: int = HISTORY_DAYS) -> None:
    now = now or utcnow()
    for c in CREW:
        astro = Astronaut(id=c["id"], full_name=c["full_name"], preferred_name=c["preferred_name"], title=c["title"],
                          role=c["role"], mission=settings.mission_name, date_of_birth=c["date_of_birth"],
                          height_cm=c["height_cm"], scenario=c["scenario"], synthetic_profile=True,
                          face_enrolled=False)
        db.add(astro)
        db.commit()
        log.info("seeding %s", astro.id)
        seed_history(db, astro, now, days)
        blood_tests.ensure_schedule(db, astro.id)
        db.commit()
    comms.set_link(db, link_up=True, delay_s=settings.default_comm_delay_s)
    db.merge(SystemSetting(key="seed_complete", value=utcnow().isoformat()))
    db.commit()


def init_db(seed_if_empty: bool = True) -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=dbs.engine)
    if not seed_if_empty:
        return
    db = dbs.SessionLocal()
    try:
        if db.get(SystemSetting, "seed_complete") is None:
            # Empty, or a previous seed was interrupted: start from a clean, complete demo dataset.
            if db.query(Astronaut).count():
                log.warning("Incomplete demo seed detected; reseeding")
                db.close()
                reset_database()
                db = dbs.SessionLocal()
            seed(db)
    finally:
        db.close()


if __name__ == "__main__":  # python -m app.seed.seed  → reset and reseed
    logging.basicConfig(level=logging.INFO)
    reset_database()
    s = dbs.SessionLocal()
    seed(s)
    s.close()
    print("Database reset and seeded.")
