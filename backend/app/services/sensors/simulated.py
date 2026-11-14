"""Simulated device adapters. Each one is clearly labeled simulated in every reading it produces."""

from __future__ import annotations

from app.services.sensors.base import CollectionContext, Reading, SensorAdapter, SensorFault
from app.services.sensors.catalog import DEVICES, METRICS
from app.services.sensors.profiles import SCENARIOS, metric_value


class _MetricSimulator(SensorAdapter):
    """Generates the device's metrics from the astronaut's deterministic physiology profile."""

    context = "resting"

    def __init__(self, device_id: str, acquisition_seconds: float) -> None:
        self.device_id = device_id
        self.source = f"simulated_{device_id}"
        self.acquisition_seconds = acquisition_seconds
        self.metrics = [m for m in DEVICES[device_id].measures if m in METRICS]

    def collect(self, ctx: CollectionContext) -> list[Reading]:
        if self.device_id in SCENARIOS.get(ctx.scenario, {}).get("faulty_devices", []):
            raise SensorFault(f"{DEVICES[self.device_id].label} did not respond (simulated fault)")
        out = []
        for metric in self.metrics:
            spec = METRICS[metric]
            val = metric_value(ctx.astronaut_id, metric, ctx.timestamp, ctx.period, ctx.scenario,
                               ctx.scenario_strength)
            out.append(Reading(
                astronaut_id=ctx.astronaut_id, metric=metric, value=round(val, spec.decimals), unit=spec.unit,
                timestamp=ctx.timestamp, source=self.source, device=self.device_id, context=self._context(metric),
            ))
        return out

    @staticmethod
    def _context(metric: str) -> str:
        return "sleep" if metric in {"resting_heart_rate", "hrv_rmssd"} else "daily" if metric in {
            "sleep_duration", "sleep_efficiency", "exercise_minutes"} else "resting"


def build_simulated_adapters() -> dict[str, SensorAdapter]:
    timings = {"wearable_sync": 1.6, "vitals_module": 3.2, "thermal_module": 1.8, "mass_module": 2.2}
    return {dev: _MetricSimulator(dev, secs) for dev, secs in timings.items()}
