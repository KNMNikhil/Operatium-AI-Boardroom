from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid


# ─── Startup ────────────────────────────────────────────────────────────────

class StartupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Name of the startup")
    description: str = Field(..., min_length=10, max_length=2000, description="Detailed description")
    industry: str = Field(..., min_length=2, max_length=50)
    executives: List[str] = Field(
        default=["CEO", "CTO", "Product Manager", "Product Designer", "Growth & Marketing", "Finance & Operations", "Investor & Risk Advisor"],
        max_length=10
    )

class Startup(BaseModel):
    id: str
    name: str
    description: str
    industry: str
    stage: str = "idea"
    validation_score: int = 0
    executives: List[str] = []
    meeting_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ─── Meeting ─────────────────────────────────────────────────────────────────

class MeetingCreate(BaseModel):
    startup_id: str = Field(..., min_length=36, max_length=36) # UUID string length
    meeting_type: str = Field(default="full_board", max_length=50)
    executives: List[str] = Field(..., max_length=10)

class Meeting(BaseModel):
    id: str
    startup_id: str
    meeting_type: str
    executives: List[str]
    status: str = "pending"
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# ─── Meeting Message ──────────────────────────────────────────────────────────

class MeetingMessage(BaseModel):
    id: str
    meeting_id: str
    executive_role: str
    content: str
    message_type: str = "analysis"
    stage: str = "analysis"
    sequence_order: int = 0
    created_at: Optional[datetime] = None


# ─── Report ──────────────────────────────────────────────────────────────────

class Report(BaseModel):
    id: str
    startup_id: str
    meeting_id: str
    report_type: str = "full"
    content: dict = {}
    created_at: Optional[datetime] = None


# ─── Decision ────────────────────────────────────────────────────────────────

class Decision(BaseModel):
    id: str
    startup_id: str
    meeting_id: str
    decision_text: str
    made_by: str
    decision_type: str = "recommendation"
    created_at: Optional[datetime] = None


# ─── WebSocket Events ─────────────────────────────────────────────────────────

class WSEvent(BaseModel):
    type: str  # "speaking" | "token" | "message_complete" | "stage_change" | "meeting_complete" | "error"
    executive: Optional[str] = None
    stage: Optional[str] = None
    token: Optional[str] = None
    message: Optional[dict] = None
    data: Optional[dict] = None


# ─── Follow-up ───────────────────────────────────────────────────────────────

class FollowUpRequest(BaseModel):
    question: str = Field(..., min_length=5, max_length=1000)
    meeting_id: str = Field(..., min_length=36, max_length=36)
