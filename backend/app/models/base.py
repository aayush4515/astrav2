from __future__ import annotations

import uuid
from datetime import datetime, timezone


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite has no timezone type; everything is stored as UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Provenance categories. Every stored value is tagged with exactly one of these so that
# synthetic, measured, reported and computed data are never silently mixed.
KIND_REAL = "real_sensor"
KIND_SIMULATED = "simulated"
KIND_USER_REPORTED = "user_reported"
KIND_COMPUTED = "computed"
KIND_EXPERIMENTAL = "experimental"
