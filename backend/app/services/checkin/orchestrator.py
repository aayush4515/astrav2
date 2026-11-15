"""Server side of the hands-free check-in. The browser drives timing (camera, voice, animation);
every stage below validates the session, does the real work and persists the result."""

from __future__ import annotations

from datetime import timedelta

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Astronaut, CheckIn, QuestionnaireResponse, SensorReading, VocMeasurement
from app.models.base import KIND_USER_REPORTED, utcnow
from app.services.communications import queue as comms
from app.services.facial import scan as facial_scan
from app.services.health import analysis
from app.services.health import baselines as bl
from app.services.identity.face_engine import engine as face_engine
from app.services.identity.matcher import match_embedding
from app.services.scheduling import blood_tests
from app.services.sensors import registry as sensors
from app.services.sensors import voc as voc_service
from app.services.sensors.base import CollectionContext, SensorFault
from app.services.sensors.catalog import CHECKIN_SENSOR_SEQUENCE, DEVICES
from app.services.voice import questionnaire as qn
from app.services.identity.sessions import audit

STAGES = ["STANDBY", "FACE_DETECTED", "IDENTIFYING", "IDENTITY_CONFIRMED", "VOICE_GREETING", "CHECKIN_STARTED",
          "FACIAL_SCAN", "SENSOR_COLLECTION", "VOC_SCAN", "VOICE_QUESTIONNAIRE", "BLOOD_TEST", "PROCESSING",
          "RESULTS_READY", "VOICE_SUMMARY", "COMPLETED", "CANCELLED", "FAILED"]


class CheckinError(ValueError):
    pass


def period_for(hour: int) -> str:
    return "morning" if 4 <= hour < 14 else "evening"


def start(db: Session, astro: Astronaut, session_id: str) -> tuple[CheckIn, bool]:
    """Returns (checkin, resumed). Re-detection of the same face within 20 minutes resumes, never duplicates."""
    existing = db.scalars(select(CheckIn).where(
        CheckIn.astronaut_id == astro.id, CheckIn.status == "in_progress",
        CheckIn.started_at > utcnow() - timedelta(minutes=20))).first()
    if existing:
        existing.session_id = session_id
        db.commit()
        return existing, True
    now = utcnow()
    ci = CheckIn(astronaut_id=astro.id, session_id=session_id, period=period_for(now.hour), started_at=now,
                 stage="CHECKIN_STARTED", faults=[])
    db.add(ci)
    db.flush()
    sensors.record_environment(db, ci.id, astro.id, now, ci.period, astro.scenario)
    blood_tests.ensure_schedule(db, astro.id)
    audit(db, astro.id, "checkin_started", astro.id, checkin=ci.id)
    db.commit()
    facial_scan.reset(ci.id)
    return ci, False


def get_owned(db: Session, astro: Astronaut, checkin_id: str) -> CheckIn:
    ci = db.get(CheckIn, checkin_id)
    if ci is None or ci.astronaut_id != astro.id:
        raise CheckinError("Check-in not found for this astronaut")
    return ci


def _require_active(ci: CheckIn) -> None:
    if ci.status != "in_progress":
        raise CheckinError(f"Check-in is {ci.status}")


def _add_fault(ci: CheckIn, text: str) -> None:
    if text not in (ci.faults or []):  # a resumed check-in must not repeat the same fault
        ci.faults = [*(ci.faults or []), text]


def _ctx(ci: CheckIn, astro: Astronaut) -> CollectionContext:
    return CollectionContext(astronaut_id=astro.id, timestamp=ci.started_at, period=ci.period, scenario=astro.scenario)


def facial_frame(db: Session, astro: Astronaut, ci: CheckIn, img) -> dict:
    _require_active(ci)
    ci.stage = "FACIAL_SCAN"
    # Identity continuity: a different person stepping in must not contaminate this astronaut's record.
    faces = face_engine.detect(img)
    if len(faces) > 1:
        return {"accepted": False, "issues": ["multiple_faces"], "guidance": "Only the astronaut being assessed "
                "should be in view.", "landmarks": []}
    if faces and faces[0].quality.get("ok"):
        match = match_embedding(db, face_engine.embed(img, faces[0]))
        if match.status == "match" and match.astronaut_id != astro.id:
            return {"accepted": False, "issues": ["identity_mismatch"], "landmarks": [],
                    "guidance": "The person in view does not match the active astronaut."}
    result = facial_scan.process_frame(img, ci.id)
    if result.get("complete"):
        obs = facial_scan.finalize(db, ci.id, astro.id, ci.id, is_reference=False)
        db.commit()
        result["observation"] = {"id": obs.id, "features": obs.features, "comparison": obs.comparison} if obs else None
    return result


def skip_facial(db: Session, ci: CheckIn, reason: str) -> None:
    facial_scan.reset(ci.id)
    _add_fault(ci, f"Facial scan skipped: {reason}")
    db.commit()


async def collect_device(db: Session, astro: Astronaut, ci: CheckIn, device_id: str) -> dict:
    _require_active(ci)
    if device_id not in DEVICES:
        raise CheckinError("Unknown device")
    ci.stage = "SENSOR_COLLECTION"
    try:
        readings = await sensors.acquire(device_id, _ctx(ci, astro))
    except SensorFault as exc:
        _add_fault(ci, str(exc))
        db.commit()
        return {"device": device_id, "status": "fault", "message": str(exc), "readings": []}
    # Re-collection (e.g. a resumed check-in) replaces this device's earlier readings instead of duplicating them.
    db.execute(delete(SensorReading).where(SensorReading.checkin_id == ci.id, SensorReading.device == device_id))
    sensors.persist_readings(db, readings, ci.id)
    db.commit()
    return {"device": device_id, "status": "ok", "readings": [r.to_dict() for r in readings]}


async def collect_voc(db: Session, astro: Astronaut, ci: CheckIn) -> dict:
    _require_active(ci)
    ci.stage = "VOC_SCAN"
    data = await voc_service.acquire(_ctx(ci, astro))
    hist = voc_service.history(db, astro.id, before=ci.started_at)
    result = voc_service.analyze(data["channels"], hist)
    result["explanation"] = voc_service.explain(result)
    db.execute(delete(VocMeasurement).where(VocMeasurement.checkin_id == ci.id))
    db.add(VocMeasurement(astronaut_id=astro.id, checkin_id=ci.id, timestamp=ci.started_at,
                          channels=data["channels"], conditions=data["conditions"], source="simulated_e_nose",
                          analysis=result))
    db.commit()
    return {"channels": data["channels"], "conditions": data["conditions"], "analysis": result, "simulated": True}


def _answers(db: Session, ci: CheckIn) -> dict:
    rows = db.scalars(select(QuestionnaireResponse).where(QuestionnaireResponse.checkin_id == ci.id)).all()
    return {r.question_id: r.value for r in rows}


def _question_context(db: Session, ci: CheckIn) -> qn.Context:
    ctx = qn.Context()
    for metric, attr in (("heart_rate", "heart_rate"), ("sleep_duration", "sleep")):
        r = db.scalars(select(SensorReading).where(SensorReading.checkin_id == ci.id,
                                                   SensorReading.metric == metric)).first()
        if r is None:
            continue
        base = bl.compute(db, ci.astronaut_id, metric, ci.started_at)
        if attr == "heart_rate":
            ctx.heart_rate = r.value
            ctx.heart_rate_z = base.z(r.value) if base else None
        else:
            ctx.sleep_hours = r.value
            ctx.sleep_z = base.z(r.value) if base else None
    from app.models import FacialObservation  # local import keeps module graph simple

    fo = db.scalars(select(FacialObservation).where(FacialObservation.checkin_id == ci.id)).first()
    ctx.facial_flagged = bool(fo and fo.comparison and fo.comparison.get("flagged"))
    return ctx


def next_question(db: Session, ci: CheckIn) -> dict:
    _require_active(ci)
    ci.stage = "VOICE_QUESTIONNAIRE"
    db.commit()
    answers = _answers(db, ci)
    q = qn.next_question(answers, _question_context(db, ci))
    asked = len([k for k in answers if k in qn.Q])
    return {"done": q is None, "question": q.to_dict() if q else None, "answered": asked}


def answer(db: Session, astro: Astronaut, ci: CheckIn, question_id: str, transcript: str, mode: str = "voice") -> dict:
    _require_active(ci)
    q = qn.Q.get(question_id)
    if q is None:
        raise CheckinError("Unknown question")
    parsed = qn.parse_answer(q, transcript)
    if parsed.command:
        return {"accepted": False, "command": parsed.command}
    if not parsed.ok:
        return {"accepted": False, "clarification": parsed.clarification}
    stored = parsed.stored(q.kind)
    db.add(QuestionnaireResponse(checkin_id=ci.id, astronaut_id=astro.id, question_id=q.id, question_text=q.text,
                                 transcript=transcript[:500], value=stored, input_mode=mode))
    for key, val in (parsed.derived or {}).items():
        if key in qn.Q or key in {"chest_pain", "fatigue"}:
            if key not in _answers(db, ci):
                db.add(QuestionnaireResponse(checkin_id=ci.id, astronaut_id=astro.id, question_id=key,
                                             question_text=f"(derived from answer to '{q.id}')",
                                             transcript=transcript[:500], value={"type": "derived", "value": val},
                                             input_mode="derived"))
    db.commit()
    return {"accepted": True, "value": stored, "acknowledgement": parsed.acknowledgement,
            "chest_pain": bool((parsed.derived or {}).get("chest_pain")), "kind": KIND_USER_REPORTED}


def complete(db: Session, astro: Astronaut, ci: CheckIn) -> dict:
    _require_active(ci)
    ci.stage = "PROCESSING"
    result = analysis.analyze_checkin(db, ci)
    ci.status = "completed"
    ci.stage = "COMPLETED"
    ci.completed_at = utcnow()
    priority = {"urgent": "critical", "review": "high"}.get(result["status_level"], "routine")
    msg = comms.enqueue(db, kind="checkin_report", priority=priority, astronaut_id=astro.id,
                        subject=f"{astro.display_name} · {ci.period} check-in · {result['status']}",
                        payload=report_payload(astro, ci, result), related_id=ci.id)
    audit(db, astro.id, "checkin_completed", astro.id, checkin=ci.id, status=result["status_level"])
    db.commit()
    result["report"] = comms.to_dict(msg)
    result["reminders"] = blood_tests.reminders_for(db, astro)
    db.commit()
    return result


def cancel(db: Session, astro: Astronaut, ci: CheckIn, reason: str) -> None:
    if ci.status == "in_progress":
        ci.status = "cancelled"
        ci.stage = "CANCELLED"
        ci.completed_at = utcnow()
        facial_scan.reset(ci.id)
        audit(db, astro.id, "checkin_cancelled", astro.id, checkin=ci.id, reason=reason)
        db.commit()


def report_payload(astro: Astronaut, ci: CheckIn, result: dict) -> dict:
    """Compact report: what flight surgeons need, without raw biometric data."""
    return {
        "astronaut": {"id": astro.id, "name": astro.full_name, "display_name": astro.display_name, "role": astro.role},
        "checkin": {"id": ci.id, "period": ci.period, "started_at": ci.started_at.isoformat() + "Z"},
        "status_level": result["status_level"],
        "status": result["status"],
        "metrics": {k: {kk: v[kk] for kk in ("label", "value", "unit", "z", "baseline", "status", "simulated")}
                    for k, v in result["metrics"].items()},
        "observations": [{k: o[k] for k in ("severity", "title", "explanation", "experimental")}
                         for o in result["observations"]],
        "guidance": [g["id"] for g in result["guidance"]],
        "facial_status": (result.get("facial") or {}).get("status"),
        "voc_status": (result.get("voc") or {}).get("status"),
        "subjective": result.get("subjective"),
        "provenance": result["data_provenance"],
    }


def sensor_plan(astro: Astronaut) -> list[dict]:
    return [{"device": d, "label": DEVICES[d].label, "short": DEVICES[d].short} for d in CHECKIN_SENSOR_SEQUENCE]


def mean_or_none(vals: list[float]) -> float | None:
    return float(np.mean(vals)) if vals else None
