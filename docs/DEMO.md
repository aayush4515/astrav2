# Hackathon demo script (~6–8 minutes)

## Pre-demo checklist

- [ ] `scripts/start.sh` is running. The top bar says **All systems local · offline-capable** (green dot). If it says "Loading local models", wait about 20 s.
- [ ] Optional: disconnect Wi-Fi to prove offline operation.
- [ ] Use Chrome or Edge. Allow camera and microphone for `localhost:5173`.
- [ ] Good, even lighting on the presenter's face. Only the presenter in the camera view.
- [ ] Enroll the presenter's face **before** the demo: `/enroll` → **Dr. Priya Nair** (scenario B, gradual change) or **Commander Alex** (scenario A, normal).
- [ ] `/operator` (PIN 2026): set scenarios as needed. Click **make due** on the blood test for the presenter's profile if you want scenario E.
- [ ] Open `/mission-control` in a second window, signed in.
- [ ] On the booth screen, click **Activate booth** once.

## Script

### 1. Problem (30 s)
"Halfway to Mars, astronauts are their own first responders. Earth is up to 22 minutes away each way. They're not doctors, and they have no time for complicated software."

### 2. Stand-by and recognition: Scenario A/B (1 min)
* Show the 3D booth. Click a device (e.g. the e-nose) to show the description card, then close it.
* The presenter steps out of frame and walks back in. **"Verifying identity…"** appears, then the greeting. Point out that this was real face matching over three frames, with no login.

### 3. Hands-free check-in (2–3 min)
* **Facial scan:** live landmarks, pose guidance ("please face the camera directly").
  *Scenario C:* during the scan, partly close one eye or raise one eyebrow and hold it. The summary then reports *"Facial geometry differs from your reference"*, and ASTRA asks about headaches or vision. Stress that this is geometry, not a diagnosis.
* **Sensors:** each 3D device lights up exactly while its (simulated) adapter is collecting. Readings appear.
* **VOC:** say "experimental; we track change from your own pattern, never hormones."
* **Blood test (Scenario E):** ASTRA says it's due. Answer **"Yes"**. The steps are spoken. Say **"Sample ready"**. The analyzer animates and the results are stored. The next due date moves forward one week.
* **Questions:** answer naturally: "Pretty tired, honestly." / "I'd say about five." / "My sleep was bad." ASTRA confirms each answer.
  *Scenario B (Priya):* ASTRA adds *"Your sleep was shorter than usual…"* and *"Have you exercised in the last thirty minutes?"*. These are adaptive follow-ups.

### 4. Summary and voice navigation (1 min)
* Status: *Additional assessment suggested*. Two observations and one next action. ASTRA speaks the summary.
* Say: **"Show my heart-rate history"** → the trend opens with the personal baseline band.
* Say: **"Explain my odor fingerprint results"** → the VOC tab and an explanation.
* Say: **"End check-in"** → ASTRA returns to stand-by.

### 5. Scenario G: communication outage (45 s)
* In Mission Control click **Simulate outage**. Run another quick check-in, or show the queue. Reports stay **queued** while onboard analysis works normally.
* Click **Restore link**. Messages go *in transit* → *delivered* after the configured delay. Click **Ack**.

### 6. Scenario F: emergency (1 min)
* Say **"Emergency"** while ASTRA is listening, or press the red button.
* The emergency view appears: *All crew alerted*, the immediate priority action and step-by-step guidance. Say "next" to advance. Select the crewmate to see their latest vitals. The Mission Control status shows the critical report in transit.
* Mission Control shows the red emergency banner after the delay. Click **Acknowledge**. Back onboard, say **"resolved"**.

### 7. Persistence (15 s)
Restart the backend. History, enrollment and queued messages are all still there. Walk up again and you're recognized with no new registration.

## Scenario reference

| ID | How to trigger |
|---|---|
| A Normal | Commander Alex, scenario `normal` |
| B Gradual change | Dr. Priya Nair (seeded with 6 days of rising resting HR, falling HRV and sleep, and fatigue) |
| C Facial change | Real webcam: hold a one-sided expression change during the face scan |
| D VOC anomaly | Specialist Kenji, scenario `voc_anomaly` |
| E Weekly blood test | Kenji is due by default; or Operator → *make due* |
| F Emergency | Say "emergency", or press the button; `acute_event` scenario also makes vitals urgent |
| G Outage | Mission Control → Simulate outage / Restore link |

Other scenarios: `fever`, `mass_loss` (Pilot Lucas), `sensor_fault` (vitals module does not respond), `high_co2`.

## If something goes wrong

* **Not recognized:** improve the lighting and face the camera. Re-enroll from `/operator` → the scan icon.
* **No voice:** click "Tap once to enable ASTRA's voice". Check that the top-bar tooltip shows TTS ready.
* **Microphone fails:** use **Answer without voice**. Collected data is kept.
* **Total failure:** Operator → **Start recovery check-in** for the profile.
