import pytest

from app.services.voice import parsing as p
from app.services.voice.intents import route


@pytest.mark.parametrize("text,expected", [
    ("I'd say about seven.", 7), ("Seven out of ten", 7), ("8/10", 8), ("probably a 6", 6),
    ("six or seven", 7), ("ten", 10), ("maybe five, I guess", 5), ("perfect", 9), ("banana", None),
])
def test_rating(text, expected):
    assert p.parse_rating(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("Yes.", "yes"), ("Yeah, a little bit", "yes"), ("No.", "no"), ("Not really", "no"), ("Nope", "no"),
    ("I don't think so", "no"), ("hmm", None),
])
def test_yes_no(text, expected):
    assert p.parse_yes_no(text) == expected


def test_yes_no_later():
    assert p.parse_yes_no("remind me later", allow_later=True) == "later"
    assert p.parse_yes_no("not now", allow_later=True) == "no"


def test_mood():
    assert p.parse_mood("I'm feeling great today")["valence"] == 1
    assert p.parse_mood("pretty stressed and tired")["valence"] == -1
    assert p.parse_mood("not good")["valence"] == -1
    assert p.parse_mood("okay I guess")["valence"] == 0
    assert p.parse_mood("the quick brown fox") is None


def test_symptoms_and_body_parts():
    assert set(p.parse_symptoms("I have a headache and feel dizzy")) >= {"headache", "dizziness"}
    assert "chest_pain" in p.parse_symptoms("there's some pain in my chest")
    assert p.parse_body_parts("my lower back hurts") == ["lower_back"]


@pytest.mark.parametrize("text,intent", [
    ("I need medical help", "emergency"), ("Emergency!", "emergency"), ("Help my crewmate, he collapsed", "emergency"),
    ("Repeat that", "repeat"), ("Could you say that again?", "repeat"), ("End check-in", "end_checkin"),
    ("What's my heart rate?", "query_metric"), ("Show my health history", "open_details"),
    ("Explain this result", "explain"), ("What changed since yesterday?", "what_changed"),
    ("Show my blood test results", "show_labs"), ("When is my next blood test?", "next_blood_test"),
    ("Open my health dashboard", "open_details"), ("Start my check-in", "start_checkin"), ("Continue", "continue"),
    ("Go back", "go_back"), ("How am I doing today?", "how_am_i"), ("What should I do next?", "recommendation"),
])
def test_intents(text, intent):
    assert route(text).name == intent


def test_intent_params():
    assert route("What's my heart rate?").params["metric"] == "heart_rate"
    assert route("show my sleep history").params["metric"] == "sleep_duration"
    assert route("explain my facial scan").params["section"] == "facial"
    assert route("explain my odor fingerprint results").params["section"] == "voc"
    assert route("what changed compared with last week").params["period"] == "week"
    assert route("help my crewmate").params.get("for_crewmate") is True


def test_confirm_context():
    assert route("yes please", "confirm").name == "affirm"
    assert route("not now", "confirm").name == "deny"
    assert route("remind me later", "confirm").name == "defer"
    assert route("emergency", "confirm").name == "emergency"
