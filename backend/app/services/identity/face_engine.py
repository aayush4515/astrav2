"""Local face detection (OpenCV YuNet) and face embedding (OpenCV SFace).

Both models are small ONNX networks from the OpenCV model zoo (Apache-2.0) and run on CPU.
Identity matching compares 128-d SFace embeddings by cosine similarity.
"""

from __future__ import annotations

import base64
import math
import threading
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.config import settings

YUNET_FILE = "face_detection_yunet_2023mar.onnx"
SFACE_FILE = "face_recognition_sface_2021dec.onnx"
EMBEDDING_MODEL = "opencv-sface-2021dec"


class FaceEngineUnavailable(RuntimeError):
    pass


@dataclass
class DetectedFace:
    bbox: tuple[float, float, float, float]  # x, y, w, h in pixels
    score: float
    keypoints: list[tuple[float, float]]  # right eye, left eye, nose, right mouth, left mouth
    raw: np.ndarray = field(repr=False)
    quality: dict = field(default_factory=dict)

    @property
    def size(self) -> float:
        return min(self.bbox[2], self.bbox[3])

    def to_dict(self, img_w: int, img_h: int) -> dict:
        x, y, w, h = self.bbox
        return {
            "bbox": [x / img_w, y / img_h, w / img_w, h / img_h],
            "score": round(self.score, 3),
            "quality": self.quality,
        }


def decode_image(data: str | bytes) -> np.ndarray:
    """Decode a JPEG/PNG given as raw bytes, base64 or a data URL into a BGR image."""
    if isinstance(data, str):
        if data.startswith("data:"):
            data = data.split(",", 1)[1]
        data = base64.b64decode(data)
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


def estimate_pose(keypoints: list[tuple[float, float]]) -> tuple[float, float]:
    """Rough yaw / roll (degrees) from the five YuNet keypoints."""
    (rex, rey), (lex, ley), (nx, _ny), _, _ = keypoints
    eye_dx, eye_dy = lex - rex, ley - rey
    eye_dist = math.hypot(eye_dx, eye_dy) or 1.0
    roll = math.degrees(math.atan2(eye_dy, eye_dx))
    mid_x = (rex + lex) / 2
    yaw = math.degrees(math.asin(max(-1.0, min(1.0, (nx - mid_x) / (eye_dist * 0.9)))))
    return yaw, roll


class FaceEngine:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._detector = None
        self._recognizer = None
        self._error: str | None = None

    def _load(self) -> None:
        if self._detector is not None or self._error:
            return
        det_path = settings.face_dir / YUNET_FILE
        rec_path = settings.face_dir / SFACE_FILE
        if not det_path.exists() or not rec_path.exists():
            self._error = f"Face models missing in {settings.face_dir}. Run scripts/download_models.py"
            return
        try:
            self._detector = cv2.FaceDetectorYN.create(str(det_path), "", (320, 320), 0.75, 0.3, 50)
            self._recognizer = cv2.FaceRecognizerSF.create(str(rec_path), "")
        except cv2.error as exc:  # pragma: no cover - depends on local install
            self._error = f"Could not load face models: {exc}"

    @property
    def available(self) -> bool:
        with self._lock:
            self._load()
            return self._detector is not None

    @property
    def error(self) -> str | None:
        return self._error

    def detect(self, img: np.ndarray) -> list[DetectedFace]:
        with self._lock:
            self._load()
            if self._detector is None:
                raise FaceEngineUnavailable(self._error or "face engine unavailable")
            h, w = img.shape[:2]
            self._detector.setInputSize((w, h))
            _, faces = self._detector.detect(img)
        result: list[DetectedFace] = []
        if faces is None:
            return result
        for row in faces:
            kps = [(float(row[4 + 2 * i]), float(row[5 + 2 * i])) for i in range(5)]
            face = DetectedFace(
                bbox=(float(row[0]), float(row[1]), float(row[2]), float(row[3])),
                score=float(row[14]),
                keypoints=kps,
                raw=row,
            )
            face.quality = assess_quality(img, face)
            result.append(face)
        result.sort(key=lambda f: f.size, reverse=True)
        return result

    def embed(self, img: np.ndarray, face: DetectedFace) -> np.ndarray:
        with self._lock:
            self._load()
            if self._recognizer is None:
                raise FaceEngineUnavailable(self._error or "face engine unavailable")
            aligned = self._recognizer.alignCrop(img, face.raw)
            feat = self._recognizer.feature(aligned)
        vec = np.asarray(feat, dtype=np.float32).reshape(-1)
        return vec / (np.linalg.norm(vec) + 1e-9)


def assess_quality(img: np.ndarray, face: DetectedFace) -> dict:
    x, y, w, h = (int(round(v)) for v in face.bbox)
    ih, iw = img.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(iw, x + w), min(ih, y + h)
    crop = img[y0:y1, x0:x1]
    if crop.size == 0:
        return {"ok": False, "issues": ["face_out_of_frame"]}
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    brightness = float(gray.mean())
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    yaw, roll = estimate_pose(face.keypoints)
    issues: list[str] = []
    if face.size < settings.face_min_size_px:
        issues.append("too_far")
    if brightness < 45:
        issues.append("too_dark")
    elif brightness > 215:
        issues.append("too_bright")
    if sharpness < 25:
        issues.append("blurry")
    if abs(yaw) > 25:
        issues.append("turned_away")
    if abs(roll) > 20:
        issues.append("head_tilted")
    if face.score < 0.85:
        issues.append("low_detection_confidence")
    if x < 0 or y < 0 or x + w > iw or y + h > ih:
        issues.append("partially_out_of_frame")
    return {
        "ok": not issues,
        "issues": issues,
        "brightness": round(brightness, 1),
        "sharpness": round(sharpness, 1),
        "yaw": round(yaw, 1),
        "roll": round(roll, 1),
        "size_px": round(face.size, 1),
    }


engine = FaceEngine()
