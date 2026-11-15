"""Local text-to-speech. Returns 16-bit PCM mono WAV bytes.

Engines, tried in order:
  1. Kokoro (82M-parameter ONNX model, int8): natural prosody, preferred.
  2. Piper (VITS ONNX voice): lighter fallback, tuned slightly faster and more expressive.
Both run fully offline from files in model_weights/.
"""

from __future__ import annotations

import hashlib
import io
import logging
import threading
import wave
from collections import OrderedDict

import numpy as np

from app.config import settings

log = logging.getLogger("astra.tts")

KOKORO_MODEL = "kokoro-v1.0.int8.onnx"
KOKORO_VOICES = "voices-v1.0.bin"


def _wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


class _Kokoro:
    name = "kokoro"

    def __init__(self) -> None:
        model = settings.kokoro_dir / KOKORO_MODEL
        voices = settings.kokoro_dir / KOKORO_VOICES
        if not model.exists() or not voices.exists():
            raise FileNotFoundError(f"Kokoro files missing in {settings.kokoro_dir}")
        from kokoro_onnx import Kokoro

        self._k = Kokoro(str(model), str(voices))
        self.voice = settings.kokoro_voice

    def synthesize(self, text: str) -> bytes:
        samples, sr = self._k.create(text, voice=self.voice, speed=settings.tts_speed, lang="en-us")
        return _wav_bytes(np.asarray(samples, dtype=np.float32), sr)


class _Piper:
    name = "piper"

    def __init__(self) -> None:
        model = settings.piper_dir / f"{settings.tts_voice}.onnx"
        if not model.exists():
            raise FileNotFoundError(f"Piper voice not found at {model}")
        from piper import PiperVoice

        self._v = PiperVoice.load(str(model))
        self.voice = settings.tts_voice
        self._cfg = None
        try:  # piper-tts >= 1.3: shorter length_scale = faster; more noise = livelier prosody
            from piper import SynthesisConfig

            self._cfg = SynthesisConfig(length_scale=1 / settings.tts_speed, noise_scale=0.667, noise_w_scale=0.8)
        except ImportError:  # pragma: no cover - older piper
            pass

    def synthesize(self, text: str) -> bytes:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            if hasattr(self._v, "synthesize_wav"):
                self._v.synthesize_wav(text, wf, syn_config=self._cfg)
            else:  # pragma: no cover - piper-tts 1.2
                self._v.synthesize(text, wf)
        return buf.getvalue()


class TextToSpeech:
    def __init__(self) -> None:
        self._engine: _Kokoro | _Piper | None = None
        self._lock = threading.Lock()
        self._error: str | None = None
        self._cache: OrderedDict[str, bytes] = OrderedDict()

    def load(self) -> None:
        if self._engine is not None or self._error:
            return
        order = [_Kokoro, _Piper] if settings.tts_engine == "kokoro" else [_Piper, _Kokoro]
        errors = []
        for cls in order:
            try:
                self._engine = cls()
                log.info("TTS engine loaded: %s (%s)", cls.name, self._engine.voice)
                return
            except Exception as exc:  # pragma: no cover - depends on local install
                errors.append(f"{cls.name}: {exc}")
                log.warning("TTS engine %s unavailable: %s", cls.name, exc)
        self._error = "TTS unavailable — " + "; ".join(errors)

    def status(self) -> dict:
        e = self._engine
        return {"ready": e is not None, "error": self._error, "engine": e.name if e else settings.tts_engine,
                "voice": e.voice if e else None, "speed": settings.tts_speed}

    def synthesize(self, text: str) -> bytes:
        key = hashlib.sha1(text.encode()).hexdigest()
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        with self._lock:
            self.load()
            if self._engine is None:
                raise RuntimeError(self._error or "TTS not loaded")
            data = self._engine.synthesize(text)
        self._cache[key] = data
        if len(self._cache) > 200:
            self._cache.popitem(last=False)
        return data


tts = TextToSpeech()
