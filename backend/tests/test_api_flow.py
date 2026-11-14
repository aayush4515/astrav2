from app.models import Astronaut, CheckIn, QuestionnaireResponse, SensorReading
from tests.conftest import astronaut_headers

ANSWERS = {
    "feeling": "I feel good", "health_rating": "about seven", "fatigue": "no", "sleep_quality": "eight",
    "pain": "no", "mood": "calm", "new_symptoms": "nothing new", "recent_exercise": "no",
    "sleep_followup": "no", "pain_location": "knee", "pain_severity": "two", "dizziness_timing": "random",
    "vision_headache": "no",
}


def run_checkin(client, headers, answers=ANSWERS):
    r = client.post("/api/checkins", headers=headers)
    assert r.status_code == 201, r.text
    start = r.json()
    cid = start["checkin"]["id"]
    for step in start["sensor_plan"]:
        res = client.post(f"/api/checkins/{cid}/sensors/{step['device']}", headers=headers).json()
        assert res["status"] in ("ok", "fault")
    voc = client.post(f"/api/checkins/{cid}/voc", headers=headers).json()
    asked = []
    for _ in range(20):
        nxt = client.get(f"/api/checkins/{cid}/questionnaire/next", headers=headers).json()
        if nxt["done"]:
            break
        q = nxt["question"]
        asked.append(q["id"])
        r = client.post(f"/api/checkins/{cid}/questionnaire/answer", headers=headers,
                        json={"question_id": q["id"], "transcript": answers.get(q["id"], "no")}).json()
        assert r["accepted"], (q, r)
    result = client.post(f"/api/checkins/{cid}/complete", headers=headers).json()
    return cid, start, voc, asked, result


def test_unauthenticated_access_is_rejected(client):
    assert client.post("/api/checkins").status_code == 401
    assert client.get("/api/me/insights").status_code == 401
    assert client.get("/api/mission-control/overview").status_code == 401


def test_normal_checkin_persists_and_analyzes(client, operator, db):
    h = astronaut_headers(client, operator, "AST-001")
    cid, start, voc, asked, result = run_checkin(client, h)
    assert start["greeting"].startswith("Welcome back, Commander Alex")
    assert result["status_level"] in ("clear", "watch")
    assert "heart_rate" in result["metrics"] and result["metrics"]["heart_rate"]["simulated"] is True
    assert result["metrics"]["resting_heart_rate"]["baseline"] is not None
    assert result["report"]["status"] in ("queued", "in_transit")
    assert db.get(CheckIn, cid).status == "completed"
    assert db.query(SensorReading).filter_by(checkin_id=cid).count() >= 12
    assert db.query(QuestionnaireResponse).filter_by(checkin_id=cid, question_id="health_rating").one().value["value"] == 7
    # Another astronaut's token cannot read this check-in.
    h2 = astronaut_headers(client, operator, "AST-002")
    assert client.get(f"/api/checkins/{cid}", headers=h2).status_code == 404


def test_gradual_change_is_flagged_with_followups(client, operator):
    h = astronaut_headers(client, operator, "AST-002")  # seeded scenario: gradual_change
    answers = {**ANSWERS, "feeling": "pretty tired honestly", "fatigue": "yes", "health_rating": "five",
               "sleep_quality": "three", "mood": "stressed"}
    _, _, _, asked, result = run_checkin(client, h, answers)
    assert "sleep_followup" in asked
    titles = [o["title"] for o in result["observations"]]
    assert "Combined change in recovery indicators" in titles
    assert result["status_level"] in ("watch", "review")
    assert any(g["id"] in ("sleep_hygiene", "recovery_followup") for g in result["guidance"])


def test_voc_anomaly_scenario(client, operator):
    h = astronaut_headers(client, operator, "AST-003")  # seeded scenario: voc_anomaly
    _, _, voc, _, result = run_checkin(client, h)
    assert voc["analysis"]["flagged"] is True
    assert voc["simulated"] is True
    assert any(o["experimental"] for o in result["observations"])


def test_acute_event_triggers_urgent(client, operator, db):
    a = db.get(Astronaut, "AST-004")
    old = a.scenario
    a.scenario = "acute_event"
    db.commit()
    try:
        h = astronaut_headers(client, operator, "AST-004")
        _, _, _, _, result = run_checkin(client, h)
        assert result["status_level"] == "urgent"
        assert result["guidance"][0]["id"] == "urgent_medical"
        assert result["report"]["priority"] == "critical"
    finally:
        a.scenario = old
        db.commit()


def test_sensor_fault_is_reported(client, operator, db):
    a = db.get(Astronaut, "AST-001")
    a.scenario = "sensor_fault"
    db.commit()
    try:
        h = astronaut_headers(client, operator, "AST-001")
        cid = client.post("/api/checkins", headers=h).json()["checkin"]["id"]
        res = client.post(f"/api/checkins/{cid}/sensors/vitals_module", headers=h).json()
        assert res["status"] == "fault"
        client.post(f"/api/checkins/{cid}/cancel", headers=h, json={"reason": "test"})
    finally:
        a.scenario = "normal"
        db.commit()


def test_duplicate_detection_resumes_checkin(client, operator):
    h = astronaut_headers(client, operator, "AST-002")
    a = client.post("/api/checkins", headers=h).json()
    b = client.post("/api/checkins", headers=h).json()
    assert a["checkin"]["id"] == b["checkin"]["id"] and b["checkin"]["resumed"] is True
    client.post(f"/api/checkins/{a['checkin']['id']}/cancel", headers=h, json={"reason": "test"})


def test_blood_test_workflow(client, operator):
    client.post("/api/demo/astronauts/AST-003/blood-test-due", headers=operator)
    h = astronaut_headers(client, operator, "AST-003")
    sched = client.get("/api/blood-tests/schedule", headers=h).json()
    assert sched["due_now"] is True
    # Defer, then accept
    deferred = client.post("/api/blood-tests/respond", headers=h, json={"answer": "later"}).json()
    assert deferred["schedule"]["status"] == "snoozed"
    test = client.post("/api/blood-tests", headers=h, json={"checkin_id": None}).json()
    res = client.post(f"/api/blood-tests/{test['id']}/analyze", headers=h).json()
    assert set(res["test"]["results"]) == {"hemoglobin", "hematocrit", "glucose", "wbc", "lymphocytes_pct"}
    assert res["schedule"]["due_now"] is False
    assert client.post(f"/api/blood-tests/{test['id']}/analyze", headers=h).status_code == 409


def test_voice_assistant_answers_from_state(client, operator):
    h = astronaut_headers(client, operator, "AST-001")
    r = client.post("/api/voice/ask", headers=h, json={"text": "What's my heart rate?"}).json()
    assert r["intent"] == "query_metric" and "heart rate" in r["speech"].lower()
    r = client.post("/api/voice/ask", headers=h, json={"text": "Show my sleep history"}).json()
    assert r["ui"]["action"] == "open_details" and r["ui"]["metric"] == "sleep_duration"
    r = client.post("/api/voice/ask", headers=h, json={"text": "When is my next blood test?"}).json()
    assert "blood" in r["speech"].lower()
    r = client.post("/api/voice/ask", headers=h, json={"text": "how am I doing"}).json()
    assert r["speech"].startswith("Your latest assessment")


def test_insights(client, operator):
    h = astronaut_headers(client, operator, "AST-002")
    data = client.get("/api/me/insights", headers=h).json()
    assert data["astronaut"]["id"] == "AST-002"
    assert len(data["series"]["resting_heart_rate"]) > 10
    assert data["labs"] and data["checkins"]


def test_recollection_does_not_duplicate_readings(client, operator, db):
    h = astronaut_headers(client, operator, "AST-001")
    cid = client.post("/api/checkins", headers=h).json()["checkin"]["id"]
    for _ in range(2):
        client.post(f"/api/checkins/{cid}/sensors/vitals_module", headers=h)
        client.post(f"/api/checkins/{cid}/voc", headers=h)
    assert db.query(SensorReading).filter_by(checkin_id=cid, metric="heart_rate").count() == 1
    from app.models import VocMeasurement
    assert db.query(VocMeasurement).filter_by(checkin_id=cid).count() == 1
    client.post(f"/api/checkins/{cid}/cancel", headers=h, json={"reason": "test"})
