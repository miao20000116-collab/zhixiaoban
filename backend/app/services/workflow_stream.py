"""Workflow progress streaming — Master → specialist Agent step visibility."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, TypeVar

T = TypeVar("T")

AGENT_LABELS: dict[str, str] = {
    "master": "Master Agent",
    "job": "JD Analysis Agent",
    "resume": "Resume Agent",
    "interview": "Interview Agent",
    "evaluation": "Evaluation Agent",
    "career_gap": "Career Gap Agent",
    "career": "Career Agent",
    "memory": "Memory Agent",
    "recommendation": "Recommendation",
}

INTENT_LABELS: dict[str, str] = {
    "resume": "简历优化 / STAR",
    "jd_analysis": "岗位 / JD 分析",
    "interview": "模拟面试 / 复盘",
    "career_consult": "职业咨询 / 陪伴",
    "memory_update": "职业记忆更新",
    "general_chat": "一般对话",
}

NEED_AGENT_LABELS: dict[str, str] = {
    "resume_agent": "Resume Agent（简历）",
    "job_agent": "JD Analysis Agent（岗位分析）",
    "interview_agent": "Interview Agent（面试）",
    "career_agent": "Career Agent（职业咨询）",
    "memory_agent": "Memory Agent（职业记忆）",
}


def make_step(
    *,
    agent: str,
    title: str,
    detail: str = "",
    status: str = "running",
    phase: str = "think",
) -> dict[str, Any]:
    """Structured step payload for SSE `event: step`."""
    return {
        "id": str(uuid.uuid4()),
        "agent": agent,
        "agent_label": AGENT_LABELS.get(agent, agent),
        "title": title,
        "detail": detail,
        "status": status,  # running | done | error
        "phase": phase,  # think | route | run | evaluate | answer
        "ts": time.time(),
    }


def step_token_line(step: dict[str, Any]) -> str:
    """Human-readable line streamed into the chat bubble."""
    mark = "✓" if step.get("status") == "done" else ("!" if step.get("status") == "error" else "…")
    line = f"**{step.get('agent_label', step.get('agent'))}** {mark} {step.get('title', '')}"
    detail = (step.get("detail") or "").strip()
    if detail:
        line += f"\n_{detail}_"
    return line + "\n\n"


def progress(
    *,
    agent: str,
    title: str,
    detail: str = "",
    status: str = "running",
    phase: str = "think",
    as_token: bool = False,
) -> list[tuple[str, object]]:
    """Build (step[, token]) events for one workflow moment.

    Default: only emit structured `step` for the thinking panel.
    Set as_token=True only when you intentionally want progress lines in the bubble.
    """
    payload = make_step(
        agent=agent,
        title=title,
        detail=detail,
        status=status,
        phase=phase,
    )
    events: list[tuple[str, object]] = [("step", payload)]
    if as_token:
        events.append(("token", step_token_line(payload)))
    return events


async def await_with_heartbeat(
    coro: Awaitable[T],
    *,
    agent: str,
    title: str,
    detail: str = "",
    heartbeat_seconds: float = 3.0,
    heartbeat_messages: list[str] | None = None,
) -> AsyncIterator[tuple[str, object] | tuple[str, T]]:
    """
    Run a long coroutine while yielding periodic progress.
    Final yield: ("__result__", result).
    """
    for event in progress(agent=agent, title=title, detail=detail, phase="run"):
        yield event

    task = asyncio.ensure_future(coro)
    beats = heartbeat_messages or [
        "仍在处理，请稍候…",
        "正在整理依据与结论…",
        "马上就好…",
    ]
    beat_i = 0
    try:
        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=heartbeat_seconds)
            except asyncio.TimeoutError:
                msg = beats[beat_i % len(beats)]
                beat_i += 1
                for event in progress(
                    agent=agent,
                    title=msg,
                    detail=title,
                    phase="run",
                ):
                    yield event
        result = task.result()
        for event in progress(
            agent=agent,
            title=f"完成：{title}",
            status="done",
            phase="run",
        ):
            yield event
        yield ("__result__", result)
    except Exception as exc:
        for event in progress(
            agent=agent,
            title=f"失败：{title}",
            detail=str(exc)[:200],
            status="error",
            phase="run",
        ):
            yield event
        raise


def describe_routing(intent: str, need_agent: str | None, confidence: float) -> tuple[str, str]:
    intent_label = INTENT_LABELS.get(intent, intent)
    if need_agent:
        agent_label = NEED_AGENT_LABELS.get(need_agent, need_agent)
        title = f"识别意图：{intent_label}"
        detail = f"交由 {agent_label} 继续处理（置信度 {confidence:.0%}）"
    else:
        title = f"识别意图：{intent_label}"
        detail = f"无需专项 Agent，由对话直接回答（置信度 {confidence:.0%}）"
    return title, detail
