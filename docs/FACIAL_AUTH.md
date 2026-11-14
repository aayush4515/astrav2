# Facial enrollment, recognition, privacy and recovery

## Models

* **Detector:** OpenCV YuNet (`face_detection_yunet_2023mar.onnx`, Apache-2.0). It returns face boxes and 5 keypoints.
* **Recognizer:** OpenCV SFace (`face_recognition_sface_2021dec.onnx`, Apache-2.0). Faces are aligned with the keypoints and turned into L2-normalized 128-d embeddings, which are compared by cosine similarity.
* **Landmarks (health analysis only):** MediaPipe Face Landmarker (`face_landmarker.task`). This module is separate from identity.

All of them run on CPU in the backend process. No cloud calls.

## Enrollment (one time)

1. `POST /api/astronauts` (new profile) or `POST /api/enrollment/start` (existing profile) returns a short-lived **enrollment ticket** for that single profile. Re-enrolling a profile that already has a face requires an operator session.
2. The browser sends webcam frames to `POST /api/enrollment/frame`. Each frame is rejected unless:
   * exactly one face is visible;
   * face size ≥ 90 px, brightness 45–215, Laplacian sharpness ≥ 25, |yaw| ≤ 25°, |roll| ≤ 20° and detection score ≥ 0.85;
   * it looks like the same person as the first capture (cosine ≥ 0.55);
   * it does **not** match a *different* enrolled astronaut.
3. Six accepted captures are collected, with spoken prompts asking for small pose changes. Frontal frames also go into a MediaPipe scan, which becomes the astronaut's **facial-geometry reference**.
4. `POST /api/enrollment/finalize` stores 6 per-capture templates plus a mean template in `facial_enrollments` and marks the profile enrolled. **No images are stored.**

## Recognition at the booth

`POST /api/auth/face` takes one frame and returns one of: `no_face`, `multiple_faces`, `low_quality`, `unknown`, `ambiguous`, `no_enrollments`, `matching` or `confirmed`.

* Per-astronaut score = best template similarity.
* **Threshold:** best ≥ 0.45 (stricter than SFace's published 0.363).
* **Margin:** if the runner-up is also above the threshold, best − runner-up must be ≥ 0.08. Otherwise the result is `ambiguous` and nobody is chosen.
* **Multi-frame confirmation:** 3 consecutive frames must match the same astronaut within 6 s.
* **Liveness (weak):** the nose keypoint must move naturally between frames. This blocks a static printed photo, but not a video replay or mask.
* Only after confirmation does the server create a session (random token; only its SHA-256 is stored) and an audit event. The name is never revealed before confirmation.

## During a check-in

* Recognition stops once a session is active, so another face cannot switch profiles.
* Every facial-scan frame is re-identified. A frame that matches a *different* enrolled astronaut is rejected (`identity_mismatch`), and frames with multiple faces are rejected.
* Detecting the same astronaut again within 20 minutes resumes their open check-in instead of creating a duplicate.

## Recovery and accessibility

If recognition fails (facial injury, camera fault or failed enrollment), an **authorized operator** can start a recovery check-in from `/operator`. It requires the operator PIN and a written reason, is audited, and is labelled "Operator recovery session" in the UI. There is never an automatic fallback to manual identity selection.

**Emergency mode never requires facial recognition.**

## Privacy

* Biometric templates and geometry features stay in the local SQLite database.
* An operator can delete an astronaut's templates and facial reference (`DELETE /api/admin/astronauts/{id}/biometrics`) or re-enroll them.
* The webcam stays on only in the consented **booth stand-by mode** (activated by a click, stopped with **Deactivate**) and during enrollment and check-in.
* Frames are processed in memory and discarded.

## Limitations

Face-only authentication to medical records is a hackathon prototype choice. A flight system would need a threat model, presentation-attack detection evaluated against ISO/IEC 30107-3, encrypted biometric storage, and probably a second factor for record access outside the booth.
