"""Frame-by-frame facial scan used during enrollment (reference) and check-ins."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import settings
from app.models import FacialObservation
from app.services.facial import comparison as cmp
from app.services.facial.features import GUIDANCE, OVERLAY_INDICES, aggregate, capture_quality, extract_features
from app.services.facial.landmarks import engine as landmark_engine


@dataclass
class ScanBuffer:
    frames: list[dict[str, float]] = field(default_factory=list)
    rejected: int = 0


_buffers: dict[str, ScanBuffer] = {}


def reset(scan_id: str) -> None:
    _buffers.pop(scan_id, None)


def process_frame(img: np.ndarray, scan_id: str) -> dict:
    """Run landmarks on one frame; accept it into the scan buffer if the capture is good."""
    buf = _buffers.setdefault(scan_id, ScanBuffer())
    results = landmark_engine.detect(img)
    payload: dict = {"accepted": False, "frames": len(buf.frames), "needed": settings.facial_scan_frames}
    if not results:
        buf.rejected += 1
        payload.update(issues=["no_face"], guidance=GUIDANCE["no_face"], landmarks=[])
        return payload
    if len(results) > 1:
        buf.rejected += 1
        payload.update(issues=["multiple_faces"], guidance=GUIDANCE["multiple_faces"], landmarks=[])
        return payload
    lm = results[0]
    gray_mean = float(img.mean())
    quality = capture_quality(lm, gray_mean)
    payload["quality"] = quality
    payload["landmarks"] = [[round(float(lm.points[i, 0]), 4), round(float(lm.points[i, 1]), 4)] for i in OVERLAY_INDICES]
    if not quality["ok"]:
        buf.rejected += 1
        payload.update(issues=quality["issues"], guidance=GUIDANCE.get(quality["issues"][0]))
        return payload
    feats = extract_features(lm)
    buf.frames.append(feats)
    payload.update(accepted=True, frames=len(buf.frames), issues=[], live_features=feats)
    payload["complete"] = len(buf.frames) >= settings.facial_scan_frames
    return payload


def finalize(
    db: Session, scan_id: str, astronaut_id: str, checkin_id: str | None, *, is_reference: bool
) -> FacialObservation | None:
    buf = _buffers.pop(scan_id, None)
    if buf is None or len(buf.frames) < max(3, settings.facial_scan_frames // 2):
        return None
    feats, spread = aggregate(buf.frames)
    obs = FacialObservation(
        astronaut_id=astronaut_id,
        checkin_id=checkin_id,
        features=feats,
        feature_spread=spread,
        quality={"frames_accepted": len(buf.frames), "frames_rejected": buf.rejected},
        frames_used=len(buf.frames),
        is_reference=is_reference,
    )
    if not is_reference:
        history = cmp.reference_history(db, astronaut_id)
        comp = cmp.compare(feats, history)
        comp["explanation"] = cmp.explain(comp)
        obs.comparison = comp
    if checkin_id:
        db.execute(delete(FacialObservation).where(FacialObservation.checkin_id == checkin_id))
    db.add(obs)
    db.flush()
    return obs
