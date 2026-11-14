"""Local speech endpoints: transcription, synthesis, intent routing and spoken Q&A."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Astronaut, VoiceInteraction
from app.schemas.common import SpeakIn, TextIn
from app.services.identity.sessions import require_astronaut
from app.services.voice import assistant
from app.services.voice.intents import route
from app.services.voice.stt import stt
from app.services.voice.tts import tts

router = APIRouter(prefix="/api/voice")


@router.get("/status")
def status():
    return {"stt": stt.status(), "tts": tts.status()}


@router.post("/transcribe")
async def transcribe(request: Request):
    """Body: 16-bit PCM WAV (audio/wav). Returns text + confidence. Audio is never stored."""
    data = await request.body()
    if not data or len(data) > 10_000_000:
        raise HTTPException(422, "Expected a WAV body under 10 MB")
    try:
        return await asyncio.to_thread(stt.transcribe, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/synthesize")
async def synthesize(body: SpeakIn):
    try:
        wav = await asyncio.to_thread(tts.synthesize, body.text)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    return Response(content=wav, media_type="audio/wav", headers={"Cache-Control": "max-age=3600"})


@router.post("/interpret")
def interpret(body: TextIn):
    return route(body.text, body.context).to_dict()


@router.post("/ask")
def ask(body: TextIn, astro: Astronaut = Depends(require_astronaut), db: Session = Depends(get_db)):
    """Route a spoken command and answer it from stored, validated state."""
    intent = route(body.text, body.context)
    db.add(VoiceInteraction(astronaut_id=astro.id, checkin_id=body.checkin_id, intent=intent.name,
                            params=intent.params, transcript=body.text[:300]))
    db.commit()
    passthrough = {"emergency", "end_checkin", "cancel", "repeat", "go_back", "continue", "start_checkin", "home",
                   "affirm", "deny", "defer", "unknown", "none"}
    if intent.name in passthrough:
        return {**intent.to_dict(), "speech": None, "ui": None}
    resp = assistant.respond(db, astro, intent, body.checkin_id)
    return {**intent.to_dict(), "speech": resp.get("speech"), "ui": resp.get("ui")}
