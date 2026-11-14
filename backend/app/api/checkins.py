"""Hands-free check-in workflow endpoints (all require a face-authenticated astronaut session)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Astronaut, AuthSession, BloodTest
from app.schemas.common import AnswerIn, BloodRespondIn, BloodStartIn, FrameIn, SkipIn
from app.services.checkin import orchestrator as orch
from app.services.health.views import astronaut_dict, insights
from app.services.identity.face_engine import FaceEngineUnavailable, decode_image
from app.services.identity.sessions import require_astronaut, require_session
from app.services.scheduling import blood_tests
from app.services.sensors.catalog import DEVICES, METRICS

router = APIRouter(prefix="/api")


def _owned(db: Session, astro: Astronaut, checkin_id: str):
    try:
        return orch.get_owned(db, astro, checkin_id)
    except orch.CheckinError as exc:
        raise HTTPException(404, str(exc)) from exc


def _guard(fn):
    try:
        return fn()
    except orch.CheckinError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/checkins", status_code=201)
def start_checkin(sess: AuthSession = Depends(require_session), astro: Astronaut = Depends(require_astronaut),
                  db: Session = Depends(get_db)):
    ci, resumed = orch.start(db, astro, sess.id)
    sched = blood_tests.schedule_info(db, astro.id)
    db.commit()
    greeting = (f"Welcome back, {astro.display_name}. Your {ci.period} health assessment is beginning."
                if not resumed else f"Welcome back, {astro.display_name}. Resuming your assessment.")
    return {"checkin": {"id": ci.id, "period": ci.period, "started_at": ci.started_at.isoformat() + "Z",
                        "resumed": resumed},
            "astronaut": astronaut_dict(astro), "greeting": greeting, "blood_test": sched,
            "sensor_plan": orch.sensor_plan(astro)}


@router.get("/checkins/{checkin_id}")
def get_checkin(checkin_id: str, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    ci = _owned(db, astro, checkin_id)
    return {"id": ci.id, "status": ci.status, "stage": ci.stage, "period": ci.period, "analysis": ci.analysis,
            "faults": ci.faults}


@router.post("/checkins/{checkin_id}/facial/frame")
def facial_frame(checkin_id: str, body: FrameIn, astro: Astronaut = Depends(require_astronaut),
                 db: Session = Depends(get_db)):
    ci = _owned(db, astro, checkin_id)
    try:
        img = decode_image(body.image)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    try:
        return _guard(lambda: orch.facial_frame(db, astro, ci, img))
    except (FaceEngineUnavailable, RuntimeError) as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/checkins/{checkin_id}/facial/skip")
def facial_skip(checkin_id: str, body: SkipIn, astro: Astronaut = Depends(require_astronaut),
                db: Session = Depends(get_db)):
    orch.skip_facial(db, _owned(db, astro, checkin_id), body.reason)
    return {"skipped": True}


@router.post("/checkins/{checkin_id}/sensors/{device_id}")
async def collect_sensor(checkin_id: str, device_id: str, astro: Astronaut = Depends(require_astronaut),
                         db: Session = Depends(get_db)):
    ci = _owned(db, astro, checkin_id)
    try:
        return await orch.collect_device(db, astro, ci, device_id)
    except orch.CheckinError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/checkins/{checkin_id}/voc")
async def collect_voc(checkin_id: str, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    ci = _owned(db, astro, checkin_id)
    try:
        return await orch.collect_voc(db, astro, ci)
    except orch.CheckinError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/checkins/{checkin_id}/questionnaire/next")
def next_question(checkin_id: str, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    ci = _owned(db, astro, checkin_id)
    return _guard(lambda: orch.next_question(db, ci))


@router.post("/checkins/{checkin_id}/questionnaire/answer")
def answer(checkin_id: str, body: AnswerIn, astro: Astronaut = Depends(require_astronaut),
           db: Session = Depends(get_db)):
    ci = _owned(db, astro, checkin_id)
    return _guard(lambda: orch.answer(db, astro, ci, body.question_id, body.transcript, body.input_mode))


@router.post("/checkins/{checkin_id}/complete")
def complete(checkin_id: str, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    ci = _owned(db, astro, checkin_id)
    return _guard(lambda: orch.complete(db, astro, ci))


@router.post("/checkins/{checkin_id}/cancel")
def cancel(checkin_id: str, body: SkipIn, astro: Astronaut = Depends(require_astronaut),
           db: Session = Depends(get_db)):
    orch.cancel(db, astro, _owned(db, astro, checkin_id), body.reason)
    return {"cancelled": True}


@router.get("/me/insights")
def my_insights(astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    data = insights(db, astro)
    db.commit()
    return data


# ---- weekly blood test -------------------------------------------------------------------------

@router.get("/blood-tests/schedule")
def blood_schedule(astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    info = blood_tests.schedule_info(db, astro.id)
    db.commit()
    return {**info, "steps": blood_tests.COLLECTION_STEPS}


@router.post("/blood-tests/respond")
def blood_respond(body: BloodRespondIn, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    if body.answer == "yes":
        return {"accepted": True, "steps": blood_tests.COLLECTION_STEPS}
    info = blood_tests.defer(db, astro.id, body.answer)
    db.commit()
    return {"accepted": False, "schedule": info}


@router.post("/blood-tests", status_code=201)
def blood_start(body: BloodStartIn, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    test = blood_tests.start(db, astro.id, body.checkin_id)
    db.commit()
    return {"id": test.id, "status": test.status, "steps": blood_tests.COLLECTION_STEPS, "simulated": True}


@router.post("/blood-tests/{test_id}/analyze")
async def blood_analyze(test_id: str, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    test = db.get(BloodTest, test_id)
    if test is None or test.astronaut_id != astro.id:
        raise HTTPException(404, "Blood test not found")
    if test.status != "in_progress":
        raise HTTPException(409, "Blood test already processed")
    await blood_tests.analyze(db, test, astro.scenario)
    from app.services.communications import queue as comms

    hist = blood_tests.history(db, astro.id)
    comms.enqueue(db, kind="lab_report", astronaut_id=astro.id, subject=f"{astro.display_name} · weekly lab panel",
                  payload={"astronaut_id": astro.id, "results": hist[-1]["results"], "simulated": True},
                  related_id=test.id)
    db.commit()
    return {"test": hist[-1], "previous": hist[-2] if len(hist) > 1 else None,
            "schedule": blood_tests.schedule_info(db, astro.id)}


@router.get("/catalog")
def catalog():
    return {"metrics": {k: m.to_dict() for k, m in METRICS.items()},
            "devices": {k: d.to_dict() for k, d in DEVICES.items()}}
