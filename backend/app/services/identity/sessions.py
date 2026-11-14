"""Bearer-token sessions. Tokens are random; only their SHA-256 hash is stored."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import timedelta

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_db
from app.models import Astronaut, AuditEvent, AuthSession
from app.models.base import utcnow


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def audit(db: Session, actor: str, action: str, astronaut_id: str | None = None, **detail) -> None:
    db.add(AuditEvent(actor=actor, action=action, astronaut_id=astronaut_id, detail=json.dumps(detail, default=str)))


def create_session(
    db: Session, *, role: str, method: str, astronaut_id: str | None = None, confidence: float | None = None
) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    sess = AuthSession(
        id=_hash(token),
        astronaut_id=astronaut_id,
        role=role,
        method=method,
        confidence=confidence,
        expires_at=utcnow() + timedelta(minutes=settings.session_minutes),
    )
    db.add(sess)
    audit(db, role, f"session_created:{method}", astronaut_id, confidence=confidence)
    db.commit()
    return token, sess


def revoke_session(db: Session, token: str) -> None:
    sess = db.get(AuthSession, _hash(token))
    if sess and not sess.revoked:
        sess.revoked = True
        audit(db, sess.role, "session_revoked", sess.astronaut_id)
        db.commit()


def _resolve(db: Session, authorization: str | None) -> AuthSession:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    sess = db.get(AuthSession, _hash(authorization.split(" ", 1)[1].strip()))
    if sess is None or sess.revoked or sess.expires_at < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid")
    return sess


def require_session(
    authorization: str | None = Header(default=None), db: Session = Depends(get_db)
) -> AuthSession:
    return _resolve(db, authorization)


def require_astronaut(sess: AuthSession = Depends(require_session), db: Session = Depends(get_db)) -> Astronaut:
    if sess.role != "astronaut" or not sess.astronaut_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Astronaut session required")
    astro = db.get(Astronaut, sess.astronaut_id)
    if astro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    return astro


def require_operator(sess: AuthSession = Depends(require_session)) -> AuthSession:
    if sess.role != "operator":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Authorized operator session required")
    return sess


def verify_pin(pin: str) -> bool:
    return secrets.compare_digest(pin.encode(), settings.operator_pin.encode())
