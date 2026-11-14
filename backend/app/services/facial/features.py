"""Standardized facial-geometry features derived from MediaPipe landmarks.

All lengths are divided by the inter-ocular distance so they are independent of camera distance,
and the face is rotated onto its own midline so head roll does not leak into asymmetry measures.
These are geometric observations only. They are NOT medical measurements and cannot detect
edema, intracranial pressure, stroke or any eye disease.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.services.facial.landmarks import LandmarkResult

# MediaPipe Face Mesh indices (subject's anatomical right / left).
R_EYE_OUT, R_EYE_IN, R_EYE_TOP, R_EYE_BOT = 33, 133, 159, 145
L_EYE_OUT, L_EYE_IN, L_EYE_TOP, L_EYE_BOT = 263, 362, 386, 374
R_BROW, L_BROW = 105, 334
MOUTH_R, MOUTH_L = 61, 291
FOREHEAD, CHIN = 10, 152
CHEEK_R, CHEEK_L = 234, 454


@dataclass(frozen=True)
class FeatureSpec:
    key: str
    label: str
    unit: str
    description: str
    noise_floor: float  # minimum spread assumed between captures (measurement noise)
    min_change: float  # smallest absolute change considered meaningful


FEATURES: dict[str, FeatureSpec] = {
    s.key: s
    for s in [
        FeatureSpec("right_eye_opening", "Right eyelid opening", "ratio",
                    "Vertical eyelid aperture divided by eye width (right eye).", 0.02, 0.05),
        FeatureSpec("left_eye_opening", "Left eyelid opening", "ratio",
                    "Vertical eyelid aperture divided by eye width (left eye).", 0.02, 0.05),
        FeatureSpec("eye_opening_asymmetry", "Eyelid opening asymmetry", "%",
                    "Left minus right eyelid opening, relative to their mean.", 4.0, 12.0),
        FeatureSpec("eye_level_difference", "Eye level difference", "% IOD",
                    "Vertical offset between eye centres along the face midline.", 0.8, 2.5),
        FeatureSpec("brow_asymmetry", "Eyebrow height asymmetry", "% IOD",
                    "Left minus right brow-to-eyelid height.", 1.0, 3.0),
        FeatureSpec("mouth_corner_tilt", "Mouth-corner tilt", "°",
                    "Angle of the line between mouth corners relative to the face horizontal.", 0.8, 3.0),
        FeatureSpec("facial_width_index", "Facial width index", "× IOD",
                    "Cheek-to-cheek width divided by inter-ocular distance. Experimental fluid-shift proxy only.",
                    0.01, 0.04),
        FeatureSpec("face_height_index", "Face height index", "× IOD",
                    "Forehead-to-chin height divided by inter-ocular distance.", 0.015, 0.05),
    ]
}


def _rotate_to_midline(pts: np.ndarray) -> np.ndarray:
    axis = pts[CHIN] - pts[FOREHEAD]
    angle = np.arctan2(axis[0], axis[1])  # 0 when chin straight below forehead
    c, s = np.cos(angle), np.sin(angle)
    rot = np.array([[c, -s], [s, c]])
    centred = pts - pts[FOREHEAD]
    return centred @ rot.T


def _d(p: np.ndarray, a: int, b: int) -> float:
    return float(np.linalg.norm(p[a] - p[b]))


def extract_features(lm: LandmarkResult) -> dict[str, float]:
    p = _rotate_to_midline(lm.pixels())
    iod = _d(p, R_EYE_OUT, L_EYE_OUT) or 1.0
    r_open = _d(p, R_EYE_TOP, R_EYE_BOT) / (_d(p, R_EYE_OUT, R_EYE_IN) or 1.0)
    l_open = _d(p, L_EYE_TOP, L_EYE_BOT) / (_d(p, L_EYE_OUT, L_EYE_IN) or 1.0)
    r_center = (p[R_EYE_OUT] + p[R_EYE_IN]) / 2
    l_center = (p[L_EYE_OUT] + p[L_EYE_IN]) / 2
    # Image y grows downward; brow height = eyelid-top y minus brow y.
    r_brow = (p[R_EYE_TOP][1] - p[R_BROW][1]) / iod
    l_brow = (p[L_EYE_TOP][1] - p[L_BROW][1]) / iod
    mouth = p[MOUTH_L] - p[MOUTH_R]
    tilt = float(np.degrees(np.arctan2(mouth[1], abs(mouth[0]) or 1.0)))
    mean_open = (r_open + l_open) / 2 or 1.0
    return {
        "right_eye_opening": round(r_open, 4),
        "left_eye_opening": round(l_open, 4),
        "eye_opening_asymmetry": round((l_open - r_open) / mean_open * 100, 3),
        "eye_level_difference": round((r_center[1] - l_center[1]) / iod * 100, 3),
        "brow_asymmetry": round((l_brow - r_brow) * 100, 3),
        "mouth_corner_tilt": round(tilt, 3),
        "facial_width_index": round(_d(p, CHEEK_R, CHEEK_L) / iod, 4),
        "face_height_index": round(_d(p, FOREHEAD, CHIN) / iod, 4),
    }


def capture_quality(lm: LandmarkResult, brightness: float | None = None) -> dict:
    """Decides whether a frame is suitable for comparison and returns spoken-friendly guidance."""
    bs = lm.blendshapes
    issues: list[str] = []
    if abs(lm.yaw) > 10:
        issues.append("turned_sideways")
    if abs(lm.pitch) > 14:
        issues.append("looking_up_or_down")
    if abs(lm.roll) > 10:
        issues.append("head_tilted")
    if bs.get("jawOpen", 0) > 0.25:
        issues.append("mouth_open")
    if max(bs.get("mouthSmileLeft", 0), bs.get("mouthSmileRight", 0)) > 0.45:
        issues.append("smiling")
    if min(bs.get("eyeBlinkLeft", 0), bs.get("eyeBlinkRight", 0)) > 0.55:
        issues.append("eyes_closed")
    xs, ys = lm.points[:, 0], lm.points[:, 1]
    face_w = float(xs.max() - xs.min())
    if face_w < 0.18:
        issues.append("too_far")
    if xs.min() < 0 or xs.max() > 1 or ys.min() < 0 or ys.max() > 1:
        issues.append("out_of_frame")
    if brightness is not None and brightness < 45:
        issues.append("too_dark")
    return {
        "ok": not issues,
        "issues": issues,
        "yaw": round(lm.yaw, 1),
        "pitch": round(lm.pitch, 1),
        "roll": round(lm.roll, 1),
        "face_width": round(face_w, 3),
    }


GUIDANCE = {
    "turned_sideways": "Please face the camera directly.",
    "looking_up_or_down": "Please level your head and look straight at the camera.",
    "head_tilted": "Please hold your head upright.",
    "mouth_open": "Please close your mouth and relax your face.",
    "smiling": "Please keep a neutral, relaxed expression.",
    "eyes_closed": "Please keep your eyes open.",
    "too_far": "Please move a little closer to the camera.",
    "out_of_frame": "Please centre your face in the camera view.",
    "too_dark": "The lighting is too low for a reliable scan.",
    "multiple_faces": "I can see more than one person. Only the astronaut being assessed should be in view.",
    "no_face": "I can't see your face. Please look toward the camera.",
    "identity_mismatch": "The person in view does not match the active astronaut.",
}


def aggregate(frames: list[dict[str, float]]) -> tuple[dict[str, float], dict[str, float]]:
    """Median of each feature over the accepted frames, plus robust within-scan spread."""
    keys = frames[0].keys()
    med, spread = {}, {}
    for k in keys:
        vals = np.array([f[k] for f in frames])
        m = float(np.median(vals))
        med[k] = round(m, 4)
        spread[k] = round(float(1.4826 * np.median(np.abs(vals - m))), 4)
    return med, spread


# Landmark subset streamed back to the browser for the live overlay (contours only, light payload).
OVERLAY_INDICES = sorted(
    {10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
     149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
     33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
     263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
     70, 63, 105, 66, 107, 300, 293, 334, 296, 336,
     61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
     1, 4, 5, 195, 197, 6, 168}
)
