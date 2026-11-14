"""Answers spoken questions ("how am I doing?", "why was my heart rate flagged?") from stored results.

Every sentence is built from validated application state and the predefined guidance library;
nothing is generated free-form.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Astronaut, CheckIn
from app.services.health.views import latest_checkin
from app.services.scheduling import blood_tests
from app.services.sensors.catalog import LAB_MARKERS, METRICS
from app.services.voice.intents import HELP_TEXT, Intent

def _fmt(v: float, unit: str) -> str:
    unit_spoken = {"bpm": "beats per minute", "mmHg": "millimetres of mercury", "%": "percent", "°C": "degrees Celsius",
                   "kg": "kilograms", "h": "hours", "ms": "milliseconds", "/min": "breaths per minute",
                   "min": "minutes"}.get(unit, unit)
    return f"{v:g} {unit_spoken}"


def respond(db: Session, astro: Astronaut, intent: Intent, current_checkin_id: str | None = None) -> dict:
    ci = db.get(CheckIn, current_checkin_id) if current_checkin_id else None
    if ci is None or ci.analysis is None:
        ci = latest_checkin(db, astro.id)
    a = (ci.analysis or {}) if ci else {}
    name = intent.name
    p = intent.params

    if name == "help":
        return {"speech": HELP_TEXT}
    if name == "how_am_i":
        if not a:
            return {"speech": "I don't have a completed assessment yet. Say 'start my check-in' to begin."}
        obs = [o for o in a.get("observations", []) if o["severity"] != "info"]
        text = f"Your latest assessment: {a['status']}."
        if obs:
            text += " Main points: " + "; ".join(o["title"].lower() for o in obs[:3]) + "."
        return {"speech": text, "ui": {"action": "summary"}}
    if name == "recommendation":
        from app.services.guidance.library import LIBRARY

        gids = a.get("guidance_ids") or ["routine_keep_going"]
        g = LIBRARY[gids[0]]
        return {"speech": g.spoken, "ui": {"action": "open_details", "section": "guidance"}}
    if name == "query_metric":
        m = p.get("metric")
        metric = (a.get("metrics") or {}).get(m)
        if not metric:
            return {"speech": f"I don't have a {METRICS[m].label.lower()} reading from your latest check-in.",
                    "ui": {"action": "open_details", "section": "trends", "metric": m}}
        text = f"Your {metric['label'].lower()} is {_fmt(metric['value'], metric['unit'])}."
        if metric.get("baseline") is not None:
            text += f" Your usual value is about {metric['baseline']:g}."
        if metric.get("simulated"):
            text += " This is a simulated reading."
        return {"speech": text, "ui": {"action": "open_details", "section": "trends", "metric": m}}
    if name in {"explain"}:
        return _explain(db, astro, a, p)
    if name == "what_changed":
        return _what_changed(db, astro, ci, a, p.get("period", "yesterday"))
    if name == "next_blood_test":
        info = blood_tests.schedule_info(db, astro.id)
        if info["due_now"]:
            text = "Your weekly blood assessment is due now."
        else:
            text = f"Your next blood assessment is scheduled for {info['next_due'][:10]}."
        return {"speech": text, "ui": {"action": "open_details", "section": "labs"}}
    if name == "show_labs":
        hist = blood_tests.history(db, astro.id)
        if not hist:
            return {"speech": "You have no blood test results yet.", "ui": {"action": "open_details", "section": "labs"}}
        last = hist[-1]
        out = [k for k, r in last["results"].items()
               if (r["ref_low"] is not None and r["value"] < r["ref_low"]) or (r["ref_high"] is not None and r["value"] > r["ref_high"])]
        text = f"Your last blood test was on {last['completed_at'][:10]}. "
        text += ("All markers were in the expected range." if not out else
                 "Outside the expected range: " + ", ".join(LAB_MARKERS[k][0] for k in out) + ".")
        return {"speech": text + " These results are simulated.", "ui": {"action": "open_details", "section": "labs"}}
    if name == "open_details":
        section = p.get("section") or "overview"
        if p.get("metric") and section in {"overview", "trends", "cardiovascular", "respiratory", "wellbeing",
                                           "musculoskeletal"}:
            label = METRICS[p["metric"]].label.lower()
            return {"speech": f"Here is your {label} history.",
                    "ui": {"action": "open_details", "section": "trends", "metric": p["metric"]}}
        spoken = {"facial": "Here is your facial scan history.", "voc": "Here is your odor fingerprint history.",
                  "labs": "Here are your blood test results.", "body": "Here is your body overview.",
                  "guidance": "Here are your recommendations.", "trends": "Here are your health trends.",
                  "overview": "Here are your detailed health insights."}
        if section in {"cardiovascular", "respiratory", "musculoskeletal", "wellbeing"}:
            return {"speech": f"Here are your {section} measurements.",
                    "ui": {"action": "open_details", "section": "body", "region": section}}
        return {"speech": spoken.get(section, "Here are your detailed health insights."),
                "ui": {"action": "open_details", "section": section}}
    if name == "close_details":
        return {"speech": "Closing details.", "ui": {"action": "close_details"}}
    return {"speech": "Sorry, I can't help with that yet. " + HELP_TEXT}


def _explain(db: Session, astro: Astronaut, a: dict, p: dict) -> dict:
    section, metric = p.get("section"), p.get("metric")
    if section == "facial":
        f = a.get("facial")
        text = f.get("explanation") if f else "No facial scan was recorded in your latest check-in."
        return {"speech": text + " A webcam cannot diagnose medical conditions.", "ui": {"action": "open_details", "section": "facial"}}
    if section == "voc":
        v = a.get("voc")
        text = v.get("explanation") if v and v.get("explanation") else "No odor fingerprint was recorded in your latest check-in."
        return {"speech": text, "ui": {"action": "open_details", "section": "voc"}}
    if section == "labs":
        return respond(db, astro, Intent("show_labs"))
    if metric:
        m = (a.get("metrics") or {}).get(metric)
        spec = METRICS[metric]
        if not m:
            return {"speech": f"No {spec.label.lower()} reading in your latest check-in."}
        obs = [o for o in a.get("observations", []) if metric in o.get("metrics", [])]
        if obs:
            text = obs[0]["explanation"]
        elif m.get("z") is not None:
            text = (f"Your {spec.label.lower()} is {_fmt(m['value'], m['unit'])}, within your usual range "
                    f"of about {m['baseline']:g}.")
        else:
            text = f"Your {spec.label.lower()} is {_fmt(m['value'], m['unit'])}. I need more history to compare it."
        return {"speech": text + " " + spec.why, "ui": {"action": "open_details", "section": "trends", "metric": metric}}
    obs = [o for o in a.get("observations", []) if o["severity"] != "info"]
    if not obs:
        return {"speech": "Everything in your latest assessment was consistent with your personal baseline."}
    return {"speech": obs[0]["explanation"], "ui": {"action": "open_details", "section": "overview"}}


def _what_changed(db: Session, astro: Astronaut, ci: CheckIn | None, a: dict, period: str) -> dict:
    if not ci or not a:
        return {"speech": "I don't have a completed assessment to compare yet."}
    target = ci.started_at - timedelta(days=7 if period == "week" else 1)
    prev = db.scalars(select(CheckIn).where(
        CheckIn.astronaut_id == astro.id, CheckIn.status == "completed", CheckIn.period == ci.period,
        CheckIn.started_at <= target + timedelta(hours=6)).order_by(CheckIn.started_at.desc())).first()
    if not prev or not prev.analysis:
        return {"speech": "I don't have an earlier check-in to compare with."}
    changes = []
    for k, m in a.get("metrics", {}).items():
        pm = prev.analysis.get("metrics", {}).get(k)
        if not pm:
            continue
        spread = m.get("spread") or 1
        delta = m["value"] - pm["value"]
        if abs(delta) >= 1.5 * spread:
            changes.append((abs(delta) / spread, f"{m['label'].lower()} {'up' if delta > 0 else 'down'} from "
                                                 f"{pm['value']:g} to {m['value']:g} {m['unit']}"))
    when = "last week" if period == "week" else "yesterday"
    if not changes:
        return {"speech": f"Compared with {when}, nothing changed meaningfully.",
                "ui": {"action": "open_details", "section": "trends"}}
    changes.sort(reverse=True)
    return {"speech": f"Compared with {when}: " + "; ".join(c for _, c in changes[:3]) + ".",
            "ui": {"action": "open_details", "section": "trends"}}
