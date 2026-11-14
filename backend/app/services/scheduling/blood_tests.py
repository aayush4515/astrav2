"""Weekly blood-sampling schedule, persistent reminders and the simulated onboard analyzer.

The 7-day interval is a configurable demonstration default, not an official NASA protocol.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Astronaut, BloodTest, BloodTestResult, Reminder
from app.models.base import utcnow
from app.services.sensors import registry as sensor_registry
from app.services.sensors.catalog import LAB_MARKERS
from app.services.sensors.profiles import lab_values

COLLECTION_STEPS = [
    "Wash your hands and clean your fingertip with an alcohol wipe.",
    "Press the single-use lancet firmly against the side of your fingertip.",
    "Collect a drop of blood into the analyzer cartridge until the fill line is reached.",
    "Cover your finger with a gauze pad, and insert the cartridge into the analyzer.",
]


def last_completed(db: Session, astronaut_id: str) -> BloodTest | None:
    return db.scalars(select(BloodTest).where(BloodTest.astronaut_id == astronaut_id, BloodTest.status == "completed")
                      .order_by(BloodTest.completed_at.desc())).first()


def blood_reminder(db: Session, astronaut_id: str) -> Reminder | None:
    return db.scalars(select(Reminder).where(Reminder.astronaut_id == astronaut_id, Reminder.kind == "blood_test",
                                             Reminder.status.in_(["pending", "snoozed"]))
                      .order_by(Reminder.due_at)).first()


def ensure_schedule(db: Session, astronaut_id: str) -> Reminder:
    rem = blood_reminder(db, astronaut_id)
    if rem:
        return rem
    last = last_completed(db, astronaut_id)
    due = (last.completed_at + timedelta(days=settings.blood_test_interval_days)) if last else utcnow()
    rem = Reminder(astronaut_id=astronaut_id, kind="blood_test", title="Weekly blood assessment", due_at=due)
    db.add(rem)
    db.flush()
    return rem


def schedule_info(db: Session, astronaut_id: str, now: datetime | None = None) -> dict:
    now = now or utcnow()
    rem = ensure_schedule(db, astronaut_id)
    last = last_completed(db, astronaut_id)
    due_now = rem.due_at <= now and (rem.snoozed_until is None or rem.snoozed_until <= now)
    overdue_days = (now - rem.due_at).days if rem.due_at < now else 0
    return {
        "reminder_id": rem.id,
        "next_due": rem.due_at.isoformat() + "Z",
        "status": "overdue" if overdue_days >= 1 else "due" if due_now else "snoozed" if rem.snoozed_until and rem.snoozed_until > now else "scheduled",
        "due_now": due_now,
        "snoozed_until": rem.snoozed_until.isoformat() + "Z" if rem.snoozed_until else None,
        "last_completed": last.completed_at.isoformat() + "Z" if last else None,
        "interval_days": settings.blood_test_interval_days,
    }


def defer(db: Session, astronaut_id: str, mode: str) -> dict:
    """mode 'not_now' → ask again at the next check-in (12 h); 'later' → remind in 2 h."""
    rem = ensure_schedule(db, astronaut_id)
    rem.status = "snoozed"
    rem.snooze_count += 1
    rem.snoozed_until = utcnow() + (timedelta(hours=2) if mode == "later" else timedelta(hours=12))
    db.flush()
    return schedule_info(db, astronaut_id)


def start(db: Session, astronaut_id: str, checkin_id: str | None) -> BloodTest:
    test = BloodTest(astronaut_id=astronaut_id, checkin_id=checkin_id)
    db.add(test)
    db.flush()
    return test


async def analyze(db: Session, test: BloodTest, scenario: str, ts: datetime | None = None) -> list[BloodTestResult]:
    if sensor_registry.SPEED > 0:
        await asyncio.sleep(4.0 * sensor_registry.SPEED)
    return complete(db, test, scenario, ts)


def complete(db: Session, test: BloodTest, scenario: str, ts: datetime | None = None) -> list[BloodTestResult]:
    ts = ts or utcnow()
    results = []
    for marker, val in lab_values(test.astronaut_id, ts, scenario).items():
        _label, unit, lo, hi, dec = LAB_MARKERS[marker]
        r = BloodTestResult(blood_test_id=test.id, astronaut_id=test.astronaut_id, marker=marker,
                            value=round(val, dec), unit=unit, ref_low=lo, ref_high=hi, timestamp=ts)
        db.add(r)
        results.append(r)
    test.status = "completed"
    test.completed_at = ts
    rem = blood_reminder(db, test.astronaut_id)
    if rem:
        rem.status = "done"
    db.add(Reminder(astronaut_id=test.astronaut_id, kind="blood_test", title="Weekly blood assessment",
                    due_at=ts + timedelta(days=settings.blood_test_interval_days)))
    db.flush()
    return results


def history(db: Session, astronaut_id: str) -> list[dict]:
    tests = db.scalars(select(BloodTest).where(BloodTest.astronaut_id == astronaut_id, BloodTest.status == "completed")
                       .order_by(BloodTest.completed_at)).all()
    out = []
    for t in tests:
        rows = db.scalars(select(BloodTestResult).where(BloodTestResult.blood_test_id == t.id)).all()
        out.append({"id": t.id, "completed_at": t.completed_at.isoformat() + "Z", "simulated": t.simulated,
                    "analyzer": t.analyzer,
                    "results": {r.marker: {"value": r.value, "unit": r.unit, "ref_low": r.ref_low,
                                           "ref_high": r.ref_high, "label": LAB_MARKERS[r.marker][0]} for r in rows}})
    return out


def reminders_for(db: Session, astro: Astronaut) -> list[dict]:
    info = schedule_info(db, astro.id)
    out = []
    if info["due_now"]:
        out.append({"kind": "blood_test", "title": "Weekly blood assessment is due", "due": info["next_due"],
                    "status": info["status"]})
    return out
