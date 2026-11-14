"""Hardware-agnostic sensor adapter contract.

Real devices and simulated devices implement the same interface, so swapping a simulated adapter
for a physical one (USB/BLE/serial driver) does not change the ingestion or analysis code.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime

from app.services.sensors.catalog import METRICS


@dataclass
class Reading:
    astronaut_id: str
    metric: str
    value: float
    unit: str
    timestamp: datetime
    source: str
    device: str
    quality: str = "good"
    simulated: bool = True
    context: str = "resting"
    valid: bool = True
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat() + "Z"
        return d


@dataclass
class CollectionContext:
    astronaut_id: str
    timestamp: datetime
    period: str  # morning | evening | adhoc
    scenario: str = "normal"
    scenario_strength: float = 1.0


@dataclass
class DeviceStatus:
    device: str
    connected: bool
    simulated: bool
    message: str = "ready"


class SensorFault(RuntimeError):
    """Raised when a device cannot produce a measurement (disconnected, timeout, self-test failure)."""


class SensorAdapter(ABC):
    device_id: str
    source: str
    simulated: bool = True
    acquisition_seconds: float = 1.5

    def connect(self) -> DeviceStatus:
        return DeviceStatus(self.device_id, True, self.simulated)

    @abstractmethod
    def collect(self, ctx: CollectionContext) -> list[Reading]: ...

    def validate(self, reading: Reading) -> Reading:
        spec = METRICS.get(reading.metric)
        plausible = PLAUSIBLE.get(reading.metric)
        if spec is None:
            reading.valid = False
            reading.notes.append("unknown metric")
        elif reading.unit != spec.unit:
            reading.valid = False
            reading.notes.append(f"unit {reading.unit} != {spec.unit}")
        elif plausible and not (plausible[0] <= reading.value <= plausible[1]):
            reading.valid = False
            reading.quality = "poor"
            reading.notes.append("physiologically implausible value; likely sensor artefact")
        return reading

    def disconnect(self) -> None:  # pragma: no cover - nothing to release for simulations
        return None


# Hard physiological plausibility limits used only to reject sensor artefacts.
PLAUSIBLE = {
    "heart_rate": (25, 230), "resting_heart_rate": (25, 150), "hrv_rmssd": (3, 250),
    "systolic_bp": (50, 260), "diastolic_bp": (25, 160), "spo2": (50, 100), "respiratory_rate": (4, 60),
    "body_temperature": (32, 43), "body_mass": (30, 200), "sleep_duration": (0, 16),
    "sleep_efficiency": (10, 100), "exercise_minutes": (0, 400),
}
