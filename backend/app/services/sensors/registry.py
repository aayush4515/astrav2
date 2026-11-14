"""Sensor registry + standardized ingestion into SQLite."""

from __future__ import annotations

import asyncio
import os
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import EnvironmentReading, SensorReading
from app.models.base import KIND_REAL, KIND_SIMULATED
from app.services.sensors.base import CollectionContext, Reading, SensorAdapter, SensorFault
from app.services.sensors.catalog import ENVIRONMENT_METRICS
from app.services.sensors.profiles import environment_values
from app.services.sensors.simulated import build_simulated_adapters

# Scale simulated acquisition time (0 in tests, 1 for a realistic demo pace).
SPEED = float(os.environ.get("ASTRA_SENSOR_TIME_SCALE", "1"))


class SensorRegistry:
    def __init__(self) -> None:
        self._adapters: dict[str, SensorAdapter] = build_simulated_adapters()

    def register(self, adapter: SensorAdapter) -> None:
        """Plug in a real hardware adapter; it replaces the simulator for that device id."""
        self._adapters[adapter.device_id] = adapter

    def get(self, device_id: str) -> SensorAdapter:
        if device_id not in self._adapters:
            raise KeyError(device_id)
        return self._adapters[device_id]

    def status(self) -> list[dict]:
        return [vars(a.connect()) for a in self._adapters.values()]


registry = SensorRegistry()


async def acquire(device_id: str, ctx: CollectionContext) -> list[Reading]:
    adapter = registry.get(device_id)
    status = adapter.connect()
    if not status.connected:
        raise SensorFault(status.message)
    if SPEED > 0:
        await asyncio.sleep(adapter.acquisition_seconds * SPEED)
    readings = [adapter.validate(r) for r in adapter.collect(ctx)]
    adapter.disconnect()
    return readings


def persist_readings(db: Session, readings: list[Reading], checkin_id: str | None) -> list[SensorReading]:
    rows = []
    for r in readings:
        row = SensorReading(
            astronaut_id=r.astronaut_id, checkin_id=checkin_id, metric=r.metric, value=r.value, unit=r.unit,
            timestamp=r.timestamp, device=r.device, source=r.source,
            kind=KIND_SIMULATED if r.simulated else KIND_REAL, simulated=r.simulated, quality=r.quality,
            context=r.context, valid=r.valid,
        )
        db.add(row)
        rows.append(row)
    db.flush()
    return rows


def record_environment(db: Session, checkin_id: str | None, astronaut_id: str | None, ts: datetime, period: str,
                       scenario: str) -> list[EnvironmentReading]:
    rows = []
    for key, val in environment_values(ts, period, scenario).items():
        spec = ENVIRONMENT_METRICS[key]
        row = EnvironmentReading(checkin_id=checkin_id, astronaut_id=astronaut_id, metric=key,
                                 value=round(val, spec.decimals), unit=spec.unit, timestamp=ts,
                                 source="simulated_habitat_telemetry", simulated=True)
        db.add(row)
        rows.append(row)
    db.flush()
    return rows
