"""One-time facial enrollment: collect several good captures, store SFace templates (no images)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Astronaut, FacialEnrollment, FacialObservation
from app.services.facial import scan as facial_scan
from app.services.identity.face_engine import EMBEDDING_MODEL, engine as face_engine
from app.services.identity.matcher import embedding_to_bytes, match_embedding, templates
from app.services.identity.sessions import audit

ISSUE_TEXT = {
    "too_far": "Move a little closer.",
    "too_dark": "More light is needed.",
    "too_bright": "The image is over-exposed.",
    "blurry": "Hold still for a moment.",
    "turned_away": "Face the camera.",
    "head_tilted": "Keep your head upright.",
    "low_detection_confidence": "Face the camera directly.",
    "partially_out_of_frame": "Centre your face in the frame.",
}

POSE_PROMPTS = [
    "Look straight at the camera.",
    "Look straight at the camera.",
    "Turn your head slightly to the left.",
    "Turn your head slightly to the right.",
    "Tilt your chin slightly up.",
    "Look straight at the camera and relax.",
]


@dataclass
class PendingEnrollment:
    embeddings: list[np.ndarray] = field(default_factory=list)
    qualities: list[float] = field(default_factory=list)
    yaws: list[float] = field(default_factory=list)


_pending: dict[str, PendingEnrollment] = {}


def reset(astronaut_id: str) -> None:
    _pending.pop(astronaut_id, None)
    facial_scan.reset(f"enroll:{astronaut_id}")


def process_frame(db: Session, astronaut_id: str, img: np.ndarray) -> dict:
    pending = _pending.setdefault(astronaut_id, PendingEnrollment())
    needed = settings.enrollment_captures
    h, w = img.shape[:2]
    faces = face_engine.detect(img)
    base = {"captured": len(pending.embeddings), "needed": needed, "accepted": False}
    if not faces:
        return {**base, "status": "no_face", "message": "No face detected. Look toward the camera."}
    if len(faces) > 1:
        return {**base, "status": "multiple_faces", "message": "Only one person should be in view during enrollment.",
                "faces": [f.to_dict(w, h) for f in faces]}
    face = faces[0]
    q = face.quality
    if not q["ok"]:
        msg = ISSUE_TEXT.get(q["issues"][0], "Adjust your position.")
        return {**base, "status": "low_quality", "message": msg, "faces": [face.to_dict(w, h)]}

    emb = face_engine.embed(img, face)
    # Consistency: every capture must look like the same person as the first one.
    if pending.embeddings and float(np.dot(pending.embeddings[0], emb)) < 0.55:
        return {**base, "status": "inconsistent", "message": "Captures do not look like the same person. Restarting.",
                "faces": [face.to_dict(w, h)]} | _restart(astronaut_id)
    # Refuse to enroll a face that already belongs to a different astronaut.
    existing = match_embedding(db, emb)
    if existing.status == "match" and existing.astronaut_id != astronaut_id:
        return {**base, "status": "already_enrolled",
                "message": "This face is already enrolled to another astronaut profile.",
                "faces": [face.to_dict(w, h)]}

    pending.embeddings.append(emb)
    pending.qualities.append(min(1.0, face.score * min(1.0, q["sharpness"] / 120)))
    pending.yaws.append(q["yaw"])
    # Frontal frames also feed the facial-geometry reference used for later change detection.
    if abs(q["yaw"]) < 10:
        try:
            facial_scan.process_frame(img, f"enroll:{astronaut_id}")
        except RuntimeError:
            pass
    n = len(pending.embeddings)
    return {
        "captured": n,
        "needed": needed,
        "accepted": True,
        "status": "complete" if n >= needed else "capturing",
        "message": "Capture accepted." if n < needed else "All captures collected.",
        "next_prompt": POSE_PROMPTS[n] if n < needed else None,
        "faces": [face.to_dict(w, h)],
    }


def _restart(astronaut_id: str) -> dict:
    reset(astronaut_id)
    return {"captured": 0}


def finalize(db: Session, astronaut: Astronaut, actor: str) -> dict:
    pending = _pending.get(astronaut.id)
    if pending is None or len(pending.embeddings) < settings.enrollment_captures:
        raise ValueError("Not enough captures to complete enrollment")
    db.execute(delete(FacialEnrollment).where(FacialEnrollment.astronaut_id == astronaut.id))
    for emb, qual, yaw in zip(pending.embeddings, pending.qualities, pending.yaws):
        db.add(FacialEnrollment(astronaut_id=astronaut.id, embedding=embedding_to_bytes(emb),
                                model=EMBEDDING_MODEL, quality=qual, yaw_deg=yaw))
    mean = np.mean(np.stack(pending.embeddings), axis=0)
    mean /= np.linalg.norm(mean) + 1e-9
    db.add(FacialEnrollment(astronaut_id=astronaut.id, embedding=embedding_to_bytes(mean),
                            model=EMBEDDING_MODEL + ":mean", quality=float(np.mean(pending.qualities))))
    astronaut.face_enrolled = True
    ref = facial_scan.finalize(db, f"enroll:{astronaut.id}", astronaut.id, None, is_reference=True)
    audit(db, actor, "face_enrolled", astronaut.id, templates=len(pending.embeddings) + 1,
          facial_reference=bool(ref))
    db.commit()
    _pending.pop(astronaut.id, None)
    templates.invalidate()
    return {"templates": len(pending.embeddings) + 1, "facial_reference": bool(ref)}


def delete_biometrics(db: Session, astronaut: Astronaut, actor: str) -> None:
    db.execute(delete(FacialEnrollment).where(FacialEnrollment.astronaut_id == astronaut.id))
    db.execute(delete(FacialObservation).where(FacialObservation.astronaut_id == astronaut.id,
                                               FacialObservation.is_reference.is_(True)))
    astronaut.face_enrolled = False
    audit(db, actor, "face_biometrics_deleted", astronaut.id)
    db.commit()
    templates.invalidate()
