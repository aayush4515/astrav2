"""Per-astronaut robust baselines and trends computed from stored readings."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import PersonalBaseline, SensorReading
from app.services.sensors.profiles import _POPULATION

WINDOW_DAYS = 21
MIN_POINTS = 6


@dataclass
class Baseline:
    metric: str
    context: str
    median: float
    spread: float  # robust SD (1.4826 × MAD, floored)
    n: int
    trend_per_day: float | None
    recent: list[tuple[datetime, float]]

    def z(self, value: float) -> float:
        return (value - self.median) / self.spread


def _theil_sen(ts: list[datetime], vals: list[float]) -> float | None:
    if len(vals) < 4:
        return None
    t0 = ts[0]
    x = np.array([(t - t0).total_seconds() / 86400 for t in ts])
    y = np.array(vals)
    slopes = [(y[j] - y[i]) / (x[j] - x[i]) for i in range(len(x)) for j in range(i + 1, len(x)) if x[j] - x[i] > 0.2]
    return float(np.median(slopes)) if slopes else None


def compute(db: Session, astronaut_id: str, metric: str, before: datetime, context: str | None = None) -> Baseline | None:
    stmt = (
        select(SensorReading.timestamp, SensorReading.value)
        .where(
            SensorReading.astronaut_id == astronaut_id,
            SensorReading.metric == metric,
            SensorReading.valid.is_(True),
            SensorReading.timestamp < before,
            SensorReading.timestamp >= before - timedelta(days=WINDOW_DAYS),
        )
        .order_by(SensorReading.timestamp)
    )
    if context:
        stmt = stmt.where(SensorReading.context == context)
    rows = db.execute(stmt).all()
    if len(rows) < MIN_POINTS:
        return None
    ts = [r[0] for r in rows]
    vals = np.array([r[1] for r in rows], dtype=float)
    floor = _POPULATION.get(metric, (0, 1))[1] * 0.5
    med = float(np.median(vals))
    spread = max(float(1.4826 * np.median(np.abs(vals - med))), floor)
    # Outlier trimming: previously abnormal values must not become the new normal.
    keep = np.abs(vals - med) / spread <= 3.5
    if keep.sum() >= MIN_POINTS:
        vals_k = vals[keep]
        med = float(np.median(vals_k))
        spread = max(float(1.4826 * np.median(np.abs(vals_k - med))), floor)
    recent_cut = before - timedelta(days=7)
    recent = [(t, float(v)) for t, v in zip(ts, vals) if t >= recent_cut]
    trend = _theil_sen([t for t, _ in recent], [v for _, v in recent])
    return Baseline(metric, context or "any", med, spread, int(len(vals)), trend, recent)


def store(db: Session, astronaut_id: str, baselines: list[Baseline]) -> None:
    """Keep only the latest computed baseline per metric (history is reproducible from readings)."""
    if not baselines:
        return
    db.execute(delete(PersonalBaseline).where(PersonalBaseline.astronaut_id == astronaut_id,
                                              PersonalBaseline.metric.in_([b.metric for b in baselines])))
    for b in baselines:
        db.add(PersonalBaseline(astronaut_id=astronaut_id, metric=b.metric, context=b.context, median=b.median,
                                mad=b.spread, n=b.n, trend_per_day=b.trend_per_day, window_days=WINDOW_DAYS))
