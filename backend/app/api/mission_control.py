"""Ground-side views and demo/admin controls (authorized operator session required).

Mission Control only shows what has actually been DELIVERED over the simulated link, so a link outage
is visible as stale ground data while onboard analysis continues normally.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import session as dbs
from app.database.session import get_db
from app.models import Astronaut, AuditEvent, AuthSession, CommunicationMessage, EmergencyEvent
from app.schemas.common import AckIn, LinkIn, ScenarioIn
from app.services.communications import queue as comms
from app.services.health.views import astronaut_dict, environment_latest, insights
from app.services.identity import enrollment
from app.services.identity.matcher import templates
from app.services.identity.sessions import audit, require_operator
from app.services.scheduling import blood_tests
from app.services.sensors.profiles import SCENARIOS

router = APIRouter(prefix="/api", dependencies=[Depends(require_operator)])

DELIVERED = ("delivered", "acknowledged")


@router.get("/mission-control/overview")
def overview(db: Session = Depends(get_db)):
    comms.tick(db)
    crew = []
    for a in db.scalars(select(Astronaut).order_by(Astronaut.id)):
        last = db.scalars(select(CommunicationMessage).where(
            CommunicationMessage.astronaut_id == a.id, CommunicationMessage.kind == "checkin_report",
            CommunicationMessage.status.in_(DELIVERED)).order_by(CommunicationMessage.delivered_at.desc())).first()
        pending = db.scalars(select(CommunicationMessage).where(
            CommunicationMessage.astronaut_id == a.id, CommunicationMessage.status.in_(["queued", "in_transit"]))).all()
        crew.append({**astronaut_dict(a), "last_report": comms.to_dict(last, include_payload=True) if last else None,
                     "pending_reports": len(pending)})
    msgs = db.scalars(select(CommunicationMessage).order_by(CommunicationMessage.created_at.desc()).limit(60)).all()
    emergencies = [m for m in msgs if m.kind == "emergency" and m.status in DELIVERED]
    return {
        "link": comms.get_link(db),
        "crew": crew,
        "messages": [comms.to_dict(m) for m in msgs],
        "emergencies": [comms.to_dict(m, include_payload=True) for m in emergencies[:5]],
        "counts": {s: sum(1 for m in msgs if m.status == s) for s in ("queued", "in_transit", "delivered", "acknowledged")},
    }


@router.get("/mission-control/messages/{message_id}")
def message(message_id: str, db: Session = Depends(get_db)):
    m = db.get(CommunicationMessage, message_id)
    if m is None:
        raise HTTPException(404, "Message not found")
    if m.status not in DELIVERED:
        raise HTTPException(409, "Message has not reached Earth yet")
    return comms.to_dict(m, include_payload=True)


@router.post("/mission-control/messages/{message_id}/ack")
def ack(message_id: str, body: AckIn, db: Session = Depends(get_db)):
    m = db.get(CommunicationMessage, message_id)
    if m is None:
        raise HTTPException(404, "Message not found")
    try:
        comms.acknowledge(db, m, body.by)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return comms.to_dict(m)


@router.get("/mission-control/astronauts/{astronaut_id}")
def astronaut_detail(astronaut_id: str, db: Session = Depends(get_db)):
    """Full medical history for flight surgeons (operator access)."""
    a = db.get(Astronaut, astronaut_id)
    if a is None:
        raise HTTPException(404, "Astronaut not found")
    data = insights(db, a)
    db.commit()
    return data


@router.get("/comms/link")
def get_link(db: Session = Depends(get_db)):
    return comms.get_link(db)


@router.post("/comms/link")
def set_link(body: LinkIn, sess: AuthSession = Depends(require_operator), db: Session = Depends(get_db)):
    link = comms.set_link(db, body.link_up, body.delay_s)
    audit(db, "operator", "comm_link_changed", None, **link)
    db.commit()
    return link


# ---- demo & admin ---------------------------------------------------------------------------------

@router.get("/demo/scenarios")
def scenarios(db: Session = Depends(get_db)):
    return {"scenarios": {k: v["label"] for k, v in SCENARIOS.items()},
            "astronauts": [{"id": a.id, "display_name": a.display_name, "scenario": a.scenario,
                            "face_enrolled": a.face_enrolled, "blood_test": blood_tests.schedule_info(db, a.id)}
                           for a in db.scalars(select(Astronaut).order_by(Astronaut.id))],
            "environment": environment_latest(db)}


@router.post("/demo/astronauts/{astronaut_id}/scenario")
def set_scenario(astronaut_id: str, body: ScenarioIn, db: Session = Depends(get_db)):
    a = db.get(Astronaut, astronaut_id)
    if a is None or body.scenario not in SCENARIOS:
        raise HTTPException(422, "Unknown astronaut or scenario")
    a.scenario = body.scenario
    audit(db, "operator", "demo_scenario_set", a.id, scenario=body.scenario)
    db.commit()
    return {"id": a.id, "scenario": a.scenario}


@router.post("/demo/astronauts/{astronaut_id}/blood-test-due")
def force_blood_due(astronaut_id: str, db: Session = Depends(get_db)):
    from app.models.base import utcnow
    from datetime import timedelta

    rem = blood_tests.ensure_schedule(db, astronaut_id)
    rem.due_at = utcnow() - timedelta(hours=1)
    rem.status = "pending"
    rem.snoozed_until = None
    db.commit()
    return blood_tests.schedule_info(db, astronaut_id)


@router.post("/demo/reset")
def reset_demo(db: Session = Depends(get_db)):
    """Reset and reseed the demo database. Facial enrollments are removed too."""
    from app.seed.seed import reset_database, seed

    db.close()
    reset_database()
    templates.invalidate()
    for aid in list(enrollment._pending):
        enrollment.reset(aid)
    s = dbs.SessionLocal()
    try:
        seed(s)
    finally:
        s.close()
    return {"reset": True}


@router.delete("/admin/astronauts/{astronaut_id}/biometrics")
def delete_biometrics(astronaut_id: str, db: Session = Depends(get_db)):
    a = db.get(Astronaut, astronaut_id)
    if a is None:
        raise HTTPException(404, "Astronaut not found")
    enrollment.delete_biometrics(db, a, actor="operator")
    return {"deleted": True, "astronaut": astronaut_dict(a)}


@router.get("/admin/audit")
def audit_log(db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditEvent).order_by(AuditEvent.timestamp.desc()).limit(100)).all()
    return [{"t": r.timestamp.isoformat() + "Z", "actor": r.actor, "action": r.action,
             "astronaut_id": r.astronaut_id, "detail": r.detail} for r in rows]


@router.get("/admin/emergencies")
def emergencies(db: Session = Depends(get_db)):
    rows = db.scalars(select(EmergencyEvent).order_by(EmergencyEvent.started_at.desc()).limit(20)).all()
    return [{"id": e.id, "protocol_id": e.protocol_id, "status": e.status, "patient_id": e.patient_id,
             "started_at": e.started_at.isoformat() + "Z"} for e in rows]
