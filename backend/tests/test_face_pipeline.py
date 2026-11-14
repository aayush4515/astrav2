"""End-to-end biometric tests on real (public-domain NASA portrait) faces: enroll → recognize → reject."""

import base64
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.models import Astronaut
from app.services.identity.face_engine import engine
from app.services.identity.matcher import templates

FIX = Path(__file__).parent / "fixtures" / "faces"
pytestmark = pytest.mark.skipif(not engine.available, reason="face models not downloaded")


def _jpeg(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def _frames(name: str, n: int) -> list[str]:
    """Simulate consecutive webcam frames: small shifts/scales give natural micro-motion."""
    base = cv2.imread(str(FIX / f"{name}.jpg"))
    h, w = base.shape[:2]
    out = []
    for i in range(n):
        m = np.float32([[1 + 0.01 * (i % 3), 0, 3 * i - 6], [0, 1 + 0.01 * (i % 3), 2 * (i % 4) - 3]])
        out.append(_jpeg(cv2.warpAffine(base, m, (w, h), borderMode=cv2.BORDER_REPLICATE)))
    return out


@pytest.fixture
def enrolled_kutryk(client, db):
    r = client.post("/api/astronauts", json={"full_name": "Test Pilot", "preferred_name": "Josh", "role": "Pilot",
                                              "crew_id": "TST-101"})
    assert r.status_code == 201, r.text
    ticket = r.json()["enrollment_ticket"]
    statuses = [client.post("/api/enrollment/frame", json={"ticket": ticket, "image": f}).json() for f in _frames("kutryk_a", 6)]
    assert statuses[-1]["status"] == "complete", statuses
    fin = client.post("/api/enrollment/finalize", json={"ticket": ticket}).json()
    assert fin["enrolled"] is True and fin["templates"] == 7
    yield "TST-101"
    a = db.get(Astronaut, "TST-101")
    db.delete(a)
    db.commit()
    templates.invalidate()


def _recognize(client, name: str, n: int = 4, client_id: str = "pytest") -> list[dict]:
    return [client.post("/api/auth/face", json={"image": f, "client_id": client_id}).json() for f in _frames(name, n)]


def test_returning_astronaut_recognized_from_different_photo(client, enrolled_kutryk):
    results = _recognize(client, "kutryk_b", 4, "c-same")
    assert results[0]["status"] == "matching"  # never on a single frame
    confirmed = [r for r in results if r["status"] == "confirmed"]
    assert confirmed, results
    assert confirmed[0]["session"]["astronaut_id"] == enrolled_kutryk
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {confirmed[0]['session']['token']}"}).json()
    assert me["method"] == "face" and me["astronaut"]["id"] == enrolled_kutryk


def test_unknown_person_is_rejected(client, enrolled_kutryk):
    for r in _recognize(client, "gerst_b", 4, "c-other"):
        assert r["status"] == "unknown"
        assert "session" not in r


def test_static_photo_does_not_authenticate(client, enrolled_kutryk):
    still = _frames("kutryk_b", 1)[0]
    for _ in range(5):
        r = client.post("/api/auth/face", json={"image": still, "client_id": "c-static"}).json()
        assert r["status"] != "confirmed"


def test_cannot_enroll_face_already_owned_by_someone_else(client, enrolled_kutryk):
    r = client.post("/api/astronauts", json={"full_name": "Impostor", "preferred_name": "Imp", "role": "x" * 3,
                                              "crew_id": "TST-102"})
    ticket = r.json()["enrollment_ticket"]
    res = client.post("/api/enrollment/frame", json={"ticket": ticket, "image": _frames("kutryk_b", 1)[0]}).json()
    assert res["status"] == "already_enrolled"


def test_facial_scan_gates_expression_and_streams_landmarks(client, operator, enrolled_kutryk):
    """Official portraits smile, so the geometry scan must refuse them (expression distorts geometry)."""
    from app.services.facial.landmarks import engine as lm_engine

    if not lm_engine.available:
        pytest.skip("MediaPipe not installed")
    tok = client.post("/api/auth/recovery", json={"astronaut_id": enrolled_kutryk, "reason": "scan test"},
                      headers=operator).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    cid = client.post("/api/checkins", headers=h).json()["checkin"]["id"]
    for f in _frames("kutryk_b", 3):
        r = client.post(f"/api/checkins/{cid}/facial/frame", headers=h, json={"image": f}).json()
        assert len(r["landmarks"]) > 50
        assert r["accepted"] is False and "smiling" in r["issues"]
        assert r["guidance"] == "Please keep a neutral, relaxed expression."
    client.post(f"/api/checkins/{cid}/cancel", headers=h, json={"reason": "test"})


def test_geometry_features_are_stable_for_same_person():
    from app.services.facial.features import extract_features
    from app.services.facial.landmarks import engine as lm_engine

    if not lm_engine.available:
        pytest.skip("MediaPipe not installed")
    fa, fb = (extract_features(lm_engine.detect(cv2.imread(str(FIX / f"kutryk_{x}.jpg")))[0]) for x in "ab")
    assert abs(fa["eye_opening_asymmetry"] - fb["eye_opening_asymmetry"]) < 2.0
    assert abs(fa["facial_width_index"] - fb["facial_width_index"]) < 0.04
