"""Offline speech-to-text with faster-whisper (CTranslate2), loaded from a local model directory.

The browser records microphone audio, trims it with voice-activity detection and uploads 16 kHz mono
WAV. No cloud service is involved.
"""

from __future__ import annotations

import io
import logging
import threading
import time
import wave

import numpy as np

from app.config import settings

log = logging.getLogger("astra.stt")

BIAS_PROMPT = (
    "ASTRA health check-in. Yes. No. About seven out of ten. I feel good. Headache, dizziness. "
    "Emergency. Repeat that. Explain. Show details. End check-in. Blood test. Not now. Remind me later."
)


class SpeechToText:
    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._error: str | None = None
        self._loading = False

    def _model_path(self) -> str:
        local = settings.stt_dir / f"faster-whisper-{settings.stt_model}"
        return str(local) if local.exists() else settings.stt_model

    def load(self) -> None:
        with self._lock:
            if self._model is not None or self._loading:
                return
            self._loading = True
        try:
            from faster_whisper import WhisperModel

            path = self._model_path()
            compute = "int8" if settings.stt_device == "cpu" else "float16"
            model = WhisperModel(path, device=settings.stt_device, compute_type=compute,
                                 download_root=str(settings.stt_dir), cpu_threads=4)
            with self._lock:
                self._model = model
            log.info("STT model loaded: %s", path)
        except Exception as exc:  # pragma: no cover - depends on local install
            self._error = f"STT unavailable: {exc}"
            log.warning(self._error)
        finally:
            self._loading = False

    def status(self) -> dict:
        return {"ready": self._model is not None, "loading": self._loading, "error": self._error,
                "engine": "faster-whisper", "model": settings.stt_model}

    def transcribe(self, wav_bytes: bytes) -> dict:
        if self._model is None:
            self.load()
        if self._model is None:
            raise RuntimeError(self._error or "STT model not loaded")
        audio = decode_wav(wav_bytes)
        duration = len(audio) / 16000
        if duration < 0.25:
            return {"text": "", "confidence": 0.0, "duration": duration, "elapsed": 0.0}
        t0 = time.perf_counter()
        with self._lock:
            segments, _info = self._model.transcribe(
                audio, language="en", beam_size=3, vad_filter=True, initial_prompt=BIAS_PROMPT,
                condition_on_previous_text=False, temperature=0.0, no_speech_threshold=0.6,
            )
            segs = list(segments)
        text = " ".join(s.text.strip() for s in segs).strip()
        if text.lower().strip(" .") in HALLUCINATIONS:
            text = ""
        conf = float(np.exp(np.mean([s.avg_logprob for s in segs]))) if segs else 0.0
        return {"text": text, "confidence": round(conf, 3), "duration": round(duration, 2),
                "elapsed": round(time.perf_counter() - t0, 2)}


# Whisper occasionally "hears" these in silence/noise.
HALLUCINATIONS = {"you", "thank you", "thanks for watching", "thank you for watching", "bye", ""}


def decode_wav(data: bytes) -> np.ndarray:
    with wave.open(io.BytesIO(data), "rb") as w:
        sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width != 2:
        raise ValueError("Expected 16-bit PCM WAV")
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        audio = audio.reshape(-1, ch).mean(axis=1)
    if sr != 16000:
        n = int(len(audio) * 16000 / sr)
        audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)
    return audio


stt = SpeechToText()
