"""ASTRA backend entry point: `uvicorn app.main:app --port 8000`."""

from __future__ import annotations

import asyncio
import logging
import threading
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import checkins, emergency, identity, mission_control, voice
from app.config import settings
from app.database import session as dbs
from app.models import Astronaut
from app.models.base import utcnow
from app.seed.seed import init_db
from app.services.communications.queue import get_link, run_link_simulator
from app.services.facial.landmarks import engine as landmark_engine
from app.services.health.views import environment_latest
from app.services.identity.face_engine import engine as face_engine
from app.services.voice.stt import stt
from app.services.voice.tts import tts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    # Warm up local models in the background so the first check-in is responsive.
    threading.Thread(target=lambda: (stt.load(), tts.load(), face_engine.available, landmark_engine.available),
                     daemon=True).start()
    stop = asyncio.Event()
    task = asyncio.create_task(run_link_simulator(stop))
    yield
    stop.set()
    await task


app = FastAPI(title="ASTRA — Autonomous Space Telehealth & Risk Assessment", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (identity.router, checkins.router, voice.router, emergency.router, mission_control.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    start = date.fromisoformat(settings.mission_start)
    db = dbs.SessionLocal()
    try:
        link = get_link(db)
        env = environment_latest(db)
        crew = db.query(Astronaut).count()
        enrolled = db.query(Astronaut).filter(Astronaut.face_enrolled.is_(True)).count()
    finally:
        db.close()
    return {
        "comm_link": link,
        "environment": env,
        "crew": {"total": crew, "face_enrolled": enrolled},
        "status": "ok",
        "mission": {"name": settings.mission_name, "day": (utcnow().date() - start).days + 1},
        "engines": {
            "face": {"ready": face_engine.available, "error": face_engine.error, "engine": "OpenCV YuNet + SFace"},
            "landmarks": {"ready": landmark_engine.available, "error": landmark_engine.error,
                          "engine": "MediaPipe Face Landmarker"},
            "stt": stt.status(),
            "tts": tts.status(),
        },
        "offline": True,
    }
