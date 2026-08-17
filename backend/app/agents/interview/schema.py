"""Interview Agent schemas and state machine definitions."""

from typing import Literal

from pydantic import BaseModel, Field

InterviewStage = Literal[
    "START",
    "SELF_INTRO",
    "PROJECT_DEEP_DIVE",
    "BUSINESS",
    "TECHNICAL",
    "REVERSE_QA",
    "END",
]

InterviewMode = Literal["full", "technical_interview"]

QuestionType = Literal["behavioral", "business", "project", "technical", "self_intro", "reverse"]

# Full mock interview progression
FULL_STAGE_ORDER: list[InterviewStage] = [
    "START",
    "SELF_INTRO",
    "PROJECT_DEEP_DIVE",
    "BUSINESS",
    "TECHNICAL",
    "REVERSE_QA",
    "END",
]

# Technical-only flow (LLM / RAG / Agent / Prompt / Evaluation)
TECHNICAL_STAGE_ORDER: list[InterviewStage] = [
    "START",
    "TECHNICAL",
    "REVERSE_QA",
    "END",
]

STAGE_LABELS: dict[str, str] = {
    "START": "开始",
    "SELF_INTRO": "自我介绍",
    "PROJECT_DEEP_DIVE": "项目深挖",
    "BUSINESS": "业务问题",
    "TECHNICAL": "技术问题",
    "REVERSE_QA": "反问环节",
    "END": "结束",
}


class InterviewQuestion(BaseModel):
    id: str | None = None
    type: QuestionType = "behavioral"
    stage: InterviewStage | None = None
    question: str
    focus: str | None = None
    follow_up_hints: list[str] = Field(default_factory=list)


class QuestionBankResult(BaseModel):
    position: str | None = None
    behavioral: list[InterviewQuestion] = Field(default_factory=list)
    business: list[InterviewQuestion] = Field(default_factory=list)
    project: list[InterviewQuestion] = Field(default_factory=list)
    technical: list[InterviewQuestion] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class InterviewTurnResult(BaseModel):
    stage: InterviewStage
    previous_stage: InterviewStage | None = None
    action: Literal["ask", "follow_up", "transition", "end"] = "ask"
    question: str
    question_type: QuestionType | None = None
    feedback_brief: str | None = None  # short coach note, not full answer key
    stage_complete: bool = False
    interview_complete: bool = False
    message_to_user: str | None = None


class DimensionScore(BaseModel):
    name: str
    score: int = Field(ge=0, le=100)
    comment: str | None = None


class InterviewReviewResult(BaseModel):
    overall_score: int = Field(ge=0, le=100, default=70)
    dimensions: list[DimensionScore] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    stage_summary: list[str] = Field(default_factory=list)
    evaluation: dict | None = None


def next_stage(current: InterviewStage, mode: InterviewMode = "full") -> InterviewStage:
    order = TECHNICAL_STAGE_ORDER if mode == "technical_interview" else FULL_STAGE_ORDER
    try:
        idx = order.index(current)
    except ValueError:
        return "END"
    if idx >= len(order) - 1:
        return "END"
    return order[idx + 1]


def stages_for_mode(mode: InterviewMode) -> list[InterviewStage]:
    return list(TECHNICAL_STAGE_ORDER if mode == "technical_interview" else FULL_STAGE_ORDER)
