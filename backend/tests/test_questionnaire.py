from app.services.voice import questionnaire as qn


def _answer(answers, qid, transcript):
    q = qn.Q[qid]
    r = qn.parse_answer(q, transcript)
    assert r.ok, (qid, transcript, r)
    answers[qid] = r.stored(q.kind)
    for k, v in (r.derived or {}).items():
        answers.setdefault(k, {"type": "derived", "value": v})
    return r


def test_basic_flow_order():
    ctx = qn.Context(heart_rate_z=0.1, heart_rate=64, sleep_z=0.0, sleep_hours=7.4)
    a: dict = {}
    seen = []
    script = {"feeling": "I feel good", "health_rating": "about eight", "fatigue": "no", "sleep_quality": "seven",
              "pain": "no", "new_symptoms": "nothing new"}
    while (q := qn.next_question(a, ctx)) is not None:
        seen.append(q.id)
        _answer(a, q.id, script[q.id])
    assert seen == ["feeling", "health_rating", "fatigue", "sleep_quality", "pain", "new_symptoms"]
    assert a["health_rating"]["value"] == 8


def test_adaptive_branches():
    ctx = qn.Context(heart_rate_z=3.1, heart_rate=88, sleep_z=-2.5, sleep_hours=5.2, facial_flagged=True)
    a: dict = {}
    seen = []
    script = {"feeling": "hmm, kind of meh", "health_rating": "5", "recent_exercise": "no",
              "fatigue": "yes", "sleep_quality": "three", "sleep_followup": "the fans were loud",
              "pain": "my lower back hurts", "pain_location": "lower back", "pain_severity": "four",
              "new_symptoms": "I've been dizzy", "dizziness_timing": "when I move my head",
              "vision_headache": "no"}
    while (q := qn.next_question(a, ctx)) is not None:
        seen.append(q.id)
        _answer(a, q.id, script[q.id])
    for expected in ("recent_exercise", "sleep_followup", "pain_location", "pain_severity", "dizziness_timing",
                     "vision_headache"):
        assert expected in seen
    assert a["pain"]["value"] is True


def test_commands_and_clarifications():
    r = qn.parse_answer(qn.Q["health_rating"], "repeat the question")
    assert r.command == "repeat"
    r = qn.parse_answer(qn.Q["health_rating"], "I need medical help")
    assert r.command == "emergency"
    r = qn.parse_answer(qn.Q["health_rating"], "banana")
    assert not r.ok and "one to ten" in r.clarification


def test_chest_pain_is_derived():
    r = qn.parse_answer(qn.Q["new_symptoms"], "I have chest pain")
    assert r.derived and r.derived["chest_pain"] is True
