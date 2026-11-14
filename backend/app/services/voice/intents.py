"""Structured voice-command intent router (ordered regex rules, emergency first)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.voice.parsing import normalize, parse_yes_no

METRIC_WORDS: list[tuple[str, str]] = [
    (r"resting heart", "resting_heart_rate"),
    (r"heart ?rate variability|\bhrv\b|variability", "hrv_rmssd"),
    (r"heart ?rate|pulse|heart", "heart_rate"),
    (r"blood pressure|\bbp\b|pressure", "systolic_bp"),
    (r"oxygen|saturation|spo2|sp o2", "spo2"),
    (r"temperature|fever", "body_temperature"),
    (r"breathing|respirat", "respiratory_rate"),
    (r"weight|mass", "body_mass"),
    (r"sleep", "sleep_duration"),
    (r"exercise|activity|workout", "exercise_minutes"),
]

SECTION_WORDS: list[tuple[str, str]] = [
    (r"facial|face|scan of my face", "facial"),
    (r"\bvoc\b|odou?r|smell|chemical|fingerprint|e-?nose|nose", "voc"),
    (r"blood test|lab|laboratory|blood work|bloodwork", "labs"),
    (r"body|anatomy|organ", "body"),
    (r"recommend|guidance|advice|tips", "guidance"),
    (r"history|trend|chart|graph", "trends"),
    (r"cardio|heart|blood pressure", "cardiovascular"),
    (r"respiratory|lungs|breathing|oxygen", "respiratory"),
    (r"musculoskeletal|bone|muscle|weight|mass|exercise", "musculoskeletal"),
    (r"mood|wellbeing|well-being|mental|sleep", "wellbeing"),
]


@dataclass
class Intent:
    name: str
    params: dict = field(default_factory=dict)
    confidence: float = 1.0

    def to_dict(self) -> dict:
        return {"intent": self.name, "params": self.params, "confidence": self.confidence}


def _find(table: list[tuple[str, str]], t: str) -> str | None:
    for pat, key in table:
        if re.search(pat, t):
            return key
    return None


RULES: list[tuple[str, str]] = [
    ("emergency", r"\bemergency\b|medical help|help my crew|crew ?mate|help (me|us) now|i need help|mayday|"
                  r"call for help|(has |he |she |they )?collapsed|unconscious|not breathing|activate emergency"),
    ("end_checkin", r"\b(end|stop|finish|cancel|quit|close) (the |my )?(check-in|session|assessment)\b|"
                    r"\bgoodbye\b|\bthat's all\b|\bi'm done\b|\bi am done\b|\blog ?out\b|\bsign out\b"),
    ("cancel", r"^(cancel|stop|abort)\b|\bdon't start\b|\bnot now\b"),
    ("repeat", r"\brepeat\b|say (that|it) again|\bagain\b|what did you say|\bpardon\b|come again|didn't (hear|catch)"),
    ("go_back", r"\bgo back\b|\bprevious\b|^back$"),
    ("next_blood_test", r"(when|what).*(next|upcoming).*(blood|lab)|next blood test|blood test due"),
    ("show_labs", r"blood test results?|lab(oratory)? results?|my labs|blood work|bloodwork"),
    ("what_changed", r"what('s| has| have)? changed|compared (to|with)|difference since|since (yesterday|last week)"),
    ("recommendation", r"what should i do|recommendation|next steps?|what do i do|what now"),
    ("how_am_i", r"how am i( doing)?|my status|overall|how('s| is) my health|summary"),
    ("explain", r"\bexplain\b|\bwhy\b|what does (that|this) mean|tell me more|more detail|elaborate"),
    ("query_metric", r"what('s| is| was) my|tell me my|read (me )?my"),
    ("close_details", r"close (the )?(details|insights|dashboard|panel)|hide (the )?(details|insights)"),
    ("open_details", r"(show|open|display|view|see|bring up).*(detail|insight|dashboard|history|trend|chart|"
                     r"result|measurement|body|face|facial|voc|odou?r|lab|blood|sleep|heart|cardio|respir|"
                     r"musculo|mood|recommend)|^(show|open) "),
    ("start_checkin", r"start (my |the |a )?(check-in|assessment)|begin (my |the )?(check-in|assessment)|"
                      r"let's (start|begin)|^start$|^begin$"),
    ("continue", r"\bcontinue\b|\bnext\b|\bgo on\b|\bproceed\b|\bskip\b|\bkeep going\b|\bmove on\b"),
    ("home", r"go home|main screen|home screen|stand ?by"),
    ("help", r"what can i say|list (of )?commands|\bcommands\b|how does this work"),
]


def route(text: str, context: str | None = None) -> Intent:
    t = normalize(text)
    if not t:
        return Intent("none", confidence=0.0)
    if context == "confirm":
        yn = parse_yes_no(t, allow_later=True)
        if yn and not re.search(RULES[0][1], t):
            return Intent({"yes": "affirm", "no": "deny", "later": "defer"}[yn])
    for name, pattern in RULES:
        if re.search(pattern, t):
            params: dict = {}
            if name in {"explain", "query_metric", "open_details", "what_changed"}:
                metric = _find(METRIC_WORDS, t)
                section = _find(SECTION_WORDS, t)
                if metric:
                    params["metric"] = metric
                if section:
                    params["section"] = section
                if name == "what_changed":
                    params["period"] = "week" if "week" in t else "yesterday"
            if name == "query_metric" and "metric" not in params:
                if "section" in params:
                    return Intent("open_details", params, 0.7)
                continue
            if name == "emergency" and re.search(r"crew ?mate|my crew|he |she |they ", t):
                params["for_crewmate"] = True
            return Intent(name, params)
    yn = parse_yes_no(t, allow_later=True)
    if yn:
        return Intent({"yes": "affirm", "no": "deny", "later": "defer"}[yn], confidence=0.6)
    return Intent("unknown", confidence=0.0)


HELP_TEXT = (
    "You can say: repeat, continue, explain, how am I doing, what changed since yesterday, show my heart-rate "
    "history, explain my facial scan, explain my odor fingerprint, when is my next blood test, show details, "
    "end check-in, or emergency."
)
