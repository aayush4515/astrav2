import os
import tempfile

# Configure before the app is imported: isolated DB, instant simulated sensors.
_tmp = tempfile.mkdtemp(prefix="astra-test-")
os.environ["ASTRA_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["ASTRA_SENSOR_TIME_SCALE"] = "0"
os.environ["ASTRA_OPERATOR_PIN"] = "1234"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import session as dbs  # noqa: E402
from app.seed import seed as seed_mod  # noqa: E402


@pytest.fixture(scope="session")
def seeded():
    seed_mod.reset_database()
    db = dbs.SessionLocal()
    seed_mod.seed(db, days=16)
    db.close()
    return True


@pytest.fixture(scope="session")
def client(seeded):
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def db(seeded):
    s = dbs.SessionLocal()
    yield s
    s.close()


@pytest.fixture(scope="session")
def operator(client):
    r = client.post("/api/auth/operator", json={"pin": "1234"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def astronaut_headers(client, operator, astronaut_id: str) -> dict:
    """Recovery sessions stand in for face authentication in API tests (face matching is tested separately)."""
    r = client.post("/api/auth/recovery", json={"astronaut_id": astronaut_id, "reason": "automated test"}, headers=operator)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
