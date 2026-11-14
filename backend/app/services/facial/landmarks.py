"""MediaPipe Face Landmarker (478 points + blendshapes + head pose), run locally on CPU."""

from __future__ import annotations

import math
import threading
from dataclasses import dataclass

import cv2
import numpy as np

from app.config import settings

MODEL_FILE = "face_landmarker.task"


@dataclass
class LandmarkResult:
    points: np.ndarray  # (478, 3) normalized x, y, z
    blendshapes: dict[str, float]
    yaw: float
    pitch: float
    roll: float
    image_size: tuple[int, int]  # w, h

    def pixels(self) -> np.ndarray:
        w, h = self.image_size
        return self.points[:, :2] * np.array([w, h], dtype=np.float64)


class LandmarkEngine:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._landmarker = None
        self._mp = None
        self._error: str | None = None

    def _load(self) -> None:
        if self._landmarker is not None or self._error:
            return
        path = settings.face_dir / MODEL_FILE
        if not path.exists():
            self._error = f"MediaPipe model missing: {path}"
            return
        try:
            import mediapipe as mp
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision

            opts = vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(path)),
                running_mode=vision.RunningMode.IMAGE,
                num_faces=2,
                output_face_blendshapes=True,
                output_facial_transformation_matrixes=True,
            )
            self._landmarker = vision.FaceLandmarker.create_from_options(opts)
            self._mp = mp
        except Exception as exc:  # pragma: no cover - depends on local install
            self._error = f"MediaPipe unavailable: {exc}"

    @property
    def available(self) -> bool:
        with self._lock:
            self._load()
            return self._landmarker is not None

    @property
    def error(self) -> str | None:
        return self._error

    def detect(self, img_bgr: np.ndarray) -> list[LandmarkResult]:
        with self._lock:
            self._load()
            if self._landmarker is None:
                raise RuntimeError(self._error or "landmarker unavailable")
            rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
            res = self._landmarker.detect(image)
        h, w = img_bgr.shape[:2]
        out: list[LandmarkResult] = []
        for i, lms in enumerate(res.face_landmarks):
            pts = np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float64)
            shapes = (
                {c.category_name: float(c.score) for c in res.face_blendshapes[i]} if res.face_blendshapes else {}
            )
            yaw = pitch = roll = 0.0
            if res.facial_transformation_matrixes:
                yaw, pitch, roll = _euler(np.asarray(res.facial_transformation_matrixes[i]))
            out.append(LandmarkResult(pts, shapes, yaw, pitch, roll, (w, h)))
        return out


def _euler(m: np.ndarray) -> tuple[float, float, float]:
    r = m[:3, :3]
    sy = math.hypot(r[0, 0], r[1, 0])
    pitch = math.degrees(math.atan2(r[2, 1], r[2, 2]))
    yaw = math.degrees(math.atan2(-r[2, 0], sy))
    roll = math.degrees(math.atan2(r[1, 0], r[0, 0]))
    return yaw, pitch, roll


engine = LandmarkEngine()
