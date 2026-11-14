import time

from app.services.communications import queue as comms


def test_emergency_without_authentication(client):
    r = client.post("/api/emergencies", json={"trigger": "voice", "transcript": "my crewmate collapsed"})
    assert r.status_code == 201
    ev = r.json()
    assert ev["protocol"]["id"] == "collapse_chest_pain"
    assert ev["crew_alerted_at"] is not None
    assert ev["message"]["priority"] == "critical"
    ev = client.post(f"/api/emergencies/{ev['id']}/step", json={"action": "next"}).json()
    assert ev["current_step"] == 1
    ev = client.post(f"/api/emergencies/{ev['id']}/protocol", json={"protocol_id": "chest_pain_self", "patient_id": "AST-001"}).json()
    assert ev["patient"]["id"] == "AST-001" and ev["current_step"] == 0
    ev = client.post(f"/api/emergencies/{ev['id']}/resolve").json()
    assert ev["status"] == "resolved"
    assert client.get("/api/emergencies/active").json() is None


def test_queue_survives_outage_and_delivers(client, operator, db):
    client.post("/api/comms/link", json={"link_up": False, "delay_s": 0.2}, headers=operator)
    msg = comms.enqueue(db, kind="checkin_report", subject="test", payload={"x": 1})
    db.commit()
    comms.tick(db)
    db.refresh(msg)
    assert msg.status == "queued"  # link down: stays queued, analysis unaffected
    client.post("/api/comms/link", json={"link_up": True}, headers=operator)
    comms.tick(db)
    db.refresh(msg)
    assert msg.status == "in_transit"
    time.sleep(0.3)
    comms.tick(db)
    db.refresh(msg)
    assert msg.status == "delivered"
    r = client.post(f"/api/mission-control/messages/{msg.id}/ack", json={"by": "Surgeon"}, headers=operator)
    assert r.json()["status"] == "acknowledged"


def test_link_loss_in_transit_requeues(db, client, operator):
    client.post("/api/comms/link", json={"link_up": True, "delay_s": 60}, headers=operator)
    msg = comms.enqueue(db, kind="checkin_report", subject="t2", payload={})
    db.commit()
    comms.tick(db)
    db.refresh(msg)
    assert msg.status == "in_transit"
    client.post("/api/comms/link", json={"link_up": False}, headers=operator)
    db.refresh(msg)
    assert msg.status == "queued"
    client.post("/api/comms/link", json={"link_up": True, "delay_s": 12}, headers=operator)


def test_mission_control_only_shows_delivered(client, operator):
    ov = client.get("/api/mission-control/overview", headers=operator).json()
    for c in ov["crew"]:
        if c["last_report"]:
            assert c["last_report"]["status"] in ("delivered", "acknowledged")
