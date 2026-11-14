from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FrameIn(BaseModel):
    image: str = Field(..., description="JPEG/PNG as a data URL or base64 string", max_length=3_000_000)
    client_id: str = Field("booth", max_length=64)
    # "presence" only reports whether a face is in view (used after a session ends, before re-arming).
    mode: Literal["identify", "presence"] = "identify"


class AstronautCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    preferred_name: str = Field(..., min_length=1, max_length=60)
    crew_id: str | None = Field(None, pattern=r"^[A-Z]{2,5}-\d{3,4}$")
    title: str = Field("", max_length=40)
    role: str = Field(..., min_length=2, max_length=80)
    mission: str | None = Field(None, max_length=120)
    date_of_birth: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    height_cm: float | None = Field(None, ge=120, le=230)
    baseline_notes: str | None = Field(None, max_length=500)
    generate_demo_history: bool = False


class EnrollmentStart(BaseModel):
    astronaut_id: str


class TicketIn(BaseModel):
    ticket: str


class EnrollmentFrame(FrameIn):
    ticket: str


class OperatorLogin(BaseModel):
    pin: str = Field(..., min_length=1, max_length=32)


class RecoveryIn(BaseModel):
    astronaut_id: str
    reason: str = Field(..., min_length=3, max_length=200)


class AnswerIn(BaseModel):
    question_id: str
    transcript: str = Field(..., max_length=1000)
    input_mode: Literal["voice", "manual"] = "voice"


class SkipIn(BaseModel):
    reason: str = Field("camera unavailable", max_length=200)


class TextIn(BaseModel):
    text: str = Field(..., max_length=1000)
    context: str | None = None
    checkin_id: str | None = None


class SpeakIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=1200)


class BloodRespondIn(BaseModel):
    answer: Literal["yes", "not_now", "later"]


class BloodStartIn(BaseModel):
    checkin_id: str | None = None


class EmergencyIn(BaseModel):
    trigger: Literal["voice", "button"] = "button"
    protocol_id: str | None = None
    patient_id: str | None = None
    transcript: str | None = Field(None, max_length=500)
    reporter_id: str | None = None


class EmergencyStepIn(BaseModel):
    action: Literal["next", "back", "goto"] = "next"
    step: int | None = None
    note: str | None = Field(None, max_length=300)


class EmergencyProtocolIn(BaseModel):
    protocol_id: str
    patient_id: str | None = None


class LinkIn(BaseModel):
    link_up: bool | None = None
    delay_s: float | None = Field(None, ge=0, le=1800)


class ScenarioIn(BaseModel):
    scenario: str


class AckIn(BaseModel):
    by: str = Field("Flight Surgeon", max_length=60)
