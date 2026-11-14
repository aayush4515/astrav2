# Ideas beyond the prototype (for the pitch and the roadmap)

These suggestions build on the team's booth concept. Items marked ★ are cheap to add or to show in the presentation animation.

## Booth hardware concept

* ★ **Swap the bone-density scanner for proxies that can actually be measured in space.** DEXA does not fit in a spacecraft booth. Credible alternatives: tracking body mass and exercise adherence (already in ASTRA), weekly urine calcium/NTx test strips read by the camera, or quantitative ultrasound of the heel (small, radiation-free devices exist).
* ★ **Camera-read test strips.** Urine hydration, ketones and calcium strips held up to the face camera and read by color. This is real computer vision you could build in a hackathon.
* **Remote photoplethysmography (rPPG):** estimate heart rate from subtle skin-color changes in the webcam video. This could turn one simulated vital into a real one. It is sensitive to motion and lighting, so label it experimental.
* **Ultrasound-guided self-exam.** ISS crews do remote-guided ultrasound. ASTRA could overlay probe-placement guidance on the camera view.
* **Voice biomarkers:** speech rate, pitch variability and pauses as a fatigue or mood signal. The audio is already captured locally. Treat it as experimental and keep it consent-gated.
* **Cognitive micro-test** (30 s reaction time / psychomotor vigilance test). NASA uses PVT-style tests for fatigue. Good for the gamification angle.

## Software

* ★ **Gamification:** streaks for completed check-ins and exercise targets, crew "constellation" badges, and a gentle nudge when a check-in is missed. The scheduling module already stores reminders.
* **Crew-medical-officer view onboard:** an authenticated view for the CMO showing every crewmate's status. Today this exists only on the ground.
* **Environment-aware modes** (spacecraft / station / lunar base / rover): change sensor plans, reference ranges and guidance per gravity level and available hardware.
* **Model per astronaut, done safely:** the team proposed one model per astronaut. ASTRA implements this as per-astronaut baselines plus a shared engine, which works with little data, is explainable and can't overfit. A next step is a small per-astronaut autoencoder or Gaussian process once months of data exist.
* **Ground-validated thresholds:** let flight surgeons adjust per-astronaut alert thresholds from Mission Control, and send them back over the delayed link.
* **Wake word** (e.g. openWakeWord, offline) for "ASTRA, emergency" outside a session.

## Presentation

* Show the **real vs simulated** table early. Judges reward honesty.
* Open with the challenge video's scenario ("halfway to Mars, a crewmate collapses"), and end the demo on exactly that emergency flow.
* The 3D booth doubles as the hardware animation: every device in it maps to a `SensorAdapter` you could plug real hardware into.
