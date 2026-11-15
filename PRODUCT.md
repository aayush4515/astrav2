# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Astronauts on long-duration missions** (Earth–Mars transit, station, lunar base). They use a health booth mounted in a spacecraft module about twice a day, standing roughly an arm's length from the display, often right after waking or before sleep. They are not medical professionals. Their job is to finish a routine check-in quickly, hands-free, and leave knowing whether anything needs attention.
- **Crew members during an emergency**, who need immediate, unambiguous protocol guidance without logging in.
- **Flight surgeons and mission operators on Earth** (Mission Control and operator tools), who review delivered reports, trends and alerts. Their reports arrive minutes late over a delayed link.
- **Hackathon judges** (NASA Space Apps Challenge 2026) see the same screens on a laptop, projector or screen recording during a live demo.

## Product Purpose

ASTRA lets astronauts monitor their own health without medical training or a connection to Earth. The astronaut approaches the booth and is recognized by face. ASTRA then guides a spoken check-in, collects facial-geometry and (simulated) sensor measurements, and compares everything with that astronaut's own baseline. It explains the result in plain language and queues a report for Mission Control. Success means a routine check-in completes without touching the screen, the result is understood within seconds, and an emergency is one word or one press away.

## Positioning

The interface is a guided, voice-first check-in that judges each astronaut against their own history rather than population norms. It runs fully offline, with face recognition, landmark analysis, speech and analysis all local. It is honest about what is real (camera, voice, analysis) and what is simulated (vitals, VOC, labs).

## Operating Context

- A booth display inside a cabin module, with possibly dim or mixed cabin lighting. The user is standing and may be moving or holding handrails, with their attention split between ASTRA's voice and the screen.
- The routine flow is automatic: stand-by → face confirmed → greeting → face scan → wearable, vitals, thermal and mass sensors → e-nose → optional weekly blood test → spoken questions → result → optional voice queries → return to stand-by.
- The same build also runs on judges' laptops and projectors, so it must read well at both distances.
- Mission Control and operator screens are desk tools used by ground staff.

## Capabilities and Constraints

- The workflow, state machine, voice turn-taking and every animation (3D booth device activations, voice orb, transitions) are fixed. A redesign changes presentation only.
- Real: webcam face recognition (OpenCV YuNet + SFace), MediaPipe facial geometry, offline speech-to-text (faster-whisper), local voice (Kokoro, with Piper fallback), personalized baseline analysis, SQLite.
- Simulated and always labelled as such: wearable, vitals, thermal, body-mass device, e-nose (experimental), blood analyzer, cabin environment, Earth link.
- Not a medical device. Observations are never diagnoses. Reference ranges are illustrative, not NASA criteria.
- Must work fully offline after setup: no web fonts or assets from the internet at runtime.
- Stack: React + TypeScript + Vite + Tailwind + React Three Fiber, with a FastAPI backend.

## Brand Commitments

- Product name: **ASTRA** (Autonomous Space Telehealth & Risk Assessment).
- Logo mark: the circled chevron (`frontend/public/astra.svg`) is kept.
- Status meanings are fixed: green = no significant change, amber = additional assessment suggested, orange = crew medical review recommended, red = urgent / emergency.
- Must not look AI-generated (no stock "dark navy + cyan glow + glass cards" sci-fi look), must not look clinical like a hospital portal, and must never be slow to read at a glance.

## Evidence on Hand

- Seeded synthetic crew (Commander Alex Moreno, Dr. Priya Nair, Specialist Kenji Watanabe, Pilot Lucas Oliveira) with four weeks of labelled synthetic history; real enrolled test users exist locally.
- Public-domain NASA portraits are used only as face-recognition test fixtures, never in the UI.
- No real astronaut testimonials, mission data, or NASA endorsement exists. None may be implied.

## Product Principles

1. **Hands-free first.** Every screen must work for someone who only looks and speaks. Controls are a fallback, not the path.
2. **Status at a glance.** The current step, the result and anything urgent must be readable from arm's length in a second or two.
3. **Honest provenance.** Real versus simulated versus self-reported data is always visible.
4. **Calm, then unmistakable.** Routine use is quiet. An emergency changes the whole screen at once.
5. **Personal, not population.** Results are framed against the astronaut's own baseline.

## Accessibility & Inclusion

Readable from about 1 m on a booth panel and on a projector. Status never relies on color alone. Reduced-motion support is respected. Every voice interaction has an on-screen text equivalent and a manual fallback.
