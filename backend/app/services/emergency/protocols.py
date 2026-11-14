"""Predefined emergency decision-support protocols.

DEMONSTRATION CONTENT. Generic basic-life-support style actions only: no medication doses, no invasive
procedures, no diagnoses. Real missions follow approved onboard medical checklists and flight-surgeon direction.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Step:
    title: str
    instruction: str


@dataclass(frozen=True)
class Protocol:
    id: str
    title: str
    voice_phrases: tuple[str, ...]
    priority_action: str
    steps: tuple[Step, ...]
    for_crewmate: bool

    def to_dict(self) -> dict:
        return asdict(self)


PROTOCOLS: dict[str, Protocol] = {
    p.id: p
    for p in [
        Protocol(
            "collapse_chest_pain", "Crewmate collapsed after chest pain",
            ("collapsed", "unconscious", "not breathing", "fainted", "passed out", "crewmate"),
            "Alert the crew and check breathing now.",
            (
                Step("Crew alerted", "All crew have been alerted. The crew medical officer should come to the patient now."),
                Step("Secure yourself and the patient",
                     "Anchor yourself and the patient using foot restraints or handrails so you both stay in place."),
                Step("Check response and breathing",
                     "Tap the shoulders and call their name. Look for normal breathing for no more than ten seconds."),
                Step("If not breathing normally: start CPR",
                     "Start chest compressions following the onboard CPR procedure for microgravity. Send a crewmate "
                     "for the defibrillator in the medical kit and follow its spoken prompts."),
                Step("If breathing: monitor",
                     "Keep the patient still, attach the vitals monitor, and watch breathing continuously."),
                Step("Follow the medical checklist",
                     "Open the onboard emergency medical checklist. The emergency report is queued for flight surgeons."),
            ),
            True,
        ),
        Protocol(
            "chest_pain_self", "Chest pain (conscious)",
            ("chest pain", "my chest", "heart attack", "chest hurts", "chest tight"),
            "Stop all activity and alert the crew medical officer.",
            (
                Step("Crew alerted", "The crew has been alerted. Stop what you are doing and stay still."),
                Step("Get to a stable position", "Anchor yourself in a comfortable, restful position."),
                Step("Measure vital signs", "Attach the vitals module: pulse oximeter and blood-pressure cuff."),
                Step("Follow the cardiac checklist",
                     "The crew medical officer follows the onboard cardiac checklist. Do not take any medication unless "
                     "instructed by the crew medical officer or flight surgeon."),
                Step("If symptoms worsen", "If the patient becomes unresponsive, switch to the collapse protocol."),
            ),
            False,
        ),
        Protocol(
            "breathing_difficulty", "Difficulty breathing",
            ("breathe", "breathing", "short of breath", "choking", "suffocating"),
            "Check the cabin atmosphere and alert the crew.",
            (
                Step("Crew alerted", "The crew has been alerted."),
                Step("Check the atmosphere",
                     "Check cabin oxygen and CO₂ alarms. If an atmosphere hazard is possible, use emergency breathing "
                     "masks and follow the vehicle emergency procedure."),
                Step("Measure oxygen saturation", "Attach the pulse oximeter and read the value aloud."),
                Step("Position and monitor", "Help the patient into a relaxed position and monitor breathing continuously."),
                Step("Follow the medical checklist", "Follow the onboard respiratory checklist and await flight-surgeon guidance."),
            ),
            True,
        ),
        Protocol(
            "injury_bleeding", "Injury or bleeding",
            ("bleeding", "blood", "injury", "injured", "cut", "hit my head", "broken"),
            "Apply firm direct pressure to any bleeding.",
            (
                Step("Crew alerted", "The crew has been alerted."),
                Step("Control bleeding", "Wear gloves. Apply firm, direct pressure with gauze from the medical kit. "
                     "Contain floating droplets with absorbent material."),
                Step("Check for head injury", "If the head was struck, check responsiveness and watch for confusion."),
                Step("Immobilize", "Do not move a possibly injured limb or neck more than necessary; restrain the patient."),
                Step("Follow the trauma checklist", "Follow the onboard trauma checklist."),
            ),
            True,
        ),
    ]
}


def match_protocol(text: str) -> str | None:
    t = text.lower()
    best = None
    for p in PROTOCOLS.values():
        if any(phrase in t for phrase in p.voice_phrases):
            best = p.id
            break
    return best
