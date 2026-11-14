"""Adaptive spoken questionnaire: predefined questions + deterministic branching rules.

The engine is UI-independent. Given the answers so far and the objective context of the current
check-in, `next_question` returns the next question (or None when finished).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Callable

from app.services.voice import parsing as p
from app.services.voice.intents import route


@dataclass(frozen=True)
class Question:
    id: str
    text: str
    kind: str  # free_mood | rating | yes_no | symptoms | body_part | choice | free
    hint: str = ""
    choices: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return asdict(self)


Q = {
    q.id: q
    for q in [
        Question("feeling", "How are you feeling today?", "free_mood", "Answer in your own words."),
        Question("health_rating", "How would you rate your overall health today, from one to ten?", "rating",
                 "Say a number from one to ten."),
        Question("recent_exercise", "Your heart rate is higher than your usual resting value. "
                 "Have you exercised in the last thirty minutes?", "yes_no", "Yes or no."),
        Question("fatigue", "Are you experiencing unusual fatigue?", "yes_no", "Yes or no."),
        Question("sleep_quality", "How was your sleep? Rate it from one to ten.", "rating", "One is very poor, ten is excellent."),
        Question("sleep_followup", "Your sleep was shorter than your usual pattern. Was anything disturbing it, "
                 "such as noise, light, temperature, or worry?", "free", "Describe briefly, or say no."),
        Question("pain", "Are you experiencing any pain or discomfort?", "yes_no", "Yes or no."),
        Question("pain_location", "Where do you feel the pain?", "body_part", "For example: lower back, head, knee."),
        Question("pain_severity", "How strong is the pain, from one to ten?", "rating", "One is barely noticeable."),
        Question("mood", "How would you describe your mood?", "free_mood", "For example: calm, stressed, tired, happy."),
        Question("new_symptoms", "Have you noticed any new symptoms, like headaches, dizziness, nausea, or changes in "
                 "your vision?", "symptoms", "Name the symptoms, or say no."),
        Question("dizziness_timing", "When does the dizziness happen: when you move your head, all the time, or "
                 "randomly?", "choice", "Moving, constant, or random.", ("moving", "constant", "random")),
        Question("vision_headache", "Your facial scan showed a change from your reference. Have you noticed headaches "
                 "or any change in your vision?", "yes_no", "Yes or no."),
    ]
}


@dataclass
class Context:
    """Objective information from earlier check-in stages, used for adaptive branching."""

    heart_rate_z: float | None = None
    heart_rate: float | None = None
    sleep_z: float | None = None
    sleep_hours: float | None = None
    facial_flagged: bool = False


Rule = Callable[[dict, Context], bool]

# (question id, condition). Order matters; a question is asked at most once.
FLOW: list[tuple[str, Rule]] = [
    ("feeling", lambda a, c: True),
    ("health_rating", lambda a, c: True),
    ("recent_exercise", lambda a, c: (c.heart_rate_z is not None and c.heart_rate_z >= 2)
     or (c.heart_rate is not None and c.heart_rate > 95)),
    ("fatigue", lambda a, c: not ("fatigue" in (a.get("feeling", {}) or {}).get("symptoms", []))),
    ("sleep_quality", lambda a, c: True),
    ("sleep_followup", lambda a, c: (c.sleep_z is not None and c.sleep_z <= -2)
     or (c.sleep_hours is not None and c.sleep_hours < 6)),
    ("pain", lambda a, c: True),
    ("pain_location", lambda a, c: _val(a, "pain") is True),
    ("pain_severity", lambda a, c: _val(a, "pain") is True),
    ("mood", lambda a, c: not isinstance(_val(a, "feeling"), dict)),
    ("new_symptoms", lambda a, c: True),
    ("dizziness_timing", lambda a, c: "dizziness" in _symptoms(a)),
    ("vision_headache", lambda a, c: c.facial_flagged and not ({"headache", "vision_change"} & set(_symptoms(a)))),
]


def _val(answers: dict, qid: str):
    return (answers.get(qid) or {}).get("value")


def _symptoms(answers: dict) -> list[str]:
    out: list[str] = []
    for a in answers.values():
        out += (a or {}).get("symptoms", [])
    return out


def next_question(answers: dict, ctx: Context) -> Question | None:
    for qid, cond in FLOW:
        if qid not in answers and cond(answers, ctx):
            return Q[qid]
    return None


@dataclass
class ParsedAnswer:
    ok: bool
    value: object = None
    symptoms: list[str] | None = None
    acknowledgement: str = ""
    clarification: str = ""
    command: str | None = None
    derived: dict | None = None  # extra structured values implied by the answer (e.g. chest_pain)

    def stored(self, kind: str) -> dict:
        d = {"type": kind, "value": self.value}
        if self.symptoms:
            d["symptoms"] = self.symptoms
        return d


COMMAND_INTENTS = {"emergency", "repeat", "end_checkin", "go_back", "cancel"}


def parse_answer(q: Question, transcript: str) -> ParsedAnswer:
    t = transcript.strip()
    if not t:
        return ParsedAnswer(False, clarification="I didn't hear anything. " + q.text)
    intent = route(t)
    if intent.name in COMMAND_INTENTS:
        return ParsedAnswer(False, command=intent.name)
    if p.is_skip(t):
        return ParsedAnswer(True, None, acknowledgement="Skipped.")
    symptoms = p.parse_symptoms(t)
    derived: dict | None = {}
    if "chest_pain" in symptoms:
        derived["chest_pain"] = True
    if "fatigue" in symptoms and q.id != "fatigue":
        derived["fatigue"] = True
    derived = derived or None

    if q.kind == "rating":
        v = p.parse_rating(t)
        if v is None:
            return ParsedAnswer(False, clarification="Sorry, I need a number from one to ten. " + q.text)
        return ParsedAnswer(True, v, symptoms, f"Got it, {v}.", derived=derived)
    if q.kind == "yes_no":
        yn = p.parse_yes_no(t)
        if yn is None and (symptoms or p.parse_body_parts(t)):
            yn = "yes"  # "my lower back hurts" answers "any pain?" affirmatively
        if yn is None:
            return ParsedAnswer(False, clarification="Please answer yes or no. " + q.text)
        return ParsedAnswer(True, yn == "yes", symptoms, "Noted.", derived=derived)
    if q.kind == "free_mood":
        mood = p.parse_mood(t)
        if mood is None and not symptoms:
            if len(t.split()) >= 2:  # accept free text even without a recognised mood word
                return ParsedAnswer(True, {"valence": 0, "label": "unspecified", "text": t[:200]}, symptoms, "Thank you.")
            return ParsedAnswer(False, clarification="Could you describe that in a few words? " + q.text)
        value = (mood or {"valence": -1 if symptoms else 0, "label": "unwell" if symptoms else "unspecified"})
        ack = {1: "Good to hear.", 0: "Thank you.", -1: "Thanks for telling me."}[value["valence"]]
        return ParsedAnswer(True, value, symptoms, ack, derived=derived)
    if q.kind == "symptoms":
        yn = p.parse_yes_no(t)
        if symptoms:
            return ParsedAnswer(True, symptoms, symptoms, "Noted: " + ", ".join(s.replace("_", " ") for s in symptoms) + ".",
                                derived=derived)
        if yn == "no":
            return ParsedAnswer(True, [], [], "No new symptoms. Noted.")
        if yn == "yes":
            return ParsedAnswer(False, clarification="Which symptoms have you noticed?")
        return ParsedAnswer(True, [], [], "Noted.", derived={"symptom_text": t[:200]})
    if q.kind == "body_part":
        parts = p.parse_body_parts(t)
        if not parts:
            return ParsedAnswer(False, clarification="Which part of your body? For example, back, head, or knee.")
        derived = {"chest_pain": True} if "chest" in parts else derived
        return ParsedAnswer(True, parts, symptoms, "Noted: " + ", ".join(x.replace("_", " ") for x in parts) + ".",
                            derived=derived)
    if q.kind == "choice":
        low = p.normalize(t)
        for c in q.choices:
            if c in low or (c == "moving" and ("move" in low or "turn" in low or "stand" in low)) or (
                    c == "constant" and ("all the time" in low or "always" in low)):
                return ParsedAnswer(True, c, symptoms, "Noted.")
        return ParsedAnswer(False, clarification="Please say moving, constant, or random.")
    # free text
    yn = p.parse_yes_no(t)
    return ParsedAnswer(True, {"text": t[:300], "none": yn == "no"}, symptoms, "Thank you.", derived=derived)
