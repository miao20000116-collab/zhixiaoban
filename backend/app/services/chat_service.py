"""Chat orchestration with Master Agent, Memory, Job Intelligence, and Resume Agent."""

import re
import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import datetime

from sqlalchemy.orm import Session

from app.agents.career.agent import CareerAgent, looks_like_emotional_need
from app.agents.master.agent import MasterAgent
from app.agents.master.schema import INTENT_AGENT_MAP, MasterAgentResult
from app.agents.memory.agent import MemoryAgent
from app.memory.service import apply_extractions, build_memory_context, format_extraction_summary, rule_based_extractions
from app.models.message import Message
from app.services.career_intelligence_service import (
    intelligence_for_message,
)
from app.services.career_status_service import (
    STAGE_LABELS,
    apply_user_signal,
    build_companionship_context,
    detect_mood,
    get_or_create_career_status,
    refresh_career_status_from_history,
)
from app.services.conversation_service import (
    conversation_meta_payload,
    get_conversation,
    maybe_update_title_from_first_message,
    refresh_conversation_title_with_intent,
    update_conversation_summary,
)
from app.services.interview_service import (
    detect_interview_mode,
    end_interview,
    extract_interview_context,
    format_question_bank_markdown,
    generate_question_bank,
    get_active_session,
    looks_like_start_interview,
    pause_interview_session,
    start_interview,
    submit_answer,
)
from app.services.job_service import format_analysis_markdown, looks_like_jd, run_job_analysis
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_system_prompt
from app.services.recommendation import (
    persist_next_action,
    recommend_after_interview,
    recommend_after_job_analysis,
    recommend_after_resume_optimize,
    recommend_from_career_status,
)
from app.utils.text_sanitize import strip_decorative_emoji
from app.services.task_memory_service import (
    create_or_update_task,
    ensure_task_from_message,
    extract_company_position,
    format_task_context,
    get_active_task,
    sync_task_from_history,
    task_to_dict,
)
from app.services.workflow_stream import await_with_heartbeat, describe_routing, progress
from app.services.resume_service import (
    extract_resume_intent_params,
    format_optimize_markdown,
    format_parse_markdown,
    looks_like_resume,
    run_resume_optimize,
    run_resume_parse,
    run_resume_star,
)

MAX_HISTORY_MESSAGES = 20

INTENT_HINTS: dict[str, str] = {
    "memory_update": (
        "用户在补充/纠正职业事实。系统会调用 Memory Agent 写入 Career Memory；"
        "回复应确认已记住的内容，不要要求上传完整简历。"
    ),
    "resume": (
        "用户意图与简历相关。系统可调用 Resume Agent："
        "上传/粘贴简历解析、诊断、STAR 改写、按目标岗位/JD 定制。"
        "禁止虚构项目、数据、职责。信息不足时引导用户补充。"
    ),
    "jd_analysis": (
        "用户意图与岗位/JD 分析相关。"
        "若消息中已有 JD 或明确岗位/公司，系统会调用 Job Intelligence Agent；"
        "否则请引导用户粘贴 JD、上传文件，或提供「岗位+公司」。"
    ),
    "interview": (
        "用户意图与面试相关。系统可调用 Interview Agent："
        "开始模拟面试 / 技术专项（technical_interview）/ 生成题库 / 面试复盘。"
        "状态机：START→自我介绍→项目深挖→业务→技术→反问→结束。"
    ),
    "career_consult": (
        "用户意图与职业咨询/情绪陪伴相关。"
        "必须结合 Career Status 真实数据（面试次数、得分、短板）给出可执行下一步；"
        "禁止空泛鼓励（如「你一定可以」）。"
        "按问题类型换开头：情绪先回应情绪；时间规划先给时间盒；决策先给框架；避免每次都以 JD 分析开场。"
    ),
    "general_chat": (
        "请作为长期 AI 求职伙伴自然对话，适当结合职业记忆与求职状态；"
        "若用户流露焦虑/被拒/迷茫，用数据给出下一步，不要空泛鼓励。"
    ),
}


def build_llm_messages(
    db: Session,
    conversation_id: uuid.UUID,
    user_message: str,
    memory_context: str,
    intent_result: MasterAgentResult,
    career_status_context: str = "",
) -> list[dict[str, str]]:
    history = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id, Message.role.in_(["user", "assistant"]))
        .order_by(Message.created_at.desc())
        .limit(MAX_HISTORY_MESSAGES)
        .all()
    )
    history.reverse()

    system_parts = [load_system_prompt()]
    if memory_context:
        system_parts.append(f"\n## 用户职业记忆（跨所有对话共享）\n{memory_context}")
    else:
        system_parts.append("\n## 用户职业记忆\n暂无。请在对话中自然了解用户背景。")

    if career_status_context:
        system_parts.append(f"\n{career_status_context}")

    hint = INTENT_HINTS.get(intent_result.intent, INTENT_HINTS["general_chat"])
    system_parts.append(
        f"\n## 当前意图识别\n"
        f"- intent: {intent_result.intent}\n"
        f"- confidence: {intent_result.confidence:.2f}\n"
        f"- need_agent: {intent_result.need_agent or 'none'}\n"
        f"- 指引: {hint}"
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": "".join(system_parts)}]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": user_message})
    return messages


def save_user_message(db: Session, conversation_id: uuid.UUID, content: str) -> Message:
    message = Message(conversation_id=conversation_id, role="user", content=content)
    db.add(message)
    conversation = get_conversation(db, conversation_id)
    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)
    maybe_update_title_from_first_message(db, conversation, content)
    return message


def save_assistant_message(db: Session, conversation_id: uuid.UUID, content: str) -> Message:
    message = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=strip_decorative_emoji(content),
    )
    db.add(message)
    conversation = get_conversation(db, conversation_id)
    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)
    return message


async def _stream_markdown(markdown: str) -> AsyncIterator[tuple[str, object]]:
    cleaned = strip_decorative_emoji(markdown)
    chunk_size = 24
    for i in range(0, len(cleaned), chunk_size):
        yield ("token", cleaned[i : i + chunk_size])


async def _stream_answer(markdown: str) -> AsyncIterator[tuple[str, object]]:
    """Mark answer phase, then stream final markdown to the user."""
    for event in progress(
        agent="master",
        title="开始输出结论",
        detail="思考完成，正在生成回复",
        status="done",
        phase="answer",
    ):
        yield event
    async for event in _stream_markdown(markdown):
        yield event


async def _iter_agent_progress(
    coro,
    *,
    agent: str,
    title: str,
    detail: str = "",
    heartbeat_seconds: float = 4.0,
    heartbeat_messages: list[str] | None = None,
    result_box: dict,
) -> AsyncIterator[tuple[str, object]]:
    """Stream heartbeats while awaiting a specialist Agent; store result in result_box['value']."""
    async for item in await_with_heartbeat(
        coro,
        agent=agent,
        title=title,
        detail=detail,
        heartbeat_seconds=heartbeat_seconds,
        heartbeat_messages=heartbeat_messages,
    ):
        kind, payload = item
        if kind == "__result__":
            result_box["value"] = payload
        else:
            yield (kind, payload)


def _extract_position_company(text: str) -> tuple[str | None, str | None]:
    text = text.strip()

    pos_m = re.search(r"岗位[:：]\s*([^\n,，]+)", text)
    co_m = re.search(r"公司[:：]\s*([^\n,，]+)", text)
    if pos_m or co_m:
        return (
            pos_m.group(1).strip() if pos_m else None,
            co_m.group(1).strip() if co_m else None,
        )

    match = re.search(
        r"(?:帮我)?(?:分析|看看|研究)(?:一下)?\s*(.+?)(?:的)\s*(.+?)(?:岗位|职位|JD)?$",
        text,
    )
    if match:
        return match.group(2).strip(), match.group(1).strip()

    match = re.search(
        r"(?:分析|看看)\s+([\u4e00-\u9fa5A-Za-z0-9]{2,20})\s+([\u4e00-\u9fa5A-Za-z0-9+\-]{2,30})",
        text,
    )
    if match:
        return match.group(2).strip(), match.group(1).strip()

    return None, None


def _should_run_job_agent(user_message: str) -> tuple[bool, str | None, str | None, str | None]:
    if looks_like_jd(user_message):
        return True, user_message, None, None

    position, company = _extract_position_company(user_message)
    if position or company:
        return True, None, position, company

    return False, None, None, None


def _should_run_resume_agent(user_message: str) -> dict | None:
    """Decide resume task. Returns None to fall through to normal chat."""
    params = extract_resume_intent_params(user_message)
    text = user_message.strip()
    lowered = text.lower()

    wants_star = any(k in lowered for k in ["star", "STAR", "项目经历优化", "改写项目"])
    wants_optimize = any(k in text for k in ["优化简历", "定制简历", "改简历", "简历优化", "针对岗位"])
    has_resume = looks_like_resume(text)

    # Split: if message has resume body + target, optimize
    if has_resume and (params["target_position"] or params["jd_text"] or wants_optimize):
        return {
            "task": "optimize",
            "resume_text": text,
            "target_position": params["target_position"],
            "jd_text": params["jd_text"],
        }

    if has_resume and wants_star:
        return {"task": "star", "resume_text": text, "project_text": None}

    if has_resume:
        return {"task": "parse", "resume_text": text}

    # Short STAR request with project description
    if wants_star and len(text) >= 40:
        return {"task": "star", "project_text": text, "resume_text": None}

    # Optimize without full resume body — need memory or ask user
    if wants_optimize and (params["target_position"] or params["jd_text"]):
        return {
            "task": "optimize_from_memory",
            "target_position": params["target_position"],
            "jd_text": params["jd_text"],
        }

    return None


def _memory_as_resume_text(memory_context: str) -> str | None:
    if not memory_context or len(memory_context.strip()) < 40:
        return None
    return f"基于已有职业记忆整理的简历素材：\n{memory_context}"


def _looks_like_constraint_memory(text: str) -> bool:
    """Constraint / anti-fabrication statements should update Memory even if resume verbs appear."""
    t = (text or "").strip()
    if not t:
        return False
    keys = [
        "没有真实",
        "只是上过",
        "只上过",
        "不希望虚构",
        "不要虚构",
        "禁止虚构",
        "勿虚构",
        "【约束】",
    ]
    return any(k in t for k in keys)


def _looks_like_memory_share(text: str) -> bool:
    """Natural career-fact statements should go to Memory, not Resume upload prompt."""
    t = (text or "").strip()
    if not t:
        return False
    # Constraint statements win even when the sentence also mentions 优化简历 / 面试
    if _looks_like_constraint_memory(t):
        return True
    # Short first-person facts must not be blocked by looks_like_resume
    # (e.g. messages containing「技能」and length>=120 used to false-positive as resume).
    short_first_person = t.startswith(("我", "记住", "补充", "纠正")) and len(t) < 400
    if looks_like_resume(t) and not short_first_person:
        return False
    # Explicit resume optimize verbs → not memory-only
    if any(k in t for k in ["优化简历", "定制简历", "改简历", "简历优化", "上传简历", "解析简历"]):
        return False
    keys = [
        "我之前负责",
        "我之前做",
        "我做过",
        "我负责过",
        "我参与过",
        "我的经历是",
        "我的经历",
        "记住",
        "补充一下",
        "补充：",
        "我的技能是",
        "我的主要技能",
        "我的技能",
        "我的目标岗位是",
        "目标岗位是",
        "纠正一下",
        "没有真实",
        "只是上过",
        "只上过",
        "不希望虚构",
        "不要虚构",
        "工作年限不是",
        "年限不是",
        "工作年限是",
        "工作年限",
    ]
    if any(k in t for k in keys):
        return True
    # Short first-person career fact without full resume structure
    if short_first_person and any(
        k in t for k in ["负责", "做过", "参与", "技能", "DAU", "留存", "增长", "项目", "年限"]
    ):
        return True
    return False


def _wants_resume_work(text: str) -> bool:
    if _looks_like_memory_share(text) or _looks_like_constraint_memory(text):
        return False
    keys = ["优化简历", "定制简历", "改简历", "简历优化", "解析简历", "上传简历", "帮我看简历", "STAR", "项目经历优化"]
    return any(k in text for k in keys) or looks_like_resume(text)


def _wants_jd_work(text: str, *, allow_heuristic: bool = True) -> bool:
    keys = ["分析JD", "分析岗位", "岗位分析", "帮我看JD", "匹配度", "分析一下这个岗位"]
    if any(k in text for k in keys):
        return True
    return bool(allow_heuristic and looks_like_jd(text))


def _is_non_interview_work(
    user_message: str,
    intent: str | None = None,
    *,
    interview_active: bool = False,
) -> bool:
    """True when the message is clearly resume/JD/career work — must not continue mock interview."""
    if intent in ("resume", "jd_analysis", "career_consult", "memory_update"):
        return True
    if _looks_like_memory_share(user_message):
        return True
    if _wants_resume_work(user_message):
        return True
    # Active interview: only leave on explicit JD asks, not long answers that vaguely look like JD.
    if _wants_jd_work(user_message, allow_heuristic=not interview_active):
        return True
    if _wants_career_intelligence(user_message) or looks_like_emotional_need(user_message):
        return True
    if _should_run_resume_agent(user_message) is not None:
        return True
    if not interview_active:
        should_job, *_ = _should_run_job_agent(user_message)
        return bool(should_job)
    return False


def _apply_content_intent_override(
    user_message: str,
    intent_result: MasterAgentResult,
    *,
    interview_active: bool = False,
) -> MasterAgentResult:
    """Prefer content heuristics over LLM when the message body is clearly a resume/JD/career ask."""
    if _looks_like_memory_share(user_message) and not looks_like_start_interview(user_message):
        if intent_result.intent != "memory_update":
            return MasterAgentResult(
                intent="memory_update",
                confidence=max(intent_result.confidence, 0.93),
                need_agent=INTENT_AGENT_MAP["memory_update"],
            )

    if looks_like_resume(user_message) or (
        _wants_resume_work(user_message) and not looks_like_start_interview(user_message)
    ):
        # Avoid treating a resume paste as interview just because an old session is active.
        if intent_result.intent != "resume":
            return MasterAgentResult(
                intent="resume",
                confidence=max(intent_result.confidence, 0.92),
                need_agent=INTENT_AGENT_MAP["resume"],
            )

    # During an active interview, only force JD route on strong JD signals — not long answers.
    explicit_jd_ask = any(
        k in user_message for k in ["分析JD", "分析岗位", "岗位分析", "帮我看JD", "分析一下这个岗位"]
    )
    if looks_like_jd(user_message) and not looks_like_resume(user_message):
        if interview_active and not explicit_jd_ask:
            # Weak heuristic alone must not hijack interview answers.
            pass
        elif intent_result.intent != "jd_analysis":
            return MasterAgentResult(
                intent="jd_analysis",
                confidence=max(intent_result.confidence, 0.92),
                need_agent=INTENT_AGENT_MAP["jd_analysis"],
            )

    if (
        not looks_like_start_interview(user_message)
        and (
            _wants_career_intelligence(user_message) or looks_like_emotional_need(user_message)
        )
        and intent_result.intent in ("interview", "general_chat")
    ):
        return MasterAgentResult(
            intent="career_consult",
            confidence=max(intent_result.confidence, 0.88),
            need_agent=INTENT_AGENT_MAP["career_consult"],
        )
    return intent_result


def _finalize_conversation_meta(
    db: Session,
    conversation,
    *,
    user_message: str,
    assistant_content: str,
    intent: str | None,
):
    """Refresh rolling summary and return SSE payload for sidebar."""
    update_conversation_summary(
        db,
        conversation,
        user_message=user_message,
        assistant_content=assistant_content,
        intent=intent,
    )
    db.refresh(conversation)
    return conversation_meta_payload(conversation)


def _wants_career_intelligence(text: str) -> bool:
    keys = [
        "想找",
        "转岗",
        "转行",
        "差距",
        "匹配",
        "缺什么",
        "能力缺口",
        "下一步",
        "规划",
        "路线",
        "怎么准备",
        "如何提升",
        "职业规划",
        "我想做",
        "目标岗位",
    ]
    return any(k in text for k in keys)


def _looks_like_multi_task(text: str) -> bool:
    groups = [
        any(k in text for k in ["岗位", "JD", "jd", "职位"]),
        any(k in text for k in ["简历", "STAR", "改写"]),
        any(k in text for k in ["面试", "模拟"]),
    ]
    return sum(1 for hit in groups if hit) >= 2 and any(k in text for k in ["同时", "再", "然后", "一起", "都"])


def _multi_task_guidance(text: str) -> str:
    return (
        "可以，我会把这件事拆成一个可执行流程来推进：\n\n"
        "1. **先做岗位/JD 分析**：请先粘贴或上传目标岗位 JD，我会提取职责、硬性要求、隐性要求和能力差距。\n"
        "2. **再做简历优化**：基于你的真实简历和上一步 JD，只改写有事实依据的内容；没有数据来源的经历不会虚构。\n"
        "3. **最后做模拟面试**：用 JD 和优化后的真实经历生成追问，重点练项目深挖、指标口径和复盘能力。\n\n"
        "为了避免信息混在一起导致误判，请先发目标 JD；如果你已经有简历，也可以同时上传简历文件。"
    )


async def stream_chat_response(
    db: Session,
    conversation_id: uuid.UUID,
    user_message: str,
) -> AsyncIterator[tuple[str, object]]:
    """Yield events: step | intent | token | job_analysis | resume_result | next_action | done | memory_updated | error."""
    conversation = get_conversation(db, conversation_id)
    user_id = conversation.user_id

    for event in progress(
        agent="master",
        title="开始理解你的问题",
        detail="读取职业记忆与当前 Task Memory",
        phase="think",
    ):
        yield event

    memory_context = build_memory_context(db, user_id)
    career_status = refresh_career_status_from_history(db, user_id)
    if looks_like_emotional_need(user_message) or detect_mood(user_message) != "neutral":
        career_status = apply_user_signal(db, user_id, user_message)
    career_ctx = build_companionship_context(career_status)

    # Phase 8.2 Task Memory: Master sees current task before routing
    active_task = get_active_task(db, user_id, conversation_id=conversation_id)
    task_ctx = format_task_context(active_task)
    if active_task:
        for event in progress(
            agent="master",
            title="发现进行中的任务",
            detail=f"{active_task.goal}（进度 {int((active_task.progress or 0) * 100)}%）",
            status="done",
            phase="think",
        ):
            yield event

    master = MasterAgent()
    for event in progress(
        agent="master",
        title="正在识别意图并决定路由",
        detail="结合消息内容、职业记忆与 Task Memory 判断该由哪个 Agent 处理",
        phase="think",
    ):
        yield event

    box: dict = {}
    async for event in _iter_agent_progress(
        master.classify(user_message, memory_context, task_context=task_ctx),
        agent="master",
        title="意图分类",
        detail="Master Agent 思考中…",
        heartbeat_seconds=5.0,
        heartbeat_messages=["仍在判断你的目标与该调用的 Agent…"],
        result_box=box,
    ):
        yield event
    intent_result = box["value"]

    # Upgrade to career companionship when emotional need is clear
    if looks_like_emotional_need(user_message) and intent_result.intent in ("general_chat", "career_consult"):
        intent_result.intent = "career_consult"
        intent_result.need_agent = "career_agent"

    # Content heuristics win over Master when user pasted a resume/JD (avoids interview misroute)
    early_active = get_active_session(db, user_id=user_id, conversation_id=conversation_id)
    overridden = _apply_content_intent_override(
        user_message,
        intent_result,
        interview_active=early_active is not None,
    )
    if overridden.intent != intent_result.intent:
        for event in progress(
            agent="master",
            title=f"按内容纠正路由：{overridden.intent}",
            detail="检测到简历/岗位/职业规划意图，优先走对应 Agent，而不是沿用面试会话",
            status="done",
            phase="route",
        ):
            yield event
        intent_result = overridden

    route_title, route_detail = describe_routing(
        intent_result.intent,
        intent_result.need_agent,
        intent_result.confidence,
    )
    for event in progress(
        agent="master",
        title=route_title,
        detail=route_detail,
        status="done",
        phase="route",
    ):
        yield event
    yield ("intent", intent_result.model_dump())

    # Create or continue Task when user expresses a clear goal / workflow intent
    company_hint, position_hint = extract_company_position(user_message)
    ensured = ensure_task_from_message(
        db,
        user_id,
        user_message,
        intent=intent_result.intent,
        conversation_id=conversation_id,
        position=position_hint,
        company=company_hint,
    )
    if ensured is not None:
        for event in progress(
            agent="master",
            title="更新 Task Memory",
            detail=ensured.goal,
            status="done",
            phase="run",
        ):
            yield event
        yield ("task_updated", task_to_dict(ensured))

    save_user_message(db, conversation_id, user_message)
    db.refresh(conversation)
    if refresh_conversation_title_with_intent(db, conversation, user_message, intent_result.intent):
        db.refresh(conversation)
        yield ("conversation_updated", conversation_meta_payload(conversation))

    if _looks_like_multi_task(user_message):
        markdown = _multi_task_guidance(user_message)
        task = create_or_update_task(
            db,
            user_id,
            goal="完成岗位分析、简历优化与模拟面试",
            task_type="job_search",
            conversation_id=conversation_id,
            next_action="请先上传或粘贴目标岗位 JD",
            meta={"source": "multi_task_guidance"},
        )
        next_action = {
            "trigger": "multi_task_guidance",
            "title": "先从 JD 分析开始",
            "message": "请先上传或粘贴目标岗位 JD，我会再带你进入简历优化和模拟面试。",
            "why": "同时执行多个求职任务容易让输入材料混淆；按 JD → 简历 → 面试推进更稳定。",
            "priority": "high",
            "sources": [{"type": "workflow", "label": "多任务拆解"}],
            "plan": [
                {"step": "上传/粘贴 JD", "reason": "明确岗位标准", "source": "workflow", "priority": "high"},
                {"step": "上传简历", "reason": "只基于真实经历优化", "source": "workflow", "priority": "high"},
                {"step": "开始模拟面试", "reason": "检验表达与岗位匹配", "source": "workflow", "priority": "medium"},
            ],
        }
        persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
        yield ("task_updated", task_to_dict(task))
        yield ("next_action", next_action)
        async for event in _stream_answer(markdown):
            yield event
        assistant_message = save_assistant_message(db, conversation_id, markdown)
        yield (
            "conversation_updated",
            _finalize_conversation_meta(
                db,
                conversation,
                user_message=user_message,
                assistant_content=markdown,
                intent=intent_result.intent,
            ),
        )
        yield ("done", assistant_message.id)
        return

    # Phase 4: active mock interview continues ONLY for interview answers.
    # Resume/JD uploads must not be treated as "本轮面试回答".
    active = early_active or get_active_session(db, user_id=user_id, conversation_id=conversation_id)
    if active and not looks_like_start_interview(user_message):
        if _is_non_interview_work(
            user_message,
            intent_result.intent,
            interview_active=True,
        ):
            for event in progress(
                agent="master",
                title="暂停当前模拟面试",
                detail="检测到简历/岗位/职业规划相关任务，改走对应 Agent",
                status="done",
                phase="route",
            ):
                yield event
            pause_interview_session(db, active)
            active = None
        else:
            try:
                if any(k in user_message for k in ["结束面试", "开始复盘", "给我复盘"]):
                    for event in progress(
                        agent="master",
                        title="路由到 Interview Agent",
                        detail="检测到复盘意图，开始面试复盘",
                        status="done",
                        phase="route",
                    ):
                        yield event
                    box = {}
                    async for event in _iter_agent_progress(
                        end_interview(db, session=active),
                        agent="interview",
                        title="生成面试复盘",
                        detail="汇总对话、评分与改进建议，并做真实性检查",
                        heartbeat_messages=[
                            "Interview Agent 正在回顾你的回答…",
                            "正在提炼优势、短板与可练习点…",
                            "Evaluation 正在核查复盘是否夸大经历…",
                        ],
                        result_box=box,
                    ):
                        yield event
                    session, review, markdown = box["value"]
                    yield (
                        "interview_review",
                        {
                            "id": str(session.id),
                            "stage": session.stage,
                            "mode": session.mode,
                            "review": review.model_dump(exclude={"evaluation"}),
                            "evaluation": review.evaluation,
                        },
                    )
                    next_action = recommend_after_interview(
                        weaknesses=review.weaknesses,
                        overall_score=review.overall_score,
                        interview_count=career_status.interview_count,
                    )
                    persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
                    yield ("next_action", next_action)
                    synced = sync_task_from_history(db, user_id, conversation_id=conversation_id)
                    if synced is None:
                        synced = create_or_update_task(
                            db,
                            user_id,
                            goal=f"准备{session.position or '目标岗位'}面试",
                            task_type="interview_prepare",
                            conversation_id=conversation_id,
                            completed_step="模拟面试",
                            next_action=next_action.get("message"),
                        )
                    else:
                        synced = create_or_update_task(
                            db,
                            user_id,
                            goal=synced.goal,
                            task_type=synced.task_type,  # type: ignore[arg-type]
                            conversation_id=conversation_id,
                            completed_step="模拟面试",
                            next_action=next_action.get("message"),
                        )
                    yield ("task_updated", task_to_dict(synced))
                else:
                    for event in progress(
                        agent="interview",
                        title="处理本轮面试回答",
                        detail="评估回答并生成下一题或追问",
                        phase="run",
                    ):
                        yield event
                    box = {}
                    async for event in _iter_agent_progress(
                        submit_answer(db, session=active, user_message=user_message),
                        agent="interview",
                        title="面试回合推理",
                        detail="Interview Agent 正在出题 / 追问",
                        heartbeat_messages=["仍在生成下一题…", "正在结合 JD 与简历追问…"],
                        result_box=box,
                    ):
                        yield event
                    session, turn, review, markdown = box["value"]
                    yield (
                        "interview_turn",
                        {
                            "id": str(session.id),
                            "stage": session.stage,
                            "mode": session.mode,
                            "status": session.status,
                            "turn": turn.model_dump(),
                        },
                    )
                    if review:
                        yield (
                            "interview_review",
                            {
                                "id": str(session.id),
                                "stage": session.stage,
                                "mode": session.mode,
                                "review": review.model_dump(exclude={"evaluation"}),
                                "evaluation": review.evaluation,
                            },
                        )
                        next_action = recommend_after_interview(
                            weaknesses=review.weaknesses,
                            overall_score=review.overall_score,
                            interview_count=career_status.interview_count,
                        )
                        persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
                        yield ("next_action", next_action)
                async for event in _stream_answer(markdown):
                    yield event
                assistant_message = save_assistant_message(db, conversation_id, markdown)
                yield (
                    "conversation_updated",
                    _finalize_conversation_meta(
                        db,
                        conversation,
                        user_message=user_message,
                        assistant_content=markdown,
                        intent="interview",
                    ),
                )
                yield ("done", assistant_message.id)
                return
            except asyncio.TimeoutError:
                yield ("error", "Interview Agent 处理超时，请稍后重试或缩短回答内容。")
                return
            except Exception as exc:
                yield ("error", f"Interview Agent 失败: {exc}")
                return

    # Phase 4: start interview / generate questions
    if (
        (intent_result.intent == "interview" or looks_like_start_interview(user_message))
        and not _is_non_interview_work(user_message, intent_result.intent, interview_active=False)
    ):
        try:
            wants_bank_only = any(k in user_message for k in ["生成面试题", "出几道面试题", "面试题库", "给我面试题"])
            mode = detect_interview_mode(user_message)
            ctx = extract_interview_context(user_message)
            position = ctx["position"] or "AI产品经理"
            jd_text = ctx["jd_text"]

            if wants_bank_only and not looks_like_start_interview(user_message):
                for event in progress(
                    agent="master",
                    title="路由到 Interview Agent",
                    detail="生成面试题库（不出题开场）",
                    status="done",
                    phase="route",
                ):
                    yield event
                box = {}
                async for event in _iter_agent_progress(
                    generate_question_bank(
                        db,
                        user_id=user_id,
                        position=position,
                        jd_text=jd_text,
                        mode=mode,
                    ),
                    agent="interview",
                    title="生成面试题库",
                    detail="按岗位与 JD 覆盖行为 / 业务 / 技术题",
                    heartbeat_messages=["Interview Agent 正在出题…", "正在按题型整理题库…"],
                    result_box=box,
                ):
                    yield event
                bank = box["value"]
                markdown = format_question_bank_markdown(bank)
                yield ("interview_questions", {"mode": mode, "questions": bank.model_dump()})
                async for event in _stream_answer(markdown):
                    yield event
                assistant_message = save_assistant_message(db, conversation_id, markdown)
                yield (
                    "conversation_updated",
                    _finalize_conversation_meta(
                        db,
                        conversation,
                        user_message=user_message,
                        assistant_content=markdown,
                        intent="interview",
                    ),
                )
                yield ("done", assistant_message.id)
                return

            if looks_like_start_interview(user_message) or (jd_text and len(jd_text) >= 80):
                for event in progress(
                    agent="master",
                    title="路由到 Interview Agent",
                    detail=f"开始模拟面试 · {position}",
                    status="done",
                    phase="route",
                ):
                    yield event
                box = {}
                async for event in _iter_agent_progress(
                    start_interview(
                        db,
                        user_id=user_id,
                        conversation_id=conversation_id,
                        position=position,
                        jd_text=jd_text if jd_text and len(jd_text) >= 40 else user_message if looks_like_jd(user_message) else jd_text,
                        mode=mode,
                    ),
                    agent="interview",
                    title="开启模拟面试",
                    detail="准备开场题并建立面试会话",
                    heartbeat_messages=["正在创建面试会话…", "正在生成开场问题…"],
                    result_box=box,
                ):
                    yield event
                session, turn, markdown = box["value"]
                yield (
                    "interview_turn",
                    {
                        "id": str(session.id),
                        "stage": session.stage,
                        "mode": session.mode,
                        "status": session.status,
                        "turn": turn.model_dump(),
                    },
                )
                async for event in _stream_answer(markdown):
                    yield event
                assistant_message = save_assistant_message(db, conversation_id, markdown)
                yield (
                    "conversation_updated",
                    _finalize_conversation_meta(
                        db,
                        conversation,
                        user_message=user_message,
                        assistant_content=markdown,
                        intent="interview",
                    ),
                )
                yield ("done", assistant_message.id)
                return
            # else fall through to LLM to guide user how to start
        except Exception as exc:
            yield ("error", f"Interview Agent 失败: {exc}")
            return

    # Phase 2.5: Memory Agent — natural career-fact statements
    if intent_result.intent == "memory_update" or (
        _looks_like_memory_share(user_message) and intent_result.intent in ("resume", "general_chat", "career_consult")
    ):
        try:
            for event in progress(
                agent="master",
                title="路由到 Memory Agent",
                detail="沉淀职业事实到 Career Memory",
                status="done",
                phase="route",
            ):
                yield event
            box = {}
            async for event in _iter_agent_progress(
                MemoryAgent().extract(user_message, memory_context),
                agent="memory",
                title="提取职业记忆",
                detail="识别经历 / 技能 / 目标 / 约束",
                heartbeat_messages=["Memory Agent 正在提取可复用事实…"],
                result_box=box,
            ):
                yield event
            extraction_result = box["value"]
            extractions = list(extraction_result.extractions or [])
            if not extractions:
                extractions = rule_based_extractions(user_message)
            saved_count = apply_extractions(db, user_id, extractions)
            # If LLM scored too low to save, still force-save rule/LLM items above soft threshold
            if saved_count == 0 and extractions:
                for item in extractions:
                    if item.importance_score < 6:
                        item.importance_score = 8
                saved_count = apply_extractions(db, user_id, extractions)
            summary = format_extraction_summary(extractions)
            if saved_count > 0 and summary:
                markdown = (
                    f"已记住你补充的职业信息（更新 {saved_count} 条）：\n\n"
                    f"{summary}\n\n"
                    "后续的简历优化、差距分析和模拟面试会优先引用这些真实经历。"
                    "如果你有限制性事实（例如没有真实 RAG 项目），我也会一并遵守，不会虚构。"
                )
            elif summary:
                markdown = (
                    "我理解了你补充的内容，但与已有记忆高度重复，未重复写入。\n\n"
                    f"{summary}"
                )
            else:
                markdown = (
                    "已收到。如果这是一段经历/技能/目标，可以再说具体一点"
                    "（职责、指标、项目名），我会写入 Career Memory。"
                )
            # Always notify UI so Profile/sidebar can refresh even on deduped writes
            yield (
                "memory_updated",
                {
                    "count": saved_count,
                    "deduped": saved_count == 0,
                    "summary": (summary or "")[:200],
                },
            )
            async for event in _stream_answer(markdown):
                yield event
            assistant_message = save_assistant_message(db, conversation_id, markdown)
            yield (
                "conversation_updated",
                _finalize_conversation_meta(
                    db,
                    conversation,
                    user_message=user_message,
                    assistant_content=markdown,
                    intent="memory_update",
                ),
            )
            yield ("done", assistant_message.id)
            return
        except Exception as exc:
            yield ("error", f"Memory Agent 失败: {exc}")
            return

    # Phase 3: Resume Agent
    if intent_result.intent == "resume":
        decision = _should_run_resume_agent(user_message)
        if decision:
            try:
                task = decision["task"]
                if task == "optimize_from_memory":
                    resume_text = _memory_as_resume_text(memory_context)
                    if not resume_text:
                        decision = None  # fall through to LLM guidance
                    else:
                        decision = {
                            "task": "optimize",
                            "resume_text": resume_text,
                            "target_position": decision.get("target_position"),
                            "jd_text": decision.get("jd_text"),
                        }
                        task = "optimize"

                if decision and task == "optimize":
                    for event in progress(
                        agent="master",
                        title="路由到 Resume Agent",
                        detail="将基于真实简历做安全优化，并经 Evaluation 审核",
                        status="done",
                        phase="route",
                    ):
                        yield event
                    box = {}
                    async for event in _iter_agent_progress(
                        run_resume_optimize(
                            db,
                            user_id=user_id,
                            resume_text=decision["resume_text"],
                            target_position=decision.get("target_position"),
                            jd_text=decision.get("jd_text"),
                            conversation_id=conversation_id,
                        ),
                        agent="resume",
                        title="优化简历",
                        detail="Resume Agent → Evaluation 真实性检查",
                        heartbeat_messages=[
                            "正在对照 JD 改写有依据的表述…",
                            "Evaluation 正在核查是否虚构经历…",
                            "正在整理可投递版本…",
                        ],
                        result_box=box,
                    ):
                        yield event
                    result, record = box["value"]
                    markdown = format_optimize_markdown(result)
                    yield (
                        "resume_result",
                        {
                            "id": str(record.id),
                            "task_type": "optimize",
                            "result": result.model_dump(exclude={"evaluation"}),
                            "evaluation": result.evaluation,
                        },
                    )
                    if result.evaluation and result.evaluation.get("risk_level") == "high":
                        next_action = {
                            "trigger": "resume_high_risk_blocked",
                            "title": "先补齐真实事实",
                            "message": "本次简历优化被真实性检查阻断。请补充真实项目、职责边界、指标口径后再优化。",
                            "why": "Evaluation 检测到高风险虚构/夸大内容，直接进入面试会放大风险。",
                            "priority": "high",
                            "sources": [{"type": "evaluation", "label": "Resume Evaluation 高风险"}],
                        }
                    else:
                        next_action = recommend_after_resume_optimize(target_position=result.target_position)
                    persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
                    task_row = create_or_update_task(
                        db,
                        user_id,
                        goal=f"准备{result.target_position or '目标岗位'}简历",
                        task_type="resume_prepare",
                        conversation_id=conversation_id,
                        completed_step=None
                        if result.evaluation and result.evaluation.get("risk_level") == "high"
                        else "简历优化",
                        next_action=next_action.get("message"),
                        meta={"resume_version_id": str(record.id)},
                    )
                    task_row = sync_task_from_history(db, user_id, conversation_id=conversation_id) or task_row
                    yield ("task_updated", task_to_dict(task_row))
                    yield ("next_action", next_action)
                    async for event in _stream_answer(markdown):
                        yield event
                    assistant_message = save_assistant_message(db, conversation_id, markdown)
                    memory_agent = MemoryAgent()
                    extraction_result = await memory_agent.extract(user_message, memory_context)
                    saved_count = apply_extractions(db, user_id, extraction_result.extractions)
                    if saved_count > 0:
                        yield ("memory_updated", {"count": saved_count})
                    yield (
                        "conversation_updated",
                        _finalize_conversation_meta(
                            db,
                            conversation,
                            user_message=user_message,
                            assistant_content=markdown,
                            intent="resume",
                        ),
                    )
                    yield ("done", assistant_message.id)
                    return
                if decision and task == "star":
                    for event in progress(
                        agent="master",
                        title="路由到 Resume Agent",
                        detail="STAR 项目经历改写，并经 Evaluation 审核",
                        status="done",
                        phase="route",
                    ):
                        yield event
                    box = {}
                    async for event in _iter_agent_progress(
                        run_resume_star(
                            db,
                            user_id=user_id,
                            project_text=decision.get("project_text"),
                            resume_text=decision.get("resume_text"),
                            conversation_id=conversation_id,
                        ),
                        agent="resume",
                        title="STAR 项目改写",
                        detail="Resume Agent → Evaluation 真实性检查",
                        heartbeat_messages=[
                            "正在按 STAR 结构化项目经历…",
                            "Evaluation 正在核查是否夸大成果…",
                        ],
                        result_box=box,
                    ):
                        yield event
                    star, record, evaluation = box["value"]
                    lines = ["# STAR 项目经历优化", ""]
                    for item in star.items:
                        lines.append(f"## {item.project_name or '项目'}")
                        for label, val in [
                            ("Situation", item.situation),
                            ("Task", item.task),
                            ("Action", item.action),
                            ("Result", item.result),
                        ]:
                            if val:
                                lines.append(f"- **{label}：** {val}")
                        if item.missing_information:
                            lines.append(f"- **待补充：** {', '.join(item.missing_information)}")
                    if evaluation:
                        lines.append(f"\n## 真实性检查\n- 风险：{evaluation.get('risk_level')}")
                    markdown = "\n".join(lines)
                    yield (
                        "resume_result",
                        {
                            "id": str(record.id),
                            "task_type": "star",
                            "result": star.model_dump(),
                            "evaluation": evaluation,
                        },
                    )
                    async for event in _stream_answer(markdown):
                        yield event
                    assistant_message = save_assistant_message(db, conversation_id, markdown)
                    yield (
                        "conversation_updated",
                        _finalize_conversation_meta(
                            db,
                            conversation,
                            user_message=user_message,
                            assistant_content=markdown,
                            intent="resume",
                        ),
                    )
                    yield ("done", assistant_message.id)
                    return
                if decision and task == "parse":
                    for event in progress(
                        agent="master",
                        title="路由到 Resume Agent",
                        detail="解析简历结构并同步职业画像",
                        status="done",
                        phase="route",
                    ):
                        yield event
                    box = {}
                    async for event in _iter_agent_progress(
                        run_resume_parse(
                            db,
                            user_id=user_id,
                            resume_text=decision["resume_text"],
                            conversation_id=conversation_id,
                        ),
                        agent="resume",
                        title="解析简历",
                        detail="提取经历 / 项目 / 技能并写入 Career Memory",
                        heartbeat_messages=[
                            "正在结构化简历字段…",
                            "正在同步职业画像…",
                        ],
                        result_box=box,
                    ):
                        yield event
                    parsed, record = box["value"]
                    markdown = format_parse_markdown(parsed)
                    yield (
                        "resume_result",
                        {
                            "id": str(record.id),
                            "task_type": "parse",
                            "result": parsed.model_dump(),
                            "evaluation": None,
                        },
                    )
                    async for event in _stream_answer(markdown):
                        yield event
                    assistant_message = save_assistant_message(db, conversation_id, markdown)
                    yield ("memory_updated", {"count": 1})
                    yield (
                        "conversation_updated",
                        _finalize_conversation_meta(
                            db,
                            conversation,
                            user_message=user_message,
                            assistant_content=markdown,
                            intent="resume",
                        ),
                    )
                    yield ("done", assistant_message.id)
                    return
            except asyncio.TimeoutError:
                yield ("error", "Resume Agent 处理超时，请稍后重试或缩短简历/JD 内容。")
                return
            except Exception as exc:
                yield ("error", f"Resume Agent 失败: {exc}")
                return
        else:
            markdown = (
                "可以帮你优化简历，但我现在还缺少可验证材料。\n\n"
                "请先提供以下任一种信息：\n\n"
                "1. 上传或粘贴你的简历全文。\n"
                "2. 说明目标岗位，例如「AI 产品经理」。\n"
                "3. 如果有目标 JD，也一起贴上来。\n\n"
                "我会只基于你提供的真实经历优化，不会补写没有事实依据的项目、公司或指标。"
            )
            task = create_or_update_task(
                db,
                user_id,
                goal="准备并优化目标岗位简历",
                task_type="resume_prepare",
                conversation_id=conversation_id,
                next_action="上传或粘贴简历全文，并补充目标岗位/JD",
                meta={"source": "resume_info_required"},
            )
            next_action = {
                "trigger": "resume_info_required",
                "title": "补充简历材料",
                "message": "请上传或粘贴简历全文，并补充目标岗位或 JD。",
                "why": "没有原始简历时直接优化容易虚构经历；先补齐事实材料才能安全改写。",
                "priority": "high",
                "sources": [{"type": "workflow", "label": "简历优化前置材料检查"}],
                "actions": [
                    {"id": "upload_resume", "label": "上传简历", "intent": "resume"},
                    {"id": "paste_jd", "label": "粘贴目标 JD", "intent": "jd_analysis"},
                ],
            }
            persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
            yield ("task_updated", task_to_dict(task))
            yield ("next_action", next_action)
            async for event in _stream_answer(markdown):
                yield event
            assistant_message = save_assistant_message(db, conversation_id, markdown)
            yield (
                "conversation_updated",
                _finalize_conversation_meta(
                    db,
                    conversation,
                    user_message=user_message,
                    assistant_content=markdown,
                    intent="resume",
                ),
            )
            yield ("done", assistant_message.id)
            return

    # Phase 2: Job Intelligence
    if intent_result.intent == "jd_analysis":
        should_run, jd_text, position, company = _should_run_job_agent(user_message)
        if should_run:
            try:
                for event in progress(
                    agent="master",
                    title="路由到 JD Analysis Agent",
                    detail="将解析岗位要求，并对比你的职业记忆做差距分析",
                    status="done",
                    phase="route",
                ):
                    yield event
                box = {}
                async for event in _iter_agent_progress(
                    run_job_analysis(
                        db,
                        user_id=user_id,
                        jd_text=jd_text,
                        position=position,
                        company=company,
                        input_type="jd_text" if jd_text else "position_company",
                        conversation_id=conversation_id,
                    ),
                    agent="job",
                    title="分析岗位 JD",
                    detail="Job Agent → Evaluation → Career Gap",
                    heartbeat_messages=[
                        "正在提取职责、技能与隐藏要求…",
                        "正在检索公司 / 行业上下文…",
                        "Evaluation 正在核查真实性…",
                        "Career Gap 正在对比你的经历与岗位要求…",
                    ],
                    result_box=box,
                ):
                    yield event
                analysis, record, gap = box["value"]
                for event in progress(
                    agent="job",
                    title="岗位分析完成",
                    detail=analysis.position_overview.position or position or "目标岗位",
                    status="done",
                    phase="run",
                ):
                    yield event
                if gap is not None:
                    for event in progress(
                        agent="career_gap",
                        title="能力差距分析完成",
                        detail=f"匹配度 {gap.match_score}%",
                        status="done",
                        phase="run",
                    ):
                        yield event
                markdown = format_analysis_markdown(analysis, career_gap=gap)
                yield (
                    "job_analysis",
                    {
                        "id": str(record.id),
                        "analysis": analysis.model_dump(exclude={"evaluation"}),
                        "evaluation": analysis.evaluation,
                        "career_gap": gap.model_dump() if gap else None,
                    },
                )
                gaps = (
                    [g.title for g in gap.gaps]
                    if gap and gap.gaps
                    else list(analysis.user_match.gaps or []) if analysis.user_match else []
                )
                ext_sources = list(analysis.company_analysis.sources or []) if analysis.company_analysis else []
                next_action = recommend_after_job_analysis(
                    position=analysis.position_overview.position,
                    company=analysis.position_overview.company,
                    match_gaps=gaps,
                    external_sources=ext_sources,
                )

                # Phase 8.1: Career Gap already ran inside job analysis; enrich stream + task
                if gap is not None:
                    yield ("career_gap", gap.model_dump())
                    if gap.recommendations:
                        next_action = {
                            **next_action,
                            "why": gap.recommendations[0].why or next_action.get("why"),
                            "priority": gap.recommendations[0].priority,
                            "sources": (next_action.get("sources") or [])
                            + [{"type": "gap", "label": "Career Gap Analysis"}],
                            "plan": [
                                {
                                    "step": r.action,
                                    "reason": r.why,
                                    "source": "Career Gap",
                                    "priority": r.priority,
                                }
                                for r in gap.recommendations[:3]
                            ],
                        }
                try:
                    task = create_or_update_task(
                        db,
                        user_id,
                        goal=f"准备{(analysis.position_overview.company or '')}{(analysis.position_overview.position or '目标')}岗位",
                        task_type="interview_prepare",
                        conversation_id=conversation_id,
                        completed_step="JD分析",
                        next_action=next_action.get("message"),
                        meta={"position": analysis.position_overview.position},
                    )
                    task = sync_task_from_history(db, user_id, conversation_id=conversation_id) or task
                    yield ("task_updated", task_to_dict(task))
                except Exception:
                    pass

                persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
                yield ("next_action", next_action)
                async for event in _stream_answer(markdown):
                    yield event

                assistant_message = save_assistant_message(db, conversation_id, markdown)

                memory_agent = MemoryAgent()
                extraction_result = await memory_agent.extract(user_message, memory_context)
                saved_count = apply_extractions(db, user_id, extraction_result.extractions)
                if saved_count > 0:
                    yield ("memory_updated", {"count": saved_count})

                yield (
                    "conversation_updated",
                    _finalize_conversation_meta(
                        db,
                        conversation,
                        user_message=user_message,
                        assistant_content=markdown,
                        intent="jd_analysis",
                    ),
                )
                yield ("done", assistant_message.id)
                return
            except asyncio.TimeoutError:
                yield ("error", "Job Agent 分析超时，请稍后重试或缩短 JD 内容。")
                return
            except Exception as exc:
                yield ("error", f"Job Agent 分析失败: {exc}")
                return

    # Phase 6/8: Career companionship + Career Intelligence Layer
    if intent_result.intent == "career_consult" or looks_like_emotional_need(user_message):
        try:
            intel_md = ""
            next_action = None
            if _wants_career_intelligence(user_message):
                for event in progress(
                    agent="master",
                    title="路由到 Career / Gap 分析",
                    detail="将结合画像与目标做差距分析与行动计划",
                    status="done",
                    phase="route",
                ):
                    yield event
                box = {}
                async for event in _iter_agent_progress(
                    intelligence_for_message(
                        db,
                        user_id,
                        user_message,
                        conversation_id=conversation_id,
                        intent=intent_result.intent,
                        force_gap=True,
                    ),
                    agent="career_gap",
                    title="职业差距与计划",
                    detail="Career Gap → Recommendation",
                    heartbeat_messages=[
                        "正在对比目标岗位与 Career Memory…",
                        "正在生成可执行提升建议…",
                    ],
                    result_box=box,
                ):
                    yield event
                intel = box["value"]
                if intel.get("gap"):
                    yield ("career_gap", intel["gap"])
                if intel.get("task"):
                    yield ("task_updated", intel["task"])
                if intel.get("next_action"):
                    next_action = intel["next_action"]
                    persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
                    yield ("next_action", next_action)
                intel_md = intel.get("markdown") or ""

            for event in progress(
                agent="career",
                title="生成陪伴式回复",
                detail="结合求职状态与最新差距分析",
                phase="run",
            ):
                yield event
            box = {}
            async for event in _iter_agent_progress(
                CareerAgent().advise(
                    user_message=user_message,
                    memory_context=memory_context,
                    career_status_context=career_ctx
                    + ("\n\n## 最新差距与计划\n" + intel_md[:2000] if intel_md else ""),
                    mood=detect_mood(user_message),
                ),
                agent="career",
                title="Career Agent 思考中",
                heartbeat_messages=["正在组织可执行的下一步…"],
                result_box=box,
            ):
                yield event
            reply = box["value"]
            if intel_md:
                reply = reply + "\n\n---\n\n" + intel_md
            elif career_status.next_action and not next_action:
                next_action = recommend_from_career_status(
                    next_action=career_status.next_action,
                    stage_label=STAGE_LABELS.get(career_status.stage, career_status.stage),
                    last_interview_score=career_status.last_interview_score,
                    weakness=career_status.weakness,
                )
                persist_next_action(db, user_id, next_action, conversation_id=conversation_id)
                yield ("next_action", next_action)
            async for event in _stream_answer(reply):
                yield event
            assistant_message = save_assistant_message(db, conversation_id, reply)
            yield (
                "conversation_updated",
                _finalize_conversation_meta(
                    db,
                    conversation,
                    user_message=user_message,
                    assistant_content=reply,
                    intent="career_consult",
                ),
            )
            yield ("done", assistant_message.id)
            return
        except Exception as exc:
            yield ("error", f"Career 陪伴失败: {exc}")
            return

    for event in progress(
        agent="master",
        title="直接对话回答",
        detail="无需专项 Agent，开始生成回复",
        status="done",
        phase="route",
    ):
        yield event

    llm_messages = build_llm_messages(
        db,
        conversation_id,
        user_message,
        memory_context,
        intent_result,
        career_status_context=career_ctx,
    )

    provider = get_llm_provider()
    collected: list[str] = []
    emitted = ""
    try:
        for event in progress(
            agent="master",
            title="正在组织回复",
            phase="answer",
        ):
            yield event
        async for token in provider.chat(llm_messages):
            collected.append(token)
            cleaned = strip_decorative_emoji("".join(collected))
            delta = cleaned[len(emitted) :]
            if delta:
                emitted = cleaned
                yield ("token", delta)
    except Exception as exc:
        yield ("error", str(exc))
        return

    assistant_content = strip_decorative_emoji("".join(collected))
    assistant_message = save_assistant_message(db, conversation_id, assistant_content)

    for event in progress(
        agent="memory",
        title="沉淀本轮对话到 Career Memory",
        phase="run",
    ):
        yield event
    memory_agent = MemoryAgent()
    updated_memory_context = build_memory_context(db, user_id)
    extraction_result = await memory_agent.extract(user_message, updated_memory_context)
    saved_count = apply_extractions(db, user_id, extraction_result.extractions)
    if saved_count > 0:
        for event in progress(
            agent="memory",
            title=f"已更新 {saved_count} 条记忆",
            status="done",
            phase="run",
        ):
            yield event
        yield ("memory_updated", {"count": saved_count})

    yield (
        "conversation_updated",
        _finalize_conversation_meta(
            db,
            conversation,
            user_message=user_message,
            assistant_content=assistant_content,
            intent=intent_result.intent,
        ),
    )
    yield ("done", assistant_message.id)
