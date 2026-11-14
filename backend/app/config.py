"""Central configuration. Every value can be overridden with an ASTRA_* environment variable."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


def _env(name: str, default: str) -> str:
    return os.environ.get(f"ASTRA_{name}", default)


@dataclass(frozen=True)
class Settings:
    database_url: str = _env("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'data' / 'astra.db'}")
    models_dir: Path = Path(_env("MODELS_DIR", str(PROJECT_DIR / "models")))

    # Face recognition (OpenCV YuNet detector + SFace recognizer).
    # SFace's published cosine threshold is 0.363; we are deliberately stricter.
    face_match_threshold: float = float(_env("FACE_MATCH_THRESHOLD", "0.45"))
    face_match_margin: float = float(_env("FACE_MATCH_MARGIN", "0.08"))
    face_confirm_frames: int = int(_env("FACE_CONFIRM_FRAMES", "3"))
    face_min_size_px: int = int(_env("FACE_MIN_SIZE", "90"))
    enrollment_captures: int = int(_env("ENROLLMENT_CAPTURES", "6"))

    # Facial landmark analysis
    facial_scan_frames: int = int(_env("FACIAL_SCAN_FRAMES", "8"))

    # Speech
    stt_model: str = _env("STT_MODEL", "base.en")
    stt_device: str = _env("STT_DEVICE", "cpu")
    tts_voice: str = _env("TTS_VOICE", "en_US-amy-medium")

    # Access control (demo only — see docs/FACIAL_AUTH.md)
    operator_pin: str = _env("OPERATOR_PIN", "2026")
    session_minutes: int = int(_env("SESSION_MINUTES", "30"))

    # Mission
    mission_name: str = _env("MISSION_NAME", "ASTRA-1 Earth–Mars Transit")
    mission_start: str = _env("MISSION_START", "2026-06-25")
    blood_test_interval_days: int = int(_env("BLOOD_TEST_INTERVAL_DAYS", "7"))
    default_comm_delay_s: float = float(_env("COMM_DELAY_S", "12"))

    cors_origins: list[str] = field(
        default_factory=lambda: _env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    )

    @property
    def face_dir(self) -> Path:
        return self.models_dir / "face"

    @property
    def piper_dir(self) -> Path:
        return self.models_dir / "piper"

    @property
    def stt_dir(self) -> Path:
        return self.models_dir / "stt"


settings = Settings()
