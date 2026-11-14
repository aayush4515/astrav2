import base64

import cv2
import numpy as np

from app.models import Astronaut, FacialEnrollment
from app.services.identity import matcher
from app.services.identity.matcher import embedding_to_bytes, match_embedding, templates


def _unit(v):
    v = np.asarray(v, dtype=np.float32)
    return v / np.linalg.norm(v)


def test_matching_threshold_and_margin(db):
    rng = np.random.RandomState(0)
    a, b = _unit(rng.randn(128)), _unit(rng.randn(128))
    for aid, emb in (("AST-001", a), ("AST-002", b)):
        db.add(FacialEnrollment(astronaut_id=aid, embedding=embedding_to_bytes(emb), model="test", quality=1.0))
        db.get(Astronaut, aid).face_enrolled = True
    db.commit()
    templates.invalidate()
    try:
        # Same person with noise -> match
        r = match_embedding(db, _unit(a + 0.25 * _unit(rng.randn(128))))
        assert r.status == "match" and r.astronaut_id == "AST-001"
        # Random stranger -> unknown (never guesses an identity)
        assert match_embedding(db, _unit(rng.randn(128))).status == "unknown"
        # Halfway between two enrolled astronauts -> ambiguous
        assert match_embedding(db, _unit(a + b)).status == "ambiguous"
    finally:
        db.query(FacialEnrollment).delete()
        for aid in ("AST-001", "AST-002"):
            db.get(Astronaut, aid).face_enrolled = False
        db.commit()
        templates.invalidate()


def test_tracker_requires_consecutive_frames_and_motion():
    t = matcher.RecognitionTracker()
    # A perfectly static "photo" never confirms.
    for _ in range(5):
        _, confirmed, live = t.update("c1", "AST-001", 0.8, (0.5, 0.5))
    assert not confirmed and not live
    t.reset("c2")
    results = [t.update("c2", "AST-001", 0.8, (0.5 + i * 0.004, 0.5)) for i in range(3)]
    assert results[-1][1] is True
    # Switching identity restarts the count.
    n, confirmed, _ = t.update("c2", "AST-002", 0.8, (0.6, 0.5))
    assert n == 1 and not confirmed


def _blank_jpeg() -> str:
    img = np.full((480, 640, 3), 40, np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def test_face_endpoint_no_face(client):
    r = client.post("/api/auth/face", json={"image": _blank_jpeg(), "client_id": "t"})
    if r.status_code == 503:  # models not downloaded in this environment
        return
    assert r.status_code == 200
    assert r.json()["status"] == "no_face"
    assert "session" not in r.json()


def test_enrollment_requires_ticket_and_operator_for_reenroll(client, operator, db):
    assert client.post("/api/enrollment/frame", json={"ticket": "bogus", "image": _blank_jpeg()}).status_code == 403
    a = db.get(Astronaut, "AST-004")
    a.face_enrolled = True
    db.commit()
    try:
        assert client.post("/api/enrollment/start", json={"astronaut_id": "AST-004"}).status_code == 403
        assert client.post("/api/enrollment/start", json={"astronaut_id": "AST-004"}, headers=operator).status_code == 200
    finally:
        a.face_enrolled = False
        db.commit()
