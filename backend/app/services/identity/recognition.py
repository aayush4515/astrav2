"""Booth stand-by recognition: one webcam frame in, a recognition state (and maybe a session) out."""

from __future__ import annotations

import numpy as np
from sqlalchemy.orm import Session

from app.models import Astronaut
from app.services.identity.face_engine import engine as face_engine
from app.services.identity.matcher import match_embedding, tracker
from app.services.identity.sessions import audit, create_session

MESSAGES = {
    "no_face": "Approach for health check-in",
    "multiple_faces": "One astronaut at a time, please",
    "low_quality": "Hold still and face the camera",
    "unknown": "Face not recognized",
    "ambiguous": "Identity uncertain — please face the camera",
    "no_enrollments": "No astronauts enrolled yet",
    "matching": "Verifying identity…",
    "confirmed": "Identity confirmed",
}


def recognize_frame(db: Session, img: np.ndarray, client_id: str) -> dict:
    h, w = img.shape[:2]
    faces = face_engine.detect(img)
    if not faces:
        tracker.reset(client_id)
        return _result("no_face")
    face_dicts = [f.to_dict(w, h) for f in faces]
    if len(faces) > 1:
        tracker.reset(client_id)
        return _result("multiple_faces", faces=face_dicts)
    face = faces[0]
    if not face.quality["ok"]:
        return _result("low_quality", faces=face_dicts, issues=face.quality["issues"])

    match = match_embedding(db, face_engine.embed(img, face))
    if match.status != "match":
        tracker.reset(client_id)
        return _result(match.status, faces=face_dicts, similarity=round(match.similarity, 3))

    nose = face.keypoints[2]
    hits, confirmed, liveness = tracker.update(client_id, match.astronaut_id, match.similarity, (nose[0] / w, nose[1] / h))
    astro = db.get(Astronaut, match.astronaut_id)
    if not confirmed:
        return _result("matching", faces=face_dicts, similarity=round(match.similarity, 3),
                       progress=hits, liveness=liveness)

    tracker.reset(client_id)
    token, _ = create_session(db, role="astronaut", method="face", astronaut_id=astro.id,
                              confidence=round(match.similarity, 3))
    audit(db, "booth", "face_authenticated", astro.id, similarity=match.similarity,
          runner_up=match.runner_up_similarity)
    db.commit()
    return _result(
        "confirmed",
        faces=face_dicts,
        similarity=round(match.similarity, 3),
        session={"token": token, "astronaut_id": astro.id, "display_name": astro.display_name,
                 "preferred_name": astro.preferred_name},
    )


def presence(img: np.ndarray) -> dict:
    h, w = img.shape[:2]
    faces = face_engine.detect(img)
    return {"status": "present" if faces else "no_face", "message": "", "faces": [f.to_dict(w, h) for f in faces]}


def _result(status: str, **extra) -> dict:
    return {"status": status, "message": MESSAGES[status], **extra}
