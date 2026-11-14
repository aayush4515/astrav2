"""Compare a facial observation with the astronaut's own valid reference history."""

from __future__ import annotations

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FacialObservation
from app.services.facial.features import FEATURES

MIN_REFERENCE_OBSERVATIONS = 1  # the enrollment reference counts as one
HISTORY_LIMIT = 12
FLAG_Z = 3.0


def reference_history(db: Session, astronaut_id: str, exclude_id: str | None = None) -> list[FacialObservation]:
    stmt = (
        select(FacialObservation)
        .where(FacialObservation.astronaut_id == astronaut_id, FacialObservation.valid.is_(True))
        .order_by(FacialObservation.timestamp.desc())
    )
    rows = [r for r in db.scalars(stmt) if r.id != exclude_id]
    # Earlier flagged observations are not folded into the reference ("don't learn the anomaly").
    clean = [r for r in rows if r.is_reference or not (r.comparison or {}).get("flagged")]
    return clean[:HISTORY_LIMIT]


def compare(features: dict[str, float], history: list[FacialObservation]) -> dict:
    if len(history) < MIN_REFERENCE_OBSERVATIONS:
        return {
            "status": "insufficient_history",
            "message": "Not enough reference scans yet. This scan will become part of your reference.",
            "features": {},
            "flagged": [],
        }
    out: dict[str, dict] = {}
    flagged: list[str] = []
    for key, spec in FEATURES.items():
        hist_vals = np.array([h.features[key] for h in history if key in h.features])
        if hist_vals.size == 0 or key not in features:
            continue
        ref = float(np.median(hist_vals))
        hist_spread = float(1.4826 * np.median(np.abs(hist_vals - ref))) if hist_vals.size >= 3 else 0.0
        within = float(np.median([h.feature_spread.get(key, 0.0) for h in history]))
        spread = max(hist_spread, within, spec.noise_floor)
        delta = features[key] - ref
        z = delta / spread
        is_flag = abs(z) >= FLAG_Z and abs(delta) >= spec.min_change
        if is_flag:
            flagged.append(key)
        out[key] = {
            "label": spec.label,
            "unit": spec.unit,
            "current": round(features[key], 4),
            "reference": round(ref, 4),
            "delta": round(delta, 4),
            "z": round(z, 2),
            "flagged": is_flag,
            "n_reference": int(hist_vals.size),
        }
    return {
        "status": "changed" if flagged else "consistent",
        "flagged": flagged,
        "features": out,
        "n_reference": len(history),
    }


def explain(comparison: dict) -> str:
    if comparison.get("status") == "insufficient_history":
        return comparison["message"]
    if not comparison.get("flagged"):
        return "Your facial geometry is consistent with your reference scans."
    parts = []
    for key in comparison["flagged"]:
        f = comparison["features"][key]
        direction = "higher" if f["delta"] > 0 else "lower"
        parts.append(f"{f['label'].lower()} is {direction} than your reference")
    return (
        "Compared with your reference scans, " + "; ".join(parts) + ". "
        "This could be caused by camera position, lighting, facial expression, or a real physical change. "
        "Repeat the scan under consistent conditions; if it persists, mention it to the crew medical officer."
    )
