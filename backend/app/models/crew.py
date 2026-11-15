from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.base import new_id, utcnow


class Astronaut(Base):
    __tablename__ = "astronauts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # crew ID, e.g. AST-001
    full_name: Mapped[str] = mapped_column(String(120))
    preferred_name: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(40), default="")  # e.g. Commander
    role: Mapped[str] = mapped_column(String(80))
    mission: Mapped[str] = mapped_column(String(120))
    date_of_birth: Mapped[str | None] = mapped_column(String(10), nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    face_enrolled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Deterministic demo scenario used by the simulated sensors for live check-ins.
    scenario: Mapped[str] = mapped_column(String(40), default="normal")
    synthetic_profile: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    enrollments: Mapped[list[FacialEnrollment]] = relationship(
        back_populates="astronaut", cascade="all, delete-orphan"
    )

    @property
    def display_name(self) -> str:
        return f"{self.title} {self.preferred_name}".strip()


class FacialEnrollment(Base):
    """One biometric template (SFace embedding). Raw images are never stored."""

    __tablename__ = "facial_enrollments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    embedding: Mapped[bytes] = mapped_column(LargeBinary)
    model: Mapped[str] = mapped_column(String(60))
    quality: Mapped[float] = mapped_column(Float)
    yaw_deg: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    astronaut: Mapped[Astronaut] = relationship(back_populates="enrollments")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256 of bearer token
    astronaut_id: Mapped[str | None] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), nullable=True)
    role: Mapped[str] = mapped_column(String(20))  # astronaut | operator
    method: Mapped[str] = mapped_column(String(30))  # face | operator_recovery | operator_pin
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(60))
    astronaut_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # blood_test | checkin | follow_up
    title: Mapped[str] = mapped_column(String(160))
    due_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | snoozed | done
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    snooze_count: Mapped[int] = mapped_column(Integer, default=0)
    related_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (Index("ix_reminder_due", "astronaut_id", "status", "due_at"),)
