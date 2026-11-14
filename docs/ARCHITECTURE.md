# ASTRA architecture

## Components

| Layer | Location | Responsibility |
|---|---|---|
| Presentation | `frontend/src/pages`, `features/*` | Three astronaut experiences (stand-by/check-in, details, emergency) plus separate Mission Control and operator routes |
| 3D booth | `features/booth/Booth3D.tsx` | Procedural R3F scene. `activeDevice` and `phase` props drive every animation, so nothing runs on a free-running timer |
| Check-in orchestrator | `features/check-in/useCheckinFlow.ts` | Client state machine. Sequences voice turns and backend calls, and is cancellable at any point (emergency, "end check-in") |
| Voice I/O | `features/voice/*` | Mic capture + adaptive energy VAD → 16 kHz WAV; Piper WAV playback; strict turn-taking; on-screen fallback input |
| Identity | `backend/app/services/identity` | YuNet detection, quality gate, SFace embeddings, matching, multi-frame tracker, enrollment, bearer sessions |
| Facial analysis | `services/facial` | MediaPipe landmarks → 8 normalized geometry features → comparison with the astronaut's reference history |
| Sensors | `services/sensors` | `SensorAdapter` ABC, registry, deterministic simulators, VOC acquisition/analysis, environment telemetry |
| Health intelligence | `services/health` | Baselines, analysis (safety rules, deviations, patterns, Isolation Forest), read models for insights |
| Guidance | `services/guidance/library.py` | Predefined, traceable guidance entries in four tiers |
| Voice NLU | `services/voice` | Answer parsing, intent router, adaptive questionnaire, spoken Q&A from stored state |
| Scheduling | `services/scheduling` | Weekly blood test schedule, persistent reminders, simulated analyzer |
| Communications | `services/communications` | Store-and-forward queue and link simulator (background task, 1 Hz) |
| Emergency | `services/emergency`, `api/emergency.py` | Protocol content, unauthenticated activation, crew alert, critical reports |
| Persistence | `models/*`, SQLite | 20 tables, UUID keys, provenance on every reading, WAL mode |

## Check-in sequence

```
Browser                                         Backend
───────                                         ───────
STANDBY  frame every ~250 ms ─────────────────► POST /api/auth/face   (YuNet → quality → SFace → match)
         ◄──── status: matching (n/3) …           tracker: 3 consecutive matches + micro-motion
         ◄──── confirmed + bearer token           auth_sessions row (hash only), audit event
IDENTITY_CONFIRMED / VOICE_GREETING
         POST /api/checkins ──────────────────►  dedupe (resume within 20 min), env telemetry, schedule
         speak greeting, 3 s "cancel" window
[BLOOD_TEST offer if due]  yes / not now / later ─► POST /api/blood-tests/respond
FACIAL_SCAN  frames ─────────────────────────►  /facial/frame: identity continuity check, MediaPipe,
             ◄── landmarks, guidance, n/8        pose/expression gate, accept → aggregate → compare
SENSOR_COLLECTION  per device ───────────────►  /sensors/{device}: adapter.connect/collect/validate → SQLite
             3D device animates while the request is in flight; spoken announcement in parallel
VOC_SCAN ────────────────────────────────────►  /voc: e-nose vector, robust z, cosine, PCA, IsoForest
[BLOOD_TEST collect → "sample ready" → analyze]  /blood-tests/{id}/analyze → results, next reminder, lab report
VOICE_QUESTIONNAIRE  loop:
   GET /questionnaire/next ──────────────────►  adaptive rules use answers + this check-in's readings
   speak → listen → POST /api/voice/transcribe   faster-whisper (local)
   POST /questionnaire/answer ───────────────►  parse → structured value | clarification | command
PROCESSING  POST /complete ──────────────────►  analysis → observations, guidance, baselines, report queued
VOICE_SUMMARY  speak summary; command loop:
   POST /api/voice/ask ──────────────────────►  intent → answer from stored analysis + UI action
COMPLETED → logout → STANDBY
```

Any `listen()` can return an emergency intent. The orchestrator then aborts, cancels the check-in, revokes the session and hands control to the emergency overlay.

## Data model (SQLite)

`astronauts`, `facial_enrollments` (embeddings only), `auth_sessions` (token hashes), `checkins` (stage, faults, analysis snapshot), `sensor_readings` (metric, value, unit, device, source, kind, simulated, quality, context, valid), `environment_readings` (kept separate from body data), `facial_observations` (features, within-scan spread, quality, reference flag, comparison), `questionnaire_responses`, `voice_interactions` (intents, short transcript), `personal_baselines`, `voc_measurements`, `blood_tests`, `blood_test_results`, `reminders`, `health_observations` (severity, method, explanation, provenance, uncertainty, experimental), `guidance_records`, `emergency_events`, `communication_messages`, `audit_events`, `system_settings`.

## Plugging in real hardware

Implement `SensorAdapter` (`connect`, `collect`, `validate`, `disconnect`) for the device and register it:

```python
from app.services.sensors.registry import registry
registry.register(MyBleOximeterAdapter())   # device_id = "vitals_module"
```

Readings from adapters with `simulated = False` are stored as `kind = real_sensor`. Ingestion, baselines, analysis, UI and reports stay unchanged.

## Security model (prototype)

* The astronaut's identity comes from a server-issued bearer token created **only** by the face tracker or an audited operator recovery. Frontend-supplied astronaut IDs are never trusted.
* Check-in endpoints verify ownership. Mission Control and admin endpoints require an operator session (PIN).
* Emergency endpoints are deliberately unauthenticated. Patient vitals shown there count as break-glass access and are audited.
* The biometric data is SFace embeddings, which can be deleted by an operator. Raw images and audio are never persisted.
