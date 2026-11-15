---
version: 1
slug: "frontend-src-pages-astrahome-tsx"
primary_target: "frontend/src/pages/AstraHome.tsx"
related_targets: ["frontend/src/pages/MissionControlPage.tsx","frontend/src/pages/OperatorPage.tsx","frontend/src/pages/EnrollPage.tsx","frontend/src/features"]
---

# ASTRA booth and ground screens

Scope: every ASTRA screen (stand-by home, check-in stages, summary and details drawer, voice orb and captions, emergency overlay, enrollment, Mission Control, operator tools, top bar). Mode: **Operate**. Audience: astronauts at ~1 m from a booth panel, ground operators at a desk, judges on a projector. Job: finish a hands-free check-in and read the result in seconds; ground staff triage delivered reports. Constraints: workflow, state, voice timing and every existing animation fixed; offline fonts only; status meanings fixed and never colour-alone.

## Direction contract

THESIS: A guide map, not a dashboard. Each screen is one swelling land lobe on cream water whose coastline does the dividing; refuses the dark navy, glowing glass-card console.

OWN-WORLD: Flat unmodulated land green #8ED462 on cream water #F5F1E4, ink #2C2E2A, white sheets. Capsule controls in yellow #F5E211, coral #FF705D, blue #2BA0FF, lilac #EBC1FF (coral and blue carry labels only). Inter at one weight (600), display huge at 0.95 leading and -0.06em. Health status uses its own deep tones (forest, ochre, rust, signal red) with a shape mark and words.

STORY: The astronaut sees where they are on the route (capsule steps), what is being measured now (one huge reading or prompt on the lobe), and leaves knowing their status from a sober band.

FIRST VIEWPORT: 1440x900 stand-by: green lobe bleeding off the left edge holding a 6-7rem ink headline, one paragraph and a yellow capsule action; 3D booth standing on cream water at right; mission facts as a row of capsules at the lobe's foot; top bar with logo, mission line and a signal-red Emergency capsule.

FORM: seed: none (pinned) — the user's words: "guide map"; "one lobe dominates each screen, and a lobe may open in its middle so the ground shows through"; "the workflow and all animations are preserved exactly". Signature interaction: lobes settle into place with a 0.4s overshoot on mount (static chrome only; reduced motion skips it), and a lobe opens in its middle where the ground should show through (operator gate, enrollment done).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
