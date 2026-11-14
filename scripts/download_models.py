#!/usr/bin/env python3
"""Download the local model files ASTRA needs. Run once with internet; everything then works offline.

  python scripts/download_models.py            # all models
  python scripts/download_models.py --stt tiny.en
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "models"

FACE = {
    "face/face_detection_yunet_2023mar.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face/face_recognition_sface_2021dec.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    "face/face_landmarker.task":
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
}
PIPER = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/"


def fetch(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  ✓ {dest.relative_to(ROOT)} (exists)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  ↓ {dest.relative_to(ROOT)}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stt", default="base.en", help="faster-whisper model size (tiny.en, base.en, small.en)")
    args = ap.parse_args()
    print(f"Models directory: {ROOT}")
    for rel, url in FACE.items():
        fetch(url, ROOT / rel)
    for f in ("en_US-amy-medium.onnx", "en_US-amy-medium.onnx.json"):
        fetch(PIPER + f, ROOT / "piper" / f)
    stt_dir = ROOT / "stt" / f"faster-whisper-{args.stt}"
    for f in ("config.json", "tokenizer.json", "vocabulary.txt", "model.bin"):
        fetch(f"https://huggingface.co/Systran/faster-whisper-{args.stt}/resolve/main/{f}", stt_dir / f)
    print("All models present. ASTRA can now run without internet access.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
