"""Astronaut registry, facial enrollment and authentication endpoints."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_db
from app.models import Astronaut, AuthSession
from app.models.base import utcnow
from app.schemas.common import (
    AstronautCreate,
    EnrollmentFrame,
    EnrollmentStart,
    FrameIn,
    OperatorLogin,
    RecoveryIn,
    TicketIn,
)
from app.services.health.views import astronaut_dict
from app.services.identity import enrollment, recognition
from app.services.identity.face_engine import FaceEngineUnavailable, decode_image
from app.services.identity.sessions import (
    _resolve,
    audit,
    create_session,
    require_operator,
    require_session,
    revoke_session,
    verify_pin,
)
from app.services.scheduling import blood_tests

router = APIRouter(prefix="/api")

# Enrollment tickets: short-lived permission to attach a face to one specific profile.
_tickets: dict[str, dict] = {}


def _decode(image: str):
    try:
        return decode_image(image)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/astronauts")
def list_astronauts(db: Session = Depends(get_db)):
    """Public roster: names and enrollment state only — no health data."""
    rows = db.scalars(select(Astronaut).order_by(Astronaut.id)).all()
    return [{"id": a.id, "display_name": a.display_name, "full_name": a.full_name, "role": a.role,
             "face_enrolled": a.face_enrolled, "synthetic_profile": a.synthetic_profile} for a in rows]


@router.post("/astronauts", status_code=201)
def register_astronaut(body: AstronautCreate, db: Session = Depends(get_db)):
    crew_id = body.crew_id
    if crew_id is None:
        n = 1 + len(db.scalars(select(Astronaut.id)).all())
        while db.get(Astronaut, f"AST-{n:03d}"):
            n += 1
        crew_id = f"AST-{n:03d}"
    if db.get(Astronaut, crew_id):
        raise HTTPException(409, f"Crew ID {crew_id} already exists")
    astro = Astronaut(id=crew_id, full_name=body.full_name, preferred_name=body.preferred_name, title=body.title,
                      role=body.role, mission=body.mission or settings.mission_name, date_of_birth=body.date_of_birth,
                      height_cm=body.height_cm, baseline_notes=body.baseline_notes,
                      synthetic_profile=body.generate_demo_history)
    db.add(astro)
    audit(db, "enrollment", "astronaut_registered", crew_id)
    db.commit()
    if body.generate_demo_history:
        from app.seed.seed import seed_history

        seed_history(db, astro, utcnow(), days=21, analyze_from_day=8)
    blood_tests.ensure_schedule(db, crew_id)
    db.commit()
    ticket = _issue_ticket(crew_id, "registration")
    return {"astronaut": astronaut_dict(astro), "enrollment_ticket": ticket}


def _issue_ticket(astronaut_id: str, via: str) -> str:
    t = secrets.token_urlsafe(16)
    _tickets[t] = {"astronaut_id": astronaut_id, "via": via}
    enrollment.reset(astronaut_id)
    return t


def _ticket(ticket: str) -> dict:
    info = _tickets.get(ticket)
    if info is None:
        raise HTTPException(403, "Invalid or expired enrollment ticket")
    return info


@router.post("/enrollment/start")
def enrollment_start(body: EnrollmentStart, authorization: str | None = Header(default=None),
                     db: Session = Depends(get_db)):
    astro = db.get(Astronaut, body.astronaut_id)
    if astro is None:
        raise HTTPException(404, "Astronaut not found")
    if astro.face_enrolled:
        # Re-enrollment replaces biometric data: authorized operators only.
        sess = _resolve(db, authorization) if authorization else None
        if sess is None or sess.role != "operator":
            raise HTTPException(403, "This astronaut is already enrolled. Re-enrollment requires an authorized operator.")
    return {"ticket": _issue_ticket(astro.id, "operator" if astro.face_enrolled else "first_enrollment"),
            "astronaut": astronaut_dict(astro), "captures_needed": settings.enrollment_captures,
            "first_prompt": enrollment.POSE_PROMPTS[0]}


@router.post("/enrollment/frame")
def enrollment_frame(body: EnrollmentFrame, db: Session = Depends(get_db)):
    info = _ticket(body.ticket)
    try:
        return enrollment.process_frame(db, info["astronaut_id"], _decode(body.image))
    except FaceEngineUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/enrollment/finalize")
def enrollment_finalize(body: TicketIn, db: Session = Depends(get_db)):
    info = _ticket(body.ticket)
    astro = db.get(Astronaut, info["astronaut_id"])
    try:
        result = enrollment.finalize(db, astro, actor=info["via"])
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    _tickets.pop(body.ticket, None)
    return {"enrolled": True, "astronaut": astronaut_dict(astro), **result}


@router.post("/enrollment/cancel")
def enrollment_cancel(body: TicketIn):
    info = _tickets.pop(body.ticket, None)
    if info:
        enrollment.reset(info["astronaut_id"])
    return {"cancelled": True}


@router.post("/auth/face")
def face_frame(body: FrameIn, db: Session = Depends(get_db)):
    """Booth stand-by recognition. Returns a session only after multi-frame confirmation."""
    try:
        if body.mode == "presence":
            return recognition.presence(_decode(body.image))
        return recognition.recognize_frame(db, _decode(body.image), body.client_id)
    except FaceEngineUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/auth/me")
def me(sess: AuthSession = Depends(require_session), db: Session = Depends(get_db)):
    astro = db.get(Astronaut, sess.astronaut_id) if sess.astronaut_id else None
    return {"role": sess.role, "method": sess.method, "astronaut": astronaut_dict(astro) if astro else None,
            "expires_at": sess.expires_at.isoformat() + "Z"}


@router.post("/auth/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    if authorization and authorization.lower().startswith("bearer "):
        revoke_session(db, authorization.split(" ", 1)[1])
    return {"ok": True}


@router.post("/auth/operator")
def operator_login(body: OperatorLogin, db: Session = Depends(get_db)):
    if not verify_pin(body.pin):
        audit(db, "unknown", "operator_login_failed")
        db.commit()
        raise HTTPException(401, "Invalid operator PIN")
    token, sess = create_session(db, role="operator", method="operator_pin")
    return {"token": token, "role": "operator", "expires_at": sess.expires_at.isoformat() + "Z"}


@router.post("/auth/recovery")
def recovery_session(body: RecoveryIn, op: AuthSession = Depends(require_operator), db: Session = Depends(get_db)):
    """Authorized-operator fallback (facial injury, camera failure). Audited; never automatic."""
    astro = db.get(Astronaut, body.astronaut_id)
    if astro is None:
        raise HTTPException(404, "Astronaut not found")
    token, _ = create_session(db, role="astronaut", method="operator_recovery", astronaut_id=astro.id)
    audit(db, "operator", "recovery_session_issued", astro.id, reason=body.reason, operator_session=op.id[:8])
    db.commit()
    return {"token": token, "astronaut_id": astro.id, "display_name": astro.display_name,
            "preferred_name": astro.preferred_name, "method": "operator_recovery"}
