"""Identity matching against enrolled SFace templates, plus a multi-frame confirmation tracker.

A single frame never authenticates anyone. The tracker requires several consecutive frames that
all match the same astronaut with high confidence, plus a weak liveness cue (natural micro-motion).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Astronaut, FacialEnrollment


@dataclass
class MatchResult:
    status: str  # match | unknown | ambiguous | no_enrollments
    astronaut_id: str | None = None
    similarity: float = 0.0
    runner_up_similarity: float = 0.0
    scores: dict[str, float] = field(default_factory=dict)


def embedding_to_bytes(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float32).tobytes()


def bytes_to_embedding(data: bytes) -> np.ndarray:
    return np.frombuffer(data, dtype=np.float32)


class TemplateStore:
    """Cached matrix of all enrolled templates; invalidated whenever enrollment changes."""

    def __init__(self) -> None:
        self._ids: list[str] | None = None
        self._matrix: np.ndarray | None = None

    def invalidate(self) -> None:
        self._ids = None
        self._matrix = None

    def load(self, db: Session) -> tuple[list[str], np.ndarray]:
        if self._ids is None:
            rows = db.execute(
                select(FacialEnrollment.astronaut_id, FacialEnrollment.embedding)
                .join(Astronaut)
                .where(Astronaut.face_enrolled.is_(True))
            ).all()
            self._ids = [r[0] for r in rows]
            self._matrix = (
                np.stack([bytes_to_embedding(r[1]) for r in rows]) if rows else np.zeros((0, 128), np.float32)
            )
        return self._ids, self._matrix  # type: ignore[return-value]


templates = TemplateStore()


def match_embedding(db: Session, emb: np.ndarray) -> MatchResult:
    ids, matrix = templates.load(db)
    if not ids:
        return MatchResult(status="no_enrollments")
    sims = matrix @ emb
    # Per-astronaut score = best template similarity (templates cover small pose changes).
    per: dict[str, float] = {}
    for aid, s in zip(ids, sims.tolist()):
        per[aid] = max(per.get(aid, -1.0), s)
    ranked = sorted(per.items(), key=lambda kv: kv[1], reverse=True)
    best_id, best = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else -1.0
    scores = {k: round(v, 3) for k, v in ranked[:5]}
    if best < settings.face_match_threshold:
        return MatchResult("unknown", None, best, second, scores)
    if second >= settings.face_match_threshold and best - second < settings.face_match_margin:
        return MatchResult("ambiguous", None, best, second, scores)
    return MatchResult("match", best_id, best, second, scores)


@dataclass
class _Track:
    astronaut_id: str
    hits: list[tuple[float, float, tuple[float, float]]] = field(default_factory=list)  # (t, sim, nose pos)


class RecognitionTracker:
    """Accumulates per-client frame matches until identity can be confirmed."""

    WINDOW_S = 6.0

    def __init__(self) -> None:
        self._tracks: dict[str, _Track] = {}

    def reset(self, client_id: str) -> None:
        self._tracks.pop(client_id, None)

    def update(
        self, client_id: str, astronaut_id: str, similarity: float, nose_norm: tuple[float, float]
    ) -> tuple[int, bool, bool]:
        """Returns (consecutive_hits, confirmed, liveness_ok)."""
        now = time.monotonic()
        track = self._tracks.get(client_id)
        if track is None or track.astronaut_id != astronaut_id:
            track = _Track(astronaut_id)
            self._tracks[client_id] = track
        track.hits = [h for h in track.hits if now - h[0] < self.WINDOW_S]
        track.hits.append((now, similarity, nose_norm))
        n = len(track.hits)
        liveness = self._liveness(track)
        confirmed = n >= settings.face_confirm_frames and liveness
        return n, confirmed, liveness

    @staticmethod
    def _liveness(track: _Track) -> bool:
        # A perfectly static image produces (near) identical keypoints frame after frame.
        # Live faces show small natural motion. This is a weak cue, documented as such.
        if len(track.hits) < 2:
            return False
        pts = np.array([h[2] for h in track.hits])
        motion = float(np.abs(np.diff(pts, axis=0)).max())
        return motion > 0.0015


tracker = RecognitionTracker()
