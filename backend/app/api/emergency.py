"""Emergency assistance. Deliberately requires NO authentication: anyone aboard can trigger it."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Astronaut, EmergencyEvent, SensorReading
from app.models.base import utcnow
from app.schemas.common import EmergencyIn, EmergencyProtocolIn, EmergencyStepIn
from app.services.communications import queue as comms
from app.services.emergency.protocols import PROTOCOLS, match_protocol
from app.services.identity.sessions import audit
from app.services.sensors.catalog import METRICS

router = APIRouter(prefix="/api/emergencies")


def _patient_snapshot(db: Session, patient_id: str | None) -> dict | None:
    """Break-glass access to the patient's most recent vitals (audited)."""
    if not patient_id:
        return None
    astro = db.get(Astronaut, patient_id)
    if astro is None:
        return None
    latest: dict[str, dict] = {}
    rows = db.scalars(select(SensorReading).where(SensorReading.astronaut_id == patient_id,
                                                  SensorReading.valid.is_(True))
                      .order_by(SensorReading.timestamp.desc()).limit(60)).all()
    for r in rows:
        if r.metric in METRICS and r.metric not in latest:
            latest[r.metric] = {"label": METRICS[r.metric].label, "value": r.value, "unit": r.unit,
                                "t": r.timestamp.isoformat() + "Z", "simulated": r.simulated}
    return {"id": astro.id, "name": astro.display_name, "full_name": astro.full_name,
            "date_of_birth": astro.date_of_birth, "latest_vitals": latest}


def _event_dict(db: Session, ev: EmergencyEvent) -> dict:
    proto = PROTOCOLS.get(ev.protocol_id)
    msg = db.get(comms.CommunicationMessage, ev.message_id) if ev.message_id else None
    return {"id": ev.id, "status": ev.status, "trigger": ev.trigger, "protocol": proto.to_dict() if proto else None,
            "current_step": ev.current_step, "started_at": ev.started_at.isoformat() + "Z",
            "crew_alerted_at": ev.crew_alerted_at.isoformat() + "Z" if ev.crew_alerted_at else None,
            "resolved_at": ev.resolved_at.isoformat() + "Z" if ev.resolved_at else None, "log": ev.log,
            "patient": _patient_snapshot(db, ev.patient_id), "message": comms.to_dict(msg) if msg else None,
            "link": comms.get_link(db)}


@router.get("/protocols")
def protocols():
    return [p.to_dict() for p in PROTOCOLS.values()]


@router.get("/crew")
def crew(db: Session = Depends(get_db)):
    return [{"id": a.id, "name": a.display_name} for a in db.scalars(select(Astronaut).order_by(Astronaut.id))]


@router.post("", status_code=201)
def activate(body: EmergencyIn, db: Session = Depends(get_db)):
    active = db.scalars(select(EmergencyEvent).where(EmergencyEvent.status == "active")).first()
    if active:
        return _event_dict(db, active)
    protocol_id = body.protocol_id or (match_protocol(body.transcript) if body.transcript else None) \
        or "collapse_chest_pain"
    if protocol_id not in PROTOCOLS:
        raise HTTPException(422, "Unknown protocol")
    now = utcnow()
    ev = EmergencyEvent(trigger=body.trigger, protocol_id=protocol_id, patient_id=body.patient_id,
                        reporter=body.reporter_id or "crew", started_at=now, crew_alerted_at=now,
                        log=[{"t": now.isoformat() + "Z", "event": "activated", "trigger": body.trigger,
                              "transcript": body.transcript},
                             {"t": now.isoformat() + "Z", "event": "crew_alert_sent"}])
    db.add(ev)
    db.flush()
    msg = comms.enqueue(db, kind="emergency", priority="critical", astronaut_id=body.patient_id,
                        subject=f"EMERGENCY · {PROTOCOLS[protocol_id].title}",
                        payload={"event_id": ev.id, "protocol": protocol_id, "patient": _patient_snapshot(db, body.patient_id),
                                 "activated_at": now.isoformat() + "Z", "trigger": body.trigger},
                        related_id=ev.id)
    ev.message_id = msg.id
    audit(db, body.reporter_id or "crew", "emergency_activated", body.patient_id, protocol=protocol_id)
    db.commit()
    return _event_dict(db, ev)


@router.get("/active")
def active_event(db: Session = Depends(get_db)):
    ev = db.scalars(select(EmergencyEvent).where(EmergencyEvent.status == "active")
                    .order_by(EmergencyEvent.started_at.desc())).first()
    return _event_dict(db, ev) if ev else None


def _get(db: Session, event_id: str) -> EmergencyEvent:
    ev = db.get(EmergencyEvent, event_id)
    if ev is None:
        raise HTTPException(404, "Emergency event not found")
    return ev


@router.post("/{event_id}/step")
def step(event_id: str, body: EmergencyStepIn, db: Session = Depends(get_db)):
    ev = _get(db, event_id)
    n = len(PROTOCOLS[ev.protocol_id].steps)
    target = {"next": ev.current_step + 1, "back": ev.current_step - 1}.get(body.action, body.step or 0)
    ev.current_step = max(0, min(n - 1, target))
    ev.log = [*ev.log, {"t": utcnow().isoformat() + "Z", "event": f"step_{body.action}", "step": ev.current_step,
                        "note": body.note}]
    db.commit()
    return _event_dict(db, ev)


@router.post("/{event_id}/protocol")
def set_protocol(event_id: str, body: EmergencyProtocolIn, db: Session = Depends(get_db)):
    ev = _get(db, event_id)
    if body.protocol_id not in PROTOCOLS:
        raise HTTPException(422, "Unknown protocol")
    ev.protocol_id = body.protocol_id
    ev.current_step = 0
    if body.patient_id:
        ev.patient_id = body.patient_id
        audit(db, "crew", "emergency_patient_record_accessed", body.patient_id, event=ev.id)
    ev.log = [*ev.log, {"t": utcnow().isoformat() + "Z", "event": "protocol_selected", "protocol": body.protocol_id,
                        "patient": body.patient_id}]
    msg = comms.enqueue(db, kind="emergency", priority="critical", astronaut_id=ev.patient_id,
                        subject=f"EMERGENCY UPDATE · {PROTOCOLS[body.protocol_id].title}",
                        payload={"event_id": ev.id, "protocol": body.protocol_id,
                                 "patient": _patient_snapshot(db, ev.patient_id)}, related_id=ev.id)
    ev.message_id = msg.id
    db.commit()
    return _event_dict(db, ev)


@router.post("/{event_id}/resolve")
def resolve(event_id: str, db: Session = Depends(get_db)):
    ev = _get(db, event_id)
    ev.status = "resolved"
    ev.resolved_at = utcnow()
    ev.log = [*ev.log, {"t": ev.resolved_at.isoformat() + "Z", "event": "resolved"}]
    comms.enqueue(db, kind="emergency", priority="high", astronaut_id=ev.patient_id,
                  subject="Emergency resolved onboard", payload={"event_id": ev.id, "log": ev.log}, related_id=ev.id)
    db.commit()
    return _event_dict(db, ev)
