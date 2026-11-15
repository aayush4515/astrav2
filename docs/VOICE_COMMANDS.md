# Voice interaction

## Pipeline

1. **Turn-taking:** ASTRA never records while it is speaking. After each utterance it waits 250 ms (speaker tail), then opens a listening window. The browser's echo cancellation is enabled as well.
2. **Voice activity detection** (browser): an adaptive energy threshold over the noise floor, a pre-roll so the first word isn't clipped, and end-of-turn after ~1 s of silence. A no-speech timeout counts as "silence".
3. **Transcription** (backend, local): faster-whisper `base.en`, int8 on CPU, with a vocabulary bias prompt. Known Whisper "silence hallucinations" ("thank you", "you") are discarded. Raw audio is never stored.
4. **Interpretation:** a deterministic parser and intent router (`backend/app/services/voice`), with no generative model in the clinical logic.
5. **Speech:** Kokoro (82M-parameter model, int8 ONNX, `af_heart` voice at 1.1× pace) produces WAV, played through Web Audio. The browser requests one sentence at a time and synthesizes the next while the current one plays, so speech starts in about half a second. If Kokoro is unavailable, ASTRA uses Piper (`en_US-amy-medium`, tuned slightly faster and more expressive), then the browser's speech synthesis, then text-only captions. Change the voice with `ASTRA_KOKORO_VOICE` and the pace with `ASTRA_TTS_SPEED`.

UI states: *Standing by · ASTRA speaking · Listening · Transcribing · Analyzing · Didn't catch that*. All spoken text is also shown as captions, and transcribed answers appear in green quotes.

## Commands

| Say (examples) | Intent | Effect |
|---|---|---|
| "Emergency", "I need medical help", "Help my crewmate, he collapsed" | `emergency` | Aborts the check-in, opens emergency mode, alerts the crew and queues a critical report |
| "End check-in", "I'm done", "Goodbye" | `end_checkin` | Ends the session and returns to stand-by |
| "Cancel" (during the greeting) | `cancel` | Cancels before measurements start |
| "Repeat that", "Say it again" | `repeat` | Repeats the last question or answer |
| "Go back" | `go_back` | Explains that saved answers are kept, then re-asks |
| "Continue", "Next", "Skip" | `continue` | Moves on (skipped questions are stored as skipped) |
| "How am I doing?" | `how_am_i` | Speaks the status and main observations |
| "What's my heart rate?" / "…blood pressure / oxygen / temperature / weight / sleep" | `query_metric` | Speaks the value and usual value, and opens that trend |
| "Show my heart-rate history", "Show my sleep history" | `open_details` | Opens Detailed Insights → Trends → that metric |
| "Show my cardiovascular measurements" | `open_details` | Opens Body → Cardiovascular |
| "Explain this result", "Why was my heart rate flagged?" | `explain` | Explanation from the stored observation |
| "Explain my facial scan" | `explain` (facial) | Facial comparison explanation and the Face tab |
| "Explain my odor fingerprint results" | `explain` (voc) | VOC explanation (experimental) and the VOC tab |
| "What changed since yesterday?" / "…since last week?" | `what_changed` | Compares with the matching earlier check-in |
| "Show my blood test results" | `show_labs` | Speaks out-of-range markers and opens Labs |
| "When is my next blood test?" | `next_blood_test` | Speaks the due date or "due now" |
| "What should I do next?" | `recommendation` | Speaks the top guidance and opens Guidance |
| "Open my health dashboard", "Show details" | `open_details` | Opens Detailed Insights |
| "Close details" | `close_details` | Closes the panel |
| "What can I say?" | `help` | Lists the commands |

### Confirmations (weekly blood test)

"Yes / sure / let's do it" → start · "Not now" → ask again at the next check-in · "Remind me later" → in 2 hours.
During collection: "Sample ready" / "done" → analyze.

### Emergency mode

"Next", "Back", "Repeat", "Resolved". You can also describe the situation: "collapsed / not breathing", "chest pain", "breathing", "bleeding / injury". Each one switches to the matching protocol.

## Questionnaire

Base questions: how are you feeling · health 1–10 · unusual fatigue · sleep quality 1–10 · pain or discomfort · mood · new symptoms.

Adaptive branches (deterministic rules in `questionnaire.py`):

* Heart rate ≥ 2 robust SD above baseline (or > 95 bpm) → *"Have you exercised in the last thirty minutes?"*. If yes, that reading is excluded from the resting comparison.
* Sleep ≥ 2 SD below baseline or < 6 h → *"Was anything disturbing your sleep?"*
* Pain → location, then severity. Chest location or chest-pain words → an immediate prompt to say "emergency".
* Dizziness → timing (moving / constant / random).
* Facial change detected → *"Have you noticed headaches or changes in your vision?"*
* A clear mood in "how are you feeling" skips the separate mood question, and saying "tired" skips the fatigue question.

Natural answers are understood: "I'd say about seven", "six or seven" (→ 7), "8/10", "yeah a little", "not really", "my lower back hurts" (→ pain = yes). After two failed attempts ASTRA offers on-screen answer buttons. Data is never lost; the same pending question accepts either input.
