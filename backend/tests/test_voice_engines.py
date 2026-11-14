"""Offline speech round trip: Piper synthesizes an answer, faster-whisper transcribes it, the parser understands it."""

import io
import wave

import numpy as np
import pytest

from app.services.voice.parsing import parse_rating, parse_yes_no
from app.services.voice.intents import route
from app.services.voice.stt import stt
from app.services.voice.tts import tts


def _engines_ready() -> bool:
    try:
        tts.load()
        stt.load()
    except Exception:
        return False
    return tts.status()["ready"] and stt.status()["ready"]


pytestmark = pytest.mark.skipif(not _engines_ready(), reason="speech models/packages not installed")


def _to_16k(wav_bytes: bytes) -> bytes:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        sr = w.getframerate()
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    n = int(len(pcm) * 16000 / sr)
    res = np.interp(np.linspace(0, len(pcm) - 1, n), np.arange(len(pcm)), pcm).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(res.tobytes())
    return buf.getvalue()


@pytest.mark.parametrize("spoken,check", [
    ("I'd say about seven.", lambda t: parse_rating(t) == 7),
    ("Yes, a little.", lambda t: parse_yes_no(t) == "yes"),
    ("I need medical help.", lambda t: route(t).name == "emergency"),
    ("Show my heart rate history.", lambda t: route(t).name == "open_details"),
    ("End check-in.", lambda t: route(t).name == "end_checkin"),
])
def test_tts_stt_round_trip(spoken, check):
    wav = tts.synthesize(spoken)
    assert wav[:4] == b"RIFF"
    out = stt.transcribe(_to_16k(wav))
    assert check(out["text"]), out


def test_silence_returns_empty():
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((np.random.RandomState(0).randn(16000) * 30).astype(np.int16).tobytes())
    assert stt.transcribe(buf.getvalue())["text"] == ""


def test_api_endpoints(client):
    r = client.post("/api/voice/synthesize", json={"text": "Your assessment is complete."})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    t = client.post("/api/voice/transcribe", content=_to_16k(r.content), headers={"Content-Type": "audio/wav"})
    assert t.status_code == 200 and "assessment" in t.json()["text"].lower()
