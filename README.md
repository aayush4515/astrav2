# ASTRA: Autonomous Space Telehealth & Risk Assessment

NASA Space Apps Challenge 2026 · *Create Health Monitoring Software for Astronauts on Space Missions*

ASTRA is an offline-first health booth for long-duration missions. An astronaut walks up to it. The webcam recognizes their face, ASTRA greets them by name, measures facial geometry, runs the (simulated) medical sensors, asks a short spoken questionnaire and compares everything with **that astronaut's own baseline**. It then speaks a plain-language summary. Reports go to a simulated Mission Control over a delay-tolerant link. After the one-time enrollment, a normal check-in needs no login, typing or clicking.

> Technology demonstrator, **not a medical device**. It does not diagnose. Vitals, VOC (e-nose) and lab values come from labelled simulations. Face recognition, facial landmarks, speech recognition and speech synthesis are real and run locally.

---

## What is real vs simulated

| Capability | Status in this prototype |
|---|---|
| Face detection + identity matching | **Real.** OpenCV YuNet detector and SFace 128-d embeddings, cosine matching with a threshold and margin, and multi-frame confirmation |
| Facial landmark analysis | **Real.** MediaPipe Face Landmarker (478 points, blendshapes, head pose) with quality gating and per-astronaut change detection |
| Speech-to-text | **Real, offline.** faster-whisper `base.en` on CPU; the browser does VAD and uploads 16 kHz WAV to the local backend |
| Text-to-speech | **Real, offline.** Kokoro (`af_heart` voice, int8 ONNX) for a natural, slightly brisk delivery, streamed sentence by sentence. Falls back to Piper `en_US-amy-medium`, then the browser's speech, then on-screen text only |
| Voice commands / intents | **Real.** Deterministic rule-based router; every intent triggers a UI action or backend query |
| Heart rate, BP, SpO₂, temperature, respiration, mass, sleep, HRV, exercise | **Simulated**, deterministic adapters behind a hardware-agnostic `SensorAdapter` interface |
| Electronic nose (VOC fingerprint) | **Simulated + experimental.** Change detection only, no hormone claims |
| Weekly blood analyzer | **Simulated.** The astronaut collects the sample manually; nothing implies automated blood draw |
| Cabin environment (CO₂, ppO₂, radiation…) | **Simulated** habitat telemetry, stored separately from body data |
| Personalized analysis | **Real** algorithms (robust baselines, Theil–Sen trends, multimodal rules, Isolation Forest) running on simulated + real inputs |
| Mission Control link | **Simulated** store-and-forward queue with configurable delay and outages, persisted in SQLite |

Each stored value carries a provenance tag (`real_sensor`, `simulated`, `user_reported`, `computed`, `experimental`), so the different kinds of data never get mixed silently.

---

## Quick start

Requirements: Python 3.11+, Node 18+, a webcam and microphone, and Chrome/Edge/Firefox. The one-time setup needs internet. After that, everything runs offline.

```bash
scripts/setup.sh          # venv + Python deps, model download (~250 MB), npm install
scripts/start.sh          # backend on :8000, frontend on :5173
```

Open http://localhost:5173. If port 8000 is busy (for example another project's backend), run `ASTRA_API_PORT=8765 scripts/start.sh`; the Vite proxy follows the same variable.

Manual equivalent:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python ../scripts/download_models.py
.venv/bin/uvicorn app.main:app --port 8000          # creates + seeds backend/data/astra.db on first start
cd ../frontend && npm install && npm run dev
```

The database is created and seeded automatically on first start. To reset the demo data, run `scripts/reset_demo.sh` or use **Operator tools → Reset demo database**.

### First run: enrolling a face

1. Open **Enrollment** from the link at the bottom-left of the booth screen, or go to `/enroll`.
2. Either register a new astronaut, or pick a seeded demo astronaut (they have four weeks of synthetic history but no face yet) and click **Enroll face**.
3. Follow the spoken prompts. ASTRA keeps 6 good captures and stores only SFace embeddings plus facial-geometry numbers. No photos are saved.
4. Return to the booth and click **Activate booth** once. This is the browser's required user gesture for camera, microphone and audio.
5. Walk away and come back. ASTRA recognizes you and starts the check-in hands-free.

Operator PIN (Mission Control, operator tools, recovery): `2026`. Change it with `ASTRA_OPERATOR_PIN`.

---

## Using ASTRA

The astronaut UI has three experiences:

1. **Stand-by** (`/`): the 3D booth and a single prompt, *"Approach for health check-in"*. Recognition runs automatically.
2. **Check-in** (same screen): face scan → sensors → chemistry → (weekly blood test if due) → spoken questions → summary. The page only shows what the current step needs. **Detailed health insights** (trends, body map, face, VOC, labs, guidance) open on request or by voice: *"show my heart-rate history"*.
3. **Emergency**: the red button is always in the top bar. You can also say *"emergency"* while ASTRA is listening. No authentication is required.

Ground-side tools are separate routes and are not linked from the astronaut UI:

* `/mission-control`: crew roster, delivered reports, emergency alerts, message queue, link outage and delay controls, and full histories.
* `/operator`: demo scenarios per astronaut, "make blood test due", database reset, biometric deletion and re-enrollment, recovery check-ins, and the audit log.

See [docs/DEMO.md](docs/DEMO.md) for a 6-minute demo script that covers all scenarios A–G.

---

## Architecture (short)

```
frontend/ (React + TS + Vite + Tailwind + R3F)          backend/ (FastAPI + SQLAlchemy + SQLite)
 ├ features/booth       3D booth, state-driven          ├ services/identity   YuNet+SFace, enrollment, sessions
 ├ features/check-in    orchestrator state machine  ──► ├ services/facial     MediaPipe landmarks, features, comparison
 ├ features/voice       VAD, WAV, TTS playback          ├ services/voice      faster-whisper, Piper, intents, questionnaire
 ├ features/dashboard   insights, charts, body map      ├ services/sensors    adapter interface, simulators, VOC
 ├ features/emergency   always-on emergency mode        ├ services/health     baselines, analysis, read models
 └ pages/               Home · Enroll · MC · Operator   ├ services/scheduling weekly blood tests, reminders
                                                        ├ services/communications delay-tolerant queue
                                                        └ seed/               deterministic multi-week crew history
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/FACIAL_AUTH.md](docs/FACIAL_AUTH.md) · [docs/VOICE_COMMANDS.md](docs/VOICE_COMMANDS.md)

### How the personalized analysis works

For each metric ASTRA computes a **21-day robust baseline** for that astronaut: a median with a floored MAD-based spread, and prior outliers trimmed so an anomaly doesn't become the new normal. It also computes a **7-day Theil–Sen trend**. Readings are compared only in a matching context; for example, a post-exercise heart rate is excluded from the resting baseline. On top of this there are:

* **Safety rules** using general adult reference values. These are clearly labelled illustrative, *not* NASA criteria, and lead to urgent escalation.
* **Multimodal patterns**, for example resting HR ↑ + HRV ↓ + sleep ↓ + reported fatigue, mood over several days, body-mass decline, facial change + headache/vision symptoms, VOC deviation, labs, and cabin CO₂.
* **Isolation Forest** on the astronaut's own multivariate history. This is supporting evidence only.

Outcomes are a status (*No significant changes detected · Additional assessment suggested · Crew medical review recommended · Urgent crew medical attention*), explainable observations and predefined guidance. ASTRA never produces an opaque "health score".

---

## Testing

```bash
cd backend && .venv/bin/python -m pytest -q        # API, analysis, NLU, matching, queue, emergency
cd frontend && npm test                             # audio encoding, UI, hands-free orchestrator
```

Hardware paths (real webcam, real mic) are exercised manually; see the checklist in [docs/DEMO.md](docs/DEMO.md#pre-demo-checklist). Automated tests use mocks or synthetic input.

---

## Offline capability and limitations

* Runs entirely on localhost with SQLite, local ONNX/CTranslate2 models and no API keys. Internet is needed only for setup.
* Browsers require one user gesture (click **Activate booth**) before audio can play. Camera and microphone permissions are granted once per origin.
* Wake-word detection is **not** implemented. Voice commands work whenever ASTRA is listening (during a check-in, its summary, and emergency mode). Outside those windows, use the on-screen emergency button.
* Liveness detection is weak: it requires natural micro-motion across frames, which defeats a static photo but not a video replay. Face-only access is a hackathon choice; operational use would need a security evaluation.
* Whisper `base.en` on CPU takes about 0.5–1.5 s per answer. Set `ASTRA_STT_MODEL=tiny.en` on slow machines.
* Webcam geometry is affected by lighting, angle and expression. ASTRA gates on pose and expression, but it cannot measure edema, intracranial pressure or eye disease.
* All guidance and emergency content is demonstration material that has not been clinically reviewed.

## Configuration

Environment variables (prefix `ASTRA_`): `DATABASE_URL`, `MODELS_DIR`, `FACE_MATCH_THRESHOLD` (0.45), `FACE_MATCH_MARGIN` (0.08), `FACE_CONFIRM_FRAMES` (3), `STT_MODEL` (base.en), `STT_DEVICE` (cpu), `TTS_ENGINE` (kokoro \| piper), `TTS_SPEED` (1.1), `KOKORO_VOICE` (af_heart; also af_bella, am_michael, bf_emma…), `TTS_VOICE` (Piper fallback voice), `OPERATOR_PIN`, `BLOOD_TEST_INTERVAL_DAYS` (7), `COMM_DELAY_S` (12), `SENSOR_TIME_SCALE` (1; 0 makes simulated sensors instant).

## Scientific basis

Risk categories and explanations follow NASA's Human Research Program: the [five hazards](https://www.nasa.gov/hrp/hazards/) (radiation, isolation & confinement, distance from Earth, gravity fields, hostile closed environments) and the [risks](https://www.nasa.gov/hrp/risks/) they drive, such as cardiovascular change, bone/muscle loss, SANS, sleep, behavioral health, nutrition and immune change. The electronic-nose concept is inspired by [NASA Ames e-nose work](https://www.nasa.gov/ames/space-biosciences/bioengineering-branch/e-nose/). The mass-measurement concept is SLAMMD (spring force ÷ acceleration). ASTRA is not endorsed by NASA.
