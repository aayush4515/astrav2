from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.base import KIND_SIMULATED, new_id, utcnow


class CheckIn(Base):
    __tablename__ = "checkins"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    period: Mapped[str] = mapped_column(String(20))  # morning | evening | adhoc
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress|completed|cancelled|failed
    stage: Mapped[str] = mapped_column(String(40), default="CHECKIN_STARTED")
    environment: Mapped[str] = mapped_column(String(40), default="transit_vehicle")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    overall_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    faults: Mapped[list] = mapped_column(JSON, default=list)
    analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    seeded: Mapped[bool] = mapped_column(Boolean, default=False)


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"))
    checkin_id: Mapped[str | None] = mapped_column(ForeignKey("checkins.id", ondelete="CASCADE"), nullable=True)
    metric: Mapped[str] = mapped_column(String(40))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(20))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    device: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(20), default=KIND_SIMULATED)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    quality: Mapped[str] = mapped_column(String(20), default="good")  # good | fair | poor | fault
    context: Mapped[str] = mapped_column(String(30), default="resting")
    valid: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (Index("ix_reading_astro_metric_ts", "astronaut_id", "metric", "timestamp"),)


class EnvironmentReading(Base):
    """Cabin / habitat measurements — kept apart from body measurements on purpose."""

    __tablename__ = "environment_readings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    checkin_id: Mapped[str | None] = mapped_column(ForeignKey("checkins.id", ondelete="CASCADE"), nullable=True)
    astronaut_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    metric: Mapped[str] = mapped_column(String(40))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(20))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    source: Mapped[str] = mapped_column(String(60))
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class FacialObservation(Base):
    __tablename__ = "facial_observations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    checkin_id: Mapped[str | None] = mapped_column(ForeignKey("checkins.id", ondelete="CASCADE"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    features: Mapped[dict] = mapped_column(JSON)
    feature_spread: Mapped[dict] = mapped_column(JSON, default=dict)
    quality: Mapped[dict] = mapped_column(JSON)
    frames_used: Mapped[int] = mapped_column(Integer)
    is_reference: Mapped[bool] = mapped_column(Boolean, default=False)
    valid: Mapped[bool] = mapped_column(Boolean, default=True)
    comparison: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="real_sensor")


class QuestionnaireResponse(Base):
    __tablename__ = "questionnaire_responses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    checkin_id: Mapped[str] = mapped_column(ForeignKey("checkins.id", ondelete="CASCADE"), index=True)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"))
    question_id: Mapped[str] = mapped_column(String(40))
    question_text: Mapped[str] = mapped_column(Text)
    transcript: Mapped[str] = mapped_column(Text)
    value: Mapped[dict] = mapped_column(JSON)  # {"type": "...", "value": ...}
    input_mode: Mapped[str] = mapped_column(String(20), default="voice")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class VoiceInteraction(Base):
    __tablename__ = "voice_interactions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    checkin_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    intent: Mapped[str] = mapped_column(String(40))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    transcript: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PersonalBaseline(Base):
    __tablename__ = "personal_baselines"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    metric: Mapped[str] = mapped_column(String(40))
    context: Mapped[str] = mapped_column(String(30), default="resting")
    median: Mapped[float] = mapped_column(Float)
    mad: Mapped[float] = mapped_column(Float)
    n: Mapped[int] = mapped_column(Integer)
    trend_per_day: Mapped[float | None] = mapped_column(Float, nullable=True)
    window_days: Mapped[int] = mapped_column(Integer)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class VocMeasurement(Base):
    __tablename__ = "voc_measurements"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    checkin_id: Mapped[str | None] = mapped_column(ForeignKey("checkins.id", ondelete="CASCADE"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    channels: Mapped[list] = mapped_column(JSON)
    conditions: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(60))
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    valid: Mapped[bool] = mapped_column(Boolean, default=True)
    analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class BloodTest(Base):
    __tablename__ = "blood_tests"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    checkin_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress|completed|cancelled
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    analyzer: Mapped[str] = mapped_column(String(60), default="Simulated point-of-care analyzer")
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class BloodTestResult(Base):
    __tablename__ = "blood_test_results"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    blood_test_id: Mapped[str] = mapped_column(ForeignKey("blood_tests.id", ondelete="CASCADE"), index=True)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"))
    marker: Mapped[str] = mapped_column(String(40))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(20))
    ref_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    ref_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class HealthObservation(Base):
    __tablename__ = "health_observations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    checkin_id: Mapped[str | None] = mapped_column(ForeignKey("checkins.id", ondelete="CASCADE"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    category: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20))  # info | watch | review | urgent
    method: Mapped[str] = mapped_column(String(30))  # baseline_deviation | trend | pattern | safety_rule | multivariate | experimental
    title: Mapped[str] = mapped_column(String(200))
    explanation: Mapped[str] = mapped_column(Text)
    metrics: Mapped[list] = mapped_column(JSON, default=list)
    comparison: Mapped[dict] = mapped_column(JSON, default=dict)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    uncertainty: Mapped[str | None] = mapped_column(Text, nullable=True)
    guidance_ids: Mapped[list] = mapped_column(JSON, default=list)
    experimental: Mapped[bool] = mapped_column(Boolean, default=False)


class GuidanceRecord(Base):
    __tablename__ = "guidance_records"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    checkin_id: Mapped[str | None] = mapped_column(ForeignKey("checkins.id", ondelete="CASCADE"), nullable=True)
    guidance_id: Mapped[str] = mapped_column(String(60))
    tier: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class EmergencyEvent(Base):
    __tablename__ = "emergency_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reporter: Mapped[str] = mapped_column(String(80), default="crew")
    trigger: Mapped[str] = mapped_column(String(20))  # voice | button
    protocol_id: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | resolved
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    crew_alerted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    log: Mapped[list] = mapped_column(JSON, default=list)
    message_id: Mapped[str | None] = mapped_column(String(32), nullable=True)


class CommunicationMessage(Base):
    __tablename__ = "communication_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(30))  # checkin_report | emergency | lab_report
    priority: Mapped[str] = mapped_column(String(10), default="routine")  # routine | high | critical
    astronaut_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    subject: Mapped[str] = mapped_column(String(200))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="created")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    queued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(60), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    related_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
