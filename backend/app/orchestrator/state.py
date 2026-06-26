from typing import TypedDict, Optional, Callable, Awaitable
from typing import AsyncGenerator


# ─── Meeting Stage ────────────────────────────────────────────────────────────

STAGE_ANALYSIS = "analysis"
STAGE_DEBATE = "debate"
STAGE_DECISION = "decision"
STAGE_REPORT = "report"
STAGE_COMPLETE = "complete"


# ─── State ────────────────────────────────────────────────────────────────────

class MeetingState(TypedDict):
    # Input
    startup_id: str
    meeting_id: str
    startup_name: str
    startup_description: str
    concept: str            # alias for startup_description used in decision prompt
    industry: str
    executives: list[str]

    # Built up during the meeting
    analyses: dict[str, str]          # role → full analysis text
    debate_responses: dict[str, str]  # role → debate text
    decisions: list[str]              # final decisions made

    # Meta
    current_stage: str
    report: dict                      # final structured report
    error: Optional[str]
    existing_messages: list[dict]


# ─── Streaming Callback Type ──────────────────────────────────────────────────

# Called for every token streamed during the meeting
# Args: stage, executive_role, token
StreamCallback = Callable[[str, str, str], Awaitable[None]]
