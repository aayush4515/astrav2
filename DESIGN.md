---
name: ASTRA
description: Offline, voice-first health check-in for astronauts, drawn as a guide map of flat land lobes on cream water.
colors:
  water: "#F5F1E4"
  land: "#8ED462"
  sheet: "#FFFFFF"
  ink: "#2C2E2A"
  ink-soft: "#4A4D46"
  ink-faint: "#5E6158"
  rule: "rgba(44, 46, 42, 0.14)"
  capsule-yellow: "#F5E211"
  capsule-yellow-hover: "#E3D100"
  capsule-coral: "#FF705D"
  capsule-blue: "#2BA0FF"
  capsule-lilac: "#EBC1FF"
  status-clear: "#1E6B35"
  status-watch: "#8A5A00"
  status-review: "#B23E0A"
  status-urgent: "#C8102E"
  status-urgent-hover: "#A80D26"
typography:
  display:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "clamp(3rem, 6.2vw, 6.75rem)"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.06em"
  headline:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.5
  body-lead:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.375
  control:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.375
  readout:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "\"tnum\" 1"
rounded:
  note: "16px"
  tile: "20px"
  band: "24px"
  sheet: "28px"
  frame: "32px"
  capsule: "9999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "20px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.capsule-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.capsule}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.capsule-yellow-hover}"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.capsule}"
    padding: "10px 20px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.status-urgent}"
    textColor: "{colors.sheet}"
    typography: "{typography.control}"
    rounded: "{rounded.capsule}"
    padding: "10px 20px"
    height: "44px"
  button-danger-hover:
    backgroundColor: "{colors.status-urgent-hover}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.capsule}"
    padding: "10px 20px"
    height: "44px"
  chip:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.capsule}"
    padding: "4px 12px"
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "24px"
  glance-tile:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "12px 16px"
  status-band:
    textColor: "{colors.sheet}"
    rounded: "{rounded.band}"
    padding: "16px 20px"
  priority-band:
    backgroundColor: "{colors.capsule-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "20px 24px"
---

# Design System: ASTRA

## Overview

**Creative North Star: "The Guide Map"**

ASTRA is drawn like a printed guide map, not a mission console. Each screen is cream water with one flat, swelling land lobe in fresh green; the coastline does the dividing that rules and card borders would do elsewhere. What matters right now (one prompt, one reading, one result) sits on the land in huge ink type, and everything else is a white sheet or a colored capsule floating on the water. The build explicitly refuses the dark navy, glowing glass-card dashboard.

The voice is plain and confident: one grotesk at one weight, set very large and very tight for the thing being said, then dropping quickly to comfortable reading sizes. Color is cheerful but disciplined. Capsule colors mark controls and route steps; health status has its own sober, deep tones and is never carried by color alone. Density is low on the booth (an astronaut reads it from about a metre away) and moderate on the ground-staff desk screens, which share the same world.

Depth is almost entirely flat. Land, water and sheets are unmodulated fills; the only shadows are the soft cast under the details drawer and a hover lift on selectable crew cards. Motion is inherited from the product and preserved; the world adds exactly one gesture, the lobe's overshoot settle.

**Key Characteristics:**
- One dominant land lobe per screen, on cream water, bleeding off an edge or opened in its middle.
- Flat fills only: no gradients, glass, glow or texture on land, water or sheets.
- Capsule (fully rounded) controls, chips and route steps; ink text on every capsule.
- Inter at a single weight (600) everywhere; display set at 0.95 leading and -0.06em tracking.
- Health status = deep status tone + StatusMark shape + words, always all three.
- Emergency flips the whole screen to signal red.

## Colors

A cream-and-green map palette with four bright capsule inks, plus a separate set of deep status tones that never mix with decoration.

### Primary
- **Map Land Green** (land): the lobe fill and nothing else of consequence. It is decoration and territory, never a health signal. Also used as the "confirmed" outline on camera previews and in the 3D scene's fill light.
- **Cream Water** (water): the page ground on every screen, the details drawer background, and the empty state behind a crew card with no report. It is also the 3D booth's floor and fog.

### Secondary
- **Route Yellow** (capsule-yellow): the primary action capsule, the astronaut's name capsule, the current emergency step, the recommended-next-action band, the emergency priority band, and text selection. It deepens to Pressed Yellow (capsule-yellow-hover) on hover.
- **Signal Coral** (capsule-coral): labels only. Used for the current route step's fill, the "experimental" chip, and the live-device pulse dot.
- **Sky Blue** (capsule-blue): labels only. Used for the recognition progress fill, the Earth-link mission capsule, and device accents in the 3D booth.
- **Soft Lilac** (capsule-lilac): completed route steps, the Enrollment capsule, and the cabin CO2 mission capsule.

### Tertiary (status)
- **Forest Clear** (status-clear): within the astronaut's usual range. Paired with the circle mark.
- **Ochre Watch** (status-watch): worth a closer look. Paired with the triangle mark. Also used for non-blocking fault and warning text.
- **Rust Review** (status-review): a notable change. Paired with the diamond mark.
- **Signal Red** (status-urgent): urgent. Paired with the octagon mark. Also the Emergency control, the Mission Control emergency banner, and the full emergency screen. Deepens to status-urgent-hover on hover.

### Neutral
- **Map Ink** (ink): all text, the focus ring, caret and form accents, the selected-card ring, and the 3D booth's dark trim.
- **Soft Ink** (ink-soft): secondary lines, labels, units, todo route-step numbers.
- **Faint Ink** (ink-faint): placeholders, inactive indicators and the no-baseline ring mark. The lightest ink allowed for text.
- **Sheet White** (sheet): every floating panel, tile, ghost button and input; text on status bands and the danger capsule.
- **Hairline** (rule): the 1px inset ring on ghost buttons and inputs. The only line in the system.

### Named Rules
**The Ink-On-Capsule Rule.** Text on every capsule (yellow, coral, blue, lilac, white) is Map Ink. Coral and blue carry labels only; they never fill body copy or large reading areas.

**The Land Is Not Health Rule.** Land green is territory, never meaning. Health status uses only the four deep status tones, and each appearance carries a StatusMark shape and words, so it never relies on color alone.

**The Red Means Emergency Rule.** Signal Red is reserved for urgent status and emergency controls and surfaces. It is never decorative.

## Typography

**Display Font:** Inter Variable (with Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** Inter Variable, same stack
**Label/Mono Font:** none; labels and numbers use Inter.

**Character:** One neutral grotesk at one heavy-ish weight, which lets size and tracking do all the hierarchy work. Huge, tight display lines read like place names on a map; everything below is plain and legible at arm's length.

Inter is bundled through @fontsource so the booth runs offline. It is kept despite being a widely used face because the offline constraint rules out web delivery, and a Linux booth would otherwise fall back to DejaVu.

### Hierarchy
- **Display** (600, clamp from about 2rem to 6.75rem depending on the screen, 0.95 leading, -0.06em): the one statement on a lobe, such as the stand-by prompt, the live reading or question, page titles on ground screens, and the details drawer title. Balanced wrapping.
- **Headline** (600, 28 to 32px and fluid result titles around 1.75 to 2.75rem, tight leading near 1.0 to 1.25, -0.04em): emergency step title, status band text, priority action, metric detail titles.
- **Title** (600, 22px, -0.03em): wordmark, crew names, section titles, next-action title. Sheet titles step down to 18px at -0.02em.
- **Body** (600, 17px base; 20px lead paragraphs at 1.375 leading, about 34ch wide): explanations on the lobe and on sheets.
- **Control** (600, 15px): buttons, inputs, mission capsules, captions and secondary sheet text.
- **Label** (600, 13px, 1.375 leading, Soft Ink): metadata lines, units context, small notes. Sentence case, no tracking, never uppercase.
- **Readout** (600, 24 to 44px, leading 1, -0.04 to -0.05em, tabular figures): numeric values in tiles, tables and live readings.

### Named Rules
**The One Weight Rule.** Every glyph is weight 600. Tailwind's weight scale is remapped so light through bold all resolve to 600; hierarchy comes from size, tracking and color only.

**The Tabular-Only-For-Numbers Rule.** Tabular figures appear only on numeric readouts and tables. Inter's tnum widens hyphens and dashes, so it stays off running text and titles.

## Layout

The spatial model is one lobe per screen. On the stand-by home at desktop width (lg, 1024px and up), the lobe bleeds off the left edge and holds the prompt column (about 46% wide) while the 3D booth fills the right side; below lg the booth stacks above the lobe. During check-in the screen splits into a booth frame and a lobe-backed stage column, and the column ratio shifts (1.25fr/1fr to 0.8fr/1.2fr) as the session moves from scanning to conversation and results. Ground screens put one lobe behind their main grid (the Mission Control crew cards, operator and enrollment panels).

Content sits on the lobe with generous percentage padding (about 5 to 6%) so it stays inside the coastline. Sheets and capsules float on water around it. The top bar is 64px tall with 20px gutters (32px at lg). Rhythm uses a small set of gaps: 8px between capsules, 16px between stacked blocks, 20px between major regions, 24px inside sheets, 40px between the stand-by column's top, middle and foot. Content widths are capped by measure (about 34ch body, 16 to 18ch display) rather than by a fixed container, except the emergency screen (max about 72rem).

## Elevation & Depth

The system is flat. Land, water, sheets and capsules are solid fills that sit side by side; separation comes from the coastline, from white-on-cream contrast, and from a single 1px hairline on ghost controls. Two shadows exist, both soft and ink-tinted, and both tied to a state rather than resting decoration.

### Shadow Vocabulary
- **Drawer cast** (`box-shadow: -16px 0 48px rgba(44,46,42,0.22)`): the details drawer sliding in over the check-in screen, above a 40% ink scrim.
- **Hover lift** (`box-shadow: 0 8px 24px rgba(44,46,42,0.14)`): selectable crew cards on Mission Control, on hover only.

### Named Rules
**The Flat Map Rule.** Nothing on the map is shaded at rest. No gradients, glows, glass or blur on land, water or sheets; a shadow appears only for an overlaying drawer or a hover response.

## Shapes

Two families. The land lobe is organic: a seeded, deterministic superellipse coastline, squarish enough to carry rectangular content, that may open in its middle so the water shows through (operator gate, enrollment complete). Everything placed on the map is either a full capsule (buttons, inputs, chips, route steps, mission facts, the progress track) or a generously rounded rectangle: notes 16px, tiles 20px, status and next-action bands 24px, sheets and the emergency priority band 28px, the booth frame 32px. There are no sharp corners and no borders beyond the hairline ring.

## Components

### Buttons
Tactile, cheerful capsules with ink labels.
- **Shape:** full capsule, at least 44px tall.
- **Primary:** Route Yellow with ink text, 10px by 20px padding (larger on the stand-by activate action). Deepens on hover.
- **Ghost:** white sheet with a hairline inset ring; hover tints toward a 40% yellow wash. On red emergency surfaces the ring is dropped.
- **Danger:** Signal Red with white text; reserved for Emergency and the emergency "Next step".
- **Focus / Disabled:** a 3px ink outline offset 3px on every focusable element; disabled at 40% opacity.

### Chips
- **Style:** small capsules (13px label, 4px by 12px) in any capsule color or white, ink text. A dark ink chip with white text marks the emergency step count.
- **Mission capsules:** larger chips (15px) in a row at the lobe's foot, one color each (yellow, blue, lilac, white). A warning swaps the fill to white and adds the triangle mark and ochre value.

### Cards / Containers
- **Corner Style:** sheets 28px; glance tiles and observation rows 20px.
- **Background:** Sheet White on water or land; never tinted.
- **Shadow Strategy:** flat (see Elevation & Depth).
- **Border:** none; a 3px inset ink ring marks the selected crew card.
- **Internal Padding:** 20 to 24px for sheets, 12 to 16px for tiles.

### Inputs / Fields
- **Style:** white capsule, hairline inset ring, 15px ink text, Faint Ink placeholder, 44px tall.
- **Focus:** the ring thickens to a 2px ink ring.

### Navigation
- **Top bar:** 64px, transparent on water. Logo and ASTRA wordmark (22px title) with a 13px mission line at left; a white status capsule in the middle on wider screens; the Emergency danger capsule at right on the booth (Operator tools ghost capsule on ground screens).
- **Route steps:** a row of capsule tracks. The current step expands and fills coral with its label and an ink dot; done steps fill lilac with a check; todo steps stay white and thin with a number. The fill animates over 0.5s.

### Land Lobe (signature)
A flat land-green SVG shape that fills its positioned parent behind the screen's main content. Each placement passes its own seed, swell (0 to 0.4) and squareness, so each screen keeps a stable coastline across renders; an optional hole opens the middle to the water. On mount it settles from 94% scale and zero opacity with a 0.4s overshoot (cubic-bezier 0.34, 1.56, 0.64, 1), skipped under reduced motion. One lobe dominates each screen.

### Status Mark and Status Band (signature)
- **Mark:** a 16-unit SVG shape filled with its status tone: circle (clear), triangle (watch), diamond (review), octagon (urgent), and an unfilled Faint Ink ring for no baseline or excluded context. Each carries an accessible name in words.
- **Band:** the summary result and the Mission Control crew-card status are a 24px-radius band (16px on cards) filled with the status tone, a white mark and white words. Metric tiles and observations put a small colored mark beside the label.

### Emergency Screen
The whole viewport turns Signal Red with white header type at display tightness. A Route Yellow priority band carries the priority action, and white sheets carry the current step, crew notification, Mission Control link and patient. When resolved, the screen returns to cream water with a Forest Clear badge.

### Motion
Every product animation predates this world and is kept: breathing indicator dots (3.2s), the camera scan line (2.4s linear), the drawer spring, headline swaps (0.35s), the route-step fill, and the grid column shift during check-in. The lobe settle is the only motion this world adds. A global reduced-motion rule collapses animation and transition durations.

## Do's and Don'ts

### Do:
- **Do** give each screen one dominant land lobe on cream water, bleeding off an edge or opened in its middle, and let its coastline divide the screen.
- **Do** set the single most important statement on the lobe in display type (0.95 leading, -0.06em) in Map Ink.
- **Do** use Map Ink for text on every capsule, and keep coral and blue to short labels.
- **Do** show health status as status tone plus StatusMark shape plus words, every time.
- **Do** keep every glyph at weight 600 and use tabular figures only on numeric readouts.
- **Do** keep controls at least 44px tall with the 3px ink focus outline.
- **Do** skip the lobe settle under reduced motion, and leave existing animations as they are.

### Don't:
- **Don't** use land green, or any capsule color, to mean healthy, normal or safe.
- **Don't** shade the map: no gradients, glows, glass, blur or textured fills on land, water or sheets.
- **Don't** use Signal Red except for urgent status and emergency controls or surfaces.
- **Don't** introduce a second typeface or weight; Inter at 600 is the whole type system.
- **Don't** turn the booth into a dark navy or glowing glass-card console.
- **Don't** put small uppercase tracked labels above headings; labels are 13px sentence-case lines below or beside what they describe.
