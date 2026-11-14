"""Delay-tolerant, store-and-forward message queue simulating the spacecraft ↔ Earth link.

States: created → queued → in_transit → delivered → acknowledged.
If the link drops while a message is in transit it returns to `queued` and is retransmitted.
Everything is persisted in SQLite, so queued reports survive a restart.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import session as dbs
from app.models import CommunicationMessage, SystemSetting
from app.models.base import utcnow

log = logging.getLogger("astra.comms")
PRIORITY_ORDER = {"critical": 0, "high": 1, "routine": 2}


def get_link(db: Session) -> dict:
    row = db.get(SystemSetting, "comm_link")
    if row is None:
        return {"link_up": True, "delay_s": settings.default_comm_delay_s}
    return json.loads(row.value)


def set_link(db: Session, link_up: bool | None = None, delay_s: float | None = None) -> dict:
    link = get_link(db)
    if link_up is not None:
        link["link_up"] = link_up
    if delay_s is not None:
        link["delay_s"] = max(0.0, min(1800.0, float(delay_s)))
    row = db.get(SystemSetting, "comm_link")
    if row is None:
        db.add(SystemSetting(key="comm_link", value=json.dumps(link)))
    else:
        row.value = json.dumps(link)
    db.commit()
    tick(db)
    return link


def enqueue(db: Session, *, kind: str, subject: str, payload: dict, astronaut_id: str | None = None,
            priority: str = "routine", related_id: str | None = None) -> CommunicationMessage:
    now = utcnow()
    msg = CommunicationMessage(kind=kind, subject=subject, payload=payload, astronaut_id=astronaut_id,
                               priority=priority, related_id=related_id, status="queued", created_at=now, queued_at=now)
    db.add(msg)
    db.flush()
    return msg


def tick(db: Session) -> int:
    """Advance message states according to the current link status. Returns number of changes."""
    link = get_link(db)
    now = utcnow()
    changed = 0
    active = db.scalars(select(CommunicationMessage).where(CommunicationMessage.status.in_(["queued", "in_transit"])))
    for msg in sorted(active, key=lambda m: (PRIORITY_ORDER.get(m.priority, 9), m.created_at)):
        if msg.status == "in_transit":
            if not link["link_up"]:
                msg.status = "queued"  # lost in transit; will be retransmitted
                msg.sent_at = None
                changed += 1
            elif msg.sent_at and now >= msg.sent_at + timedelta(seconds=link["delay_s"]):
                msg.status = "delivered"
                msg.delivered_at = now
                changed += 1
        elif msg.status == "queued" and link["link_up"]:
            msg.status = "in_transit"
            msg.sent_at = now
            msg.attempts += 1
            changed += 1
    if changed:
        db.commit()
    return changed


def acknowledge(db: Session, msg: CommunicationMessage, by: str) -> CommunicationMessage:
    if msg.status != "delivered":
        raise ValueError("Only delivered messages can be acknowledged")
    msg.status = "acknowledged"
    msg.acknowledged_at = utcnow()
    msg.acknowledged_by = by
    db.commit()
    return msg


def to_dict(m: CommunicationMessage, include_payload: bool = False) -> dict:
    d = {
        "id": m.id, "kind": m.kind, "priority": m.priority, "astronaut_id": m.astronaut_id, "subject": m.subject,
        "status": m.status, "attempts": m.attempts, "related_id": m.related_id,
        **{k: (getattr(m, k).isoformat() + "Z" if getattr(m, k) else None)
           for k in ("created_at", "queued_at", "sent_at", "delivered_at", "acknowledged_at")},
        "acknowledged_by": m.acknowledged_by,
    }
    if include_payload:
        d["payload"] = m.payload
    return d


async def run_link_simulator(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            db = dbs.SessionLocal()
            try:
                tick(db)
            finally:
                db.close()
        except Exception as exc:  # pragma: no cover - keep the loop alive
            log.warning("comm tick failed: %s", exc)
        try:
            await asyncio.wait_for(stop.wait(), timeout=1.0)
        except asyncio.TimeoutError:
            pass
