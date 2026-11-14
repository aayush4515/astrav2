"""Predefined, traceable guidance content.

DEMONSTRATION CONTENT — not clinically reviewed. Every entry links to the NASA Human Research Program
risk page that motivates it. Nothing here prescribes medication or invasive procedures.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

HRP_RISKS = "https://www.nasa.gov/hrp/risks/"
HRP_HAZARDS = "https://www.nasa.gov/hrp/hazards/"

TIERS = {
    "routine": "Routine preventive advice",
    "confirm": "Repeat or confirm a measurement",
    "review": "Non-urgent crew medical review",
    "urgent": "Urgent escalation",
}


@dataclass(frozen=True)
class Guidance:
    id: str
    tier: str
    category: str
    title: str
    spoken: str
    steps: tuple[str, ...]
    why: str
    source: str = HRP_RISKS
    demo_only: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


LIBRARY: dict[str, Guidance] = {
    g.id: g
    for g in [
        Guidance("routine_keep_going", "routine", "general", "Keep your routine",
                 "Your readings match your usual pattern. Keep up your exercise, hydration and sleep routine.",
                 ("Complete today's scheduled exercise.", "Drink water regularly through the day.",
                  "Keep your planned sleep period."),
                 "Consistent countermeasures are the main protection against deconditioning in flight."),
        Guidance("sleep_hygiene", "routine", "sleep", "Protect your sleep period",
                 "Your sleep has dropped below your usual pattern. Try to protect your next sleep period: dim cabin "
                 "lights an hour before, avoid screens, and use your eye mask and earplugs.",
                 ("Dim lights 60 minutes before sleep.", "Avoid caffeine in the 6 hours before sleep.",
                  "Use eye mask and earplugs.", "Report persistent sleep loss at the next crew medical conference."),
                 "Sleep loss and circadian misalignment are a recognized spaceflight risk to performance and health.",
                 "https://www.nasa.gov/hrp/hazards/"),
        Guidance("recovery_followup", "review", "fatigue", "Recovery follow-up",
                 "Several recovery indicators have moved away from your baseline at the same time. Consider a lighter "
                 "workload today if the schedule allows, and discuss this pattern with the crew medical officer.",
                 ("Repeat the check-in at your next scheduled session.",
                  "Discuss the pattern with the crew medical officer.",
                  "Flag the trend to flight surgeons in the next medical conference."),
                 "Combined changes in resting heart rate, heart-rate variability, sleep and fatigue are more meaningful "
                 "than any single reading."),
        Guidance("hydration_nutrition", "routine", "nutrition", "Hydration and nutrition",
                 "Your body mass is trending down. Make sure you are eating your full planned menu and drinking enough.",
                 ("Log every meal in the food tracker today.", "Drink your full daily water allotment.",
                  "Ask the crew medical officer for a nutrition review if the trend continues."),
                 "Inadequate food intake and weight loss are documented risks on long missions."),
        Guidance("exercise_adherence", "routine", "musculoskeletal", "Exercise countermeasures",
                 "Your exercise time has been below plan. Resistive and aerobic exercise protects bone and muscle.",
                 ("Complete your resistive-exercise session today.", "Add your aerobic session if time allows."),
                 "Bone and muscle loss in reduced gravity are mitigated primarily by exercise."),
        Guidance("temperature_watch", "review", "temperature", "Elevated temperature",
                 "Your temperature is higher than your usual range. Rest, drink fluids, and repeat the measurement in "
                 "one hour. Inform the crew medical officer, and limit close contact with crewmates until reviewed.",
                 ("Repeat the temperature measurement in 60 minutes.", "Rest and drink fluids.",
                  "Inform the crew medical officer.", "Limit close contact with crewmates until reviewed."),
                 "Spaceflight alters immune function; early signs of infection should be reviewed promptly."),
        Guidance("vision_check", "review", "vision", "Vision-related follow-up",
                 "A facial measurement has changed compared with your reference. If you also notice blurred vision or "
                 "headaches, complete the onboard vision checklist and inform the crew medical officer.",
                 ("Repeat the facial scan under the same lighting and position.",
                  "Complete the onboard visual-acuity check if you notice vision changes.",
                  "Inform the crew medical officer if symptoms persist."),
                 "Spaceflight Associated Neuro-ocular Syndrome (SANS) is a recognized risk on long missions. A webcam "
                 "cannot detect it; symptoms and proper eye exams can."),
        Guidance("mood_support", "routine", "behavioral", "Behavioral health support",
                 "Your mood has been lower than usual. Consider scheduling a private conference with your support team, "
                 "a call with family, or time on a personal activity you enjoy.",
                 ("Schedule a private psychological conference.", "Plan time for a personal activity today.",
                  "Talk with a crewmate you trust."),
                 "Isolation and confinement are one of the five hazards of human spaceflight.", HRP_HAZARDS),
        Guidance("repeat_measurement", "confirm", "measurement", "Repeat the measurement",
                 "One reading was unusual or unavailable. Please repeat it at your next check-in under the same "
                 "conditions before drawing conclusions.",
                 ("Repeat at the next check-in.", "Use the same posture, time of day and conditions."),
                 "Single readings can be affected by sensor placement, motion or recent activity."),
        Guidance("voc_repeat", "confirm", "experimental", "Repeat the VOC scan",
                 "Your chemical fingerprint changed. Avoid hygiene products and food for an hour, then repeat the scan.",
                 ("Avoid hygiene products, food and exercise for 60 minutes.", "Repeat the e-nose scan."),
                 "Electronic-nose readings are experimental and easily affected by the environment."),
        Guidance("crew_medical_review", "review", "general", "Crew medical review",
                 "Please arrange a review with the crew medical officer today. A report has been queued for flight "
                 "surgeons on Earth.",
                 ("Contact the crew medical officer.", "Keep the booth report available for the review."),
                 "Some combinations of findings warrant a human medical review."),
        Guidance("urgent_medical", "urgent", "general", "Get crew medical help now",
                 "Some readings are outside safe ranges. Alert the crew medical officer now. If you feel chest pain, "
                 "shortness of breath or faintness, say emergency.",
                 ("Alert the crew medical officer immediately.", "Stay still and do not exercise.",
                  "Say 'emergency' or press the emergency button if symptoms worsen."),
                 "Readings outside general safety ranges require immediate human assessment."),
        Guidance("co2_environment", "routine", "environment", "Cabin CO₂ is elevated",
                 "Cabin carbon dioxide is higher than usual and may contribute to headaches. Notify the crew member "
                 "responsible for life support and improve local airflow.",
                 ("Notify life-support crew.", "Move to a well-ventilated module if possible."),
                 "Hostile closed environments are one of the five hazards of human spaceflight.", HRP_HAZARDS),
        Guidance("lab_review", "review", "labs", "Lab result review",
                 "One or more blood markers are outside the expected range or your usual values. A crew medical "
                 "review of the lab panel is suggested.",
                 ("Review the lab panel with the crew medical officer.", "Repeat at the next scheduled test."),
                 "Immune and blood changes are documented in long-duration spaceflight."),
    ]
}


def get(gid: str) -> Guidance:
    return LIBRARY[gid]
