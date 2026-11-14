from datetime import timedelta

from app.models import Astronaut, CheckIn, SensorReading
from app.models.base import utcnow
from app.services.health import baselines as bl


def test_seed_is_synthetic_and_unenrolled(db):
    crew = db.query(Astronaut).all()
    assert len(crew) >= 4
    for a in crew:
        if a.synthetic_profile and a.id.startswith("AST-00"):
            assert a.face_enrolled is False
    assert db.query(SensorReading).filter(SensorReading.simulated.is_(False)).count() == 0
    assert db.query(CheckIn).filter_by(seeded=True).count() > 50


def test_baseline_robust_to_outliers(db):
    b = bl.compute(db, "AST-001", "resting_heart_rate", utcnow())
    assert b is not None and 45 < b.median < 60 and b.spread > 0


def test_gradual_change_trend_positive(db):
    b = bl.compute(db, "AST-002", "resting_heart_rate", utcnow() - timedelta(hours=1))
    assert b.trend_per_day is not None and b.trend_per_day > 0.5


def test_deterministic_simulation():
    from datetime import datetime

    from app.services.sensors.profiles import metric_value

    ts = datetime(2026, 11, 14, 8, 0)
    assert metric_value("AST-001", "heart_rate", ts, "morning", "normal", 1) == metric_value(
        "AST-001", "heart_rate", ts, "morning", "normal", 1)
