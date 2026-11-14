"""Experimental electronic-nose (VOC fingerprint) acquisition and change detection.

This tracks how an astronaut's skin volatile-organic-compound pattern changes relative to their own
history. It does NOT estimate hormones (cortisol, testosterone, ...) or diagnose anything.
"""

from __future__ import annotations

import asyncio
from datetime import datetime

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import VocMeasurement
from app.services.sensors import registry as sensor_registry
from app.services.sensors.base import CollectionContext
from app.services.sensors.catalog import VOC_CHANNELS
from app.services.sensors.profiles import environment_values, voc_vector

CHANNEL_LABELS = [
    "MOS-1 alcohols", "MOS-2 aldehydes", "MOS-3 ketones", "MOS-4 aromatics", "MOS-5 amines", "MOS-6 sulfur",
    "MOS-7 short-chain acids", "MOS-8 esters", "MOS-9 terpenes", "MOS-10 hydrocarbons", "MOS-11 ammonia",
    "MOS-12 isoprene", "MOS-13 acetone", "MOS-14 humidity-comp.", "MOS-15 general VOC", "MOS-16 reference",
]
MIN_HISTORY = 5
FLAG_Z = 3.5

INTERFERENCE = [
    "hygiene products or wipes used shortly before the scan",
    "recent exercise or sweating",
    "cabin air contaminants or humidity changes",
    "sensor drift (metal-oxide sensors age and need recalibration)",
    "food or drink consumed in the last hour",
]


async def acquire(ctx: CollectionContext) -> dict:
    if sensor_registry.SPEED > 0:
        await asyncio.sleep(3.0 * sensor_registry.SPEED)
    env = environment_values(ctx.timestamp, ctx.period, ctx.scenario)
    return {
        "channels": voc_vector(ctx.astronaut_id, ctx.timestamp, ctx.period, ctx.scenario, ctx.scenario_strength),
        "conditions": {"cabin_humidity": round(env["cabin_humidity"], 1), "cabin_temp": round(env["cabin_temp"], 1),
                       "sample_site": "forearm skin", "exposure_s": 60},
    }


def history(db: Session, astronaut_id: str, before: datetime | None = None, limit: int = 30) -> list[VocMeasurement]:
    stmt = select(VocMeasurement).where(VocMeasurement.astronaut_id == astronaut_id, VocMeasurement.valid.is_(True))
    if before is not None:
        stmt = stmt.where(VocMeasurement.timestamp < before)
    rows = list(db.scalars(stmt.order_by(VocMeasurement.timestamp.desc()).limit(limit * 2)))
    clean = [r for r in rows if not (r.analysis or {}).get("flagged")]
    return clean[:limit]


def analyze(current: list[float], hist: list[VocMeasurement]) -> dict:
    cur = np.array(current)
    if len(hist) < MIN_HISTORY:
        return {"status": "insufficient_history", "flagged": False, "n_history": len(hist),
                "message": f"Building your VOC baseline ({len(hist)}/{MIN_HISTORY} scans)."}
    H = np.array([h.channels for h in hist])
    med = np.median(H, axis=0)
    mad = 1.4826 * np.median(np.abs(H - med), axis=0)
    spread = np.maximum(mad, 0.02)
    z = (cur - med) / spread
    cos = float(np.dot(cur, med) / (np.linalg.norm(cur) * np.linalg.norm(med) + 1e-9))
    top = np.argsort(-np.abs(z))[:4]
    deviating = [
        {"channel": int(i), "label": CHANNEL_LABELS[i], "z": round(float(z[i]), 2),
         "current": round(float(cur[i]), 3), "baseline": round(float(med[i]), 3)}
        for i in top if abs(z[i]) >= FLAG_Z
    ]
    iso_score = None
    if len(hist) >= 10:
        iso = IsolationForest(n_estimators=100, contamination="auto", random_state=7).fit(H)
        iso_score = round(float(-iso.score_samples(cur.reshape(1, -1))[0]), 3)
    pca = PCA(n_components=2, random_state=7).fit(H)
    hist_2d = pca.transform(H)
    cur_2d = pca.transform(cur.reshape(1, -1))[0]
    flagged = len(deviating) >= 2 or (len(deviating) >= 1 and cos < 0.97)
    return {
        "status": "deviation" if flagged else "consistent",
        "flagged": flagged,
        "similarity": round(cos * 100, 1),
        "rms_z": round(float(np.sqrt(np.mean(z ** 2))), 2),
        "isolation_score": iso_score,
        "deviating_channels": deviating,
        "channel_z": [round(float(v), 2) for v in z],
        "baseline": [round(float(v), 4) for v in med],
        "n_history": len(hist),
        "pca": {"history": [[round(float(a), 4), round(float(b), 4)] for a, b in hist_2d],
                "current": [round(float(cur_2d[0]), 4), round(float(cur_2d[1]), 4)]},
        "possible_interference": INTERFERENCE,
        "experimental": True,
    }


def explain(analysis: dict) -> str:
    if analysis["status"] == "insufficient_history":
        return analysis["message"]
    if not analysis["flagged"]:
        return (f"Your VOC fingerprint is {analysis['similarity']}% similar to your usual pattern. "
                "No notable change. This is an experimental research measurement.")
    chans = ", ".join(d["label"].split(" ", 1)[1] for d in analysis["deviating_channels"][:3])
    return (f"Your current VOC fingerprint differs from your established baseline, mainly in the {chans} channels. "
            "Environmental contamination, hygiene products, physiological changes, or sensor variation may "
            "contribute. This experimental measurement cannot identify a cause; a repeat scan under standard "
            "conditions is recommended before treating it as a health concern.")
