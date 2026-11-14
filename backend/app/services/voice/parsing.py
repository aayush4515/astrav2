"""Rule-based natural-language parsing of spoken answers (numbers, yes/no, mood, symptoms, body parts).

Deliberately deterministic: clinical questionnaire logic must not depend on a generative model.
"""

from __future__ import annotations

import re

NUMBER_WORDS = {
    "zero": 0, "one": 1, "won": 1, "two": 2, "to": None, "too": None, "three": 3, "four": 4, "for": None,
    "five": 5, "six": 6, "seven": 7, "eight": 8, "ate": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}


def normalize(text: str) -> str:
    t = text.lower().strip()
    t = re.sub(r"[’`]", "'", t)
    t = re.sub(r"[^a-z0-9'./%\- ]+", " ", t)
    t = t.replace("check in", "check-in").replace("checkin", "check-in")
    return re.sub(r"\s+", " ", t).strip(" .")


def _word_numbers(t: str) -> list[float]:
    out: list[float] = []
    tokens = re.findall(r"\d+(?:\.\d+)?|[a-z]+(?:-[a-z]+)?", t)
    for i, tok in enumerate(tokens):
        if re.fullmatch(r"\d+(?:\.\d+)?", tok):
            out.append(float(tok))
            continue
        base = tok.split("-")[0]
        if NUMBER_WORDS.get(base) is not None:
            val = float(NUMBER_WORDS[base])
            rest = " ".join(tokens[i + 1:i + 4])
            if rest.startswith("and a half") or rest.startswith("point five"):
                val += 0.5
            out.append(val)
    return out


def parse_number(text: str, lo: float, hi: float) -> float | None:
    t = normalize(text)
    t = re.sub(r"(out of|of|over|/)\s*(ten|10)\b", "", t)
    t = t.replace("half past", "")
    if re.search(r"\bhalf (an|a) hour\b", t):
        return 0.5 if lo <= 0.5 <= hi else None
    nums = [n for n in _word_numbers(t) if lo <= n <= hi]
    if not nums:
        return None
    # "six or seven" / "between six and seven" -> midpoint
    if len(nums) >= 2 and re.search(r"\b(or|to|and|between)\b", t) and abs(nums[1] - nums[0]) <= 2:
        return (nums[0] + nums[1]) / 2
    return nums[0]


def parse_rating(text: str) -> int | None:
    v = parse_number(text, 1, 10)
    if v is None:
        t = normalize(text)
        if re.search(r"\b(perfect|excellent|fantastic)\b", t):
            return 9
        if re.search(r"\b(terrible|awful|horrible)\b", t):
            return 2
        return None
    return int(v + 0.5)  # round half up: "six or seven" -> 7


_YES = r"\b(yes|yeah|yep|yup|ya|sure|correct|affirmative|absolutely|definitely|i do|i am|i have|i did|a little|a bit|somewhat|kind of|kinda|sort of|slightly|indeed|right|ok let's|okay let's|let's do it|go ahead|please do)\b"
_NO = r"\b(no|nope|nah|not really|negative|none|not at all|i don't|i do not|i'm not|i am not|i haven't|i have not|i didn't|nothing|never|not today)\b"
_LATER = r"\b(later|remind me|another time|postpone|tomorrow|after|not now)\b"


def parse_yes_no(text: str, allow_later: bool = False) -> str | None:
    t = normalize(text)
    if allow_later and re.search(_LATER, t):
        return "later" if not re.search(r"\bnot now\b", t) else "no"
    no = re.search(_NO, t)
    yes = re.search(_YES, t)
    if no and (not yes or no.start() <= yes.start()):
        return "no"
    if yes:
        return "yes"
    return None


MOOD_LEXICON = {
    1: ["good", "great", "fine", "happy", "excellent", "fantastic", "positive", "energized", "energetic", "content",
        "calm", "relaxed", "motivated", "cheerful", "wonderful", "awesome", "rested", "focused", "well", "better"],
    0: ["okay", "ok", "alright", "all right", "so-so", "so so", "normal", "meh", "average", "neutral", "fair",
        "not bad"],
    -1: ["sad", "down", "low", "anxious", "stressed", "irritable", "lonely", "frustrated", "bored", "depressed",
         "homesick", "angry", "worried", "tense", "upset", "unhappy", "miserable", "bad", "terrible", "awful",
         "exhausted", "overwhelmed", "nervous", "grumpy", "tired", "drained", "sick", "unwell", "rough", "not great",
         "not good", "not well", "not so good"],
}


def parse_mood(text: str) -> dict | None:
    t = normalize(text)
    hits: list[tuple[int, int, str]] = []
    for valence in (-1, 0, 1):  # check negatives first so "not good" wins over "good"
        for w in MOOD_LEXICON[valence]:
            m = re.search(rf"\b{re.escape(w)}\b", t)
            if m and not any(m.start() >= s and m.end() <= s + len(lbl) for _, s, lbl in hits):
                hits.append((valence, m.start(), w))
    if not hits:
        return None
    score = sum(v for v, _, _ in hits)
    valence = 1 if score > 0 else -1 if score < 0 else 0
    label = next((w for v, _, w in sorted(hits, key=lambda h: h[1]) if v == valence), hits[0][2])
    return {"valence": valence, "label": label}


SYMPTOMS = {
    "headache": r"head ?ache|my head hurts|migraine",
    "dizziness": r"dizz|light ?headed|vertigo|room spinning|faint",
    "nausea": r"nause|sick to my stomach|queasy|vomit|throw up",
    "vision_change": r"blur|vision|eyesight|seeing double|double vision|can't see",
    "congestion": r"stuffy|congest|blocked nose|sinus",
    "back_pain": r"back (pain|hurts|ache)|backache",
    "chest_pain": r"chest (pain|hurts|tight|pressure)|pain in my chest",
    "breathing": r"short(ness)? of breath|can't breathe|hard to breathe|breathless|breathing",
    "cough": r"cough",
    "fever": r"fever|chills|feverish|hot and cold",
    "skin": r"rash|itch|skin",
    "sore_throat": r"sore throat|throat hurts",
    "insomnia": r"can't sleep|couldn't sleep|insomnia|trouble sleeping",
    "fatigue": r"tired|fatigue|exhausted|no energy|worn out",
}


def parse_symptoms(text: str) -> list[str]:
    t = normalize(text)
    return [code for code, pat in SYMPTOMS.items() if re.search(pat, t)]


BODY_PARTS = {
    "head": r"\bhead\b|forehead|temple", "eyes": r"\beyes?\b", "neck": r"\bneck\b", "chest": r"\bchest\b",
    "lower_back": r"lower back", "back": r"\bback\b", "shoulder": r"shoulder", "arm": r"\barms?\b",
    "hand": r"\bhands?\b|wrist|finger", "abdomen": r"stomach|abdomen|belly|tummy", "hip": r"\bhips?\b",
    "leg": r"\blegs?\b|thigh|calf", "knee": r"\bknees?\b", "foot": r"\bfeet\b|\bfoot\b|ankle",
}


def parse_body_parts(text: str) -> list[str]:
    t = normalize(text)
    found = [p for p, pat in BODY_PARTS.items() if re.search(pat, t)]
    if "lower_back" in found and "back" in found:
        found.remove("back")
    return found


def is_skip(text: str) -> bool:
    return bool(re.search(r"\b(skip|pass|prefer not|rather not|next question)\b", normalize(text)))
