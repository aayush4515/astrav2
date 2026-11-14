"""Local text-to-speech with Piper (ONNX voice model). Returns 16-bit PCM WAV bytes."""

from __future__ import annotations

import hashlib
import io
import logging
import threading
import wave
from collections import OrderedDict

from app.config import settings

log = logging.getLogger("astra.tts")


class TextToSpeech:
    def __init__(self) -> None:
        self._voice = None
        self._lock = threading.Lock()
        self._error: str | None = None
        self._cache: OrderedDict[str, bytes] = OrderedDict()

    def load(self) -> None:
        if self._voice is not None or self._error:
            return
        model = settings.piper_dir / f"{settings.tts_voice}.onnx"
        if not model.exists():
            self._error = f"Piper voice not found at {model}"
            return
        try:
            from piper import PiperVoice

            self._voice = PiperVoice.load(str(model))
            log.info("TTS voice loaded: %s", model.name)
        except Exception as exc:  # pragma: no cover - depends on local install
            self._error = f"TTS unavailable: {exc}"
            log.warning(self._error)

    def status(self) -> dict:
        return {"ready": self._voice is not None, "error": self._error, "engine": "piper", "voice": settings.tts_voice}

    def synthesize(self, text: str) -> bytes:
        key = hashlib.sha1(text.encode()).hexdigest()
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        with self._lock:
            self.load()
            if self._voice is None:
                raise RuntimeError(self._error or "TTS not loaded")
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wf:
                if hasattr(self._voice, "synthesize_wav"):  # piper-tts >= 1.3
                    self._voice.synthesize_wav(text, wf)
                else:  # piper-tts 1.2
                    self._voice.synthesize(text, wf)
            data = buf.getvalue()
        self._cache[key] = data
        if len(self._cache) > 200:
            self._cache.popitem(last=False)
        return data


tts = TextToSpeech()
