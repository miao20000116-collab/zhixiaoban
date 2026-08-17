"""Master Agent — intent classification and routing."""

import json
import re

from app.agents.master.schema import INTENT_AGENT_MAP, MasterAgentResult
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt


class MasterAgent:
    """Classifies user intent and determines agent routing."""

    async def classify(
        self,
        user_message: str,
        memory_context: str = "",
        task_context: str = "",
    ) -> MasterAgentResult:
        system_prompt = load_agent_prompt("master")
        user_content = (
            f"## 用户职业记忆\n{memory_context or '（暂无）'}\n\n"
            f"## 当前 Task Memory\n{task_context or '（暂无进行中的任务）'}\n\n"
            f"## 用户消息\n{user_message}"
        )

        provider = get_llm_provider()
        raw = await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            max_tokens=256,
            thinking=False,
        )

        return _parse_result(raw, user_message)

    async def run(self, input_data: dict) -> dict:
        result = await self.classify(
            user_message=input_data.get("message", ""),
            memory_context=input_data.get("memory_context", ""),
            task_context=input_data.get("task_context", ""),
        )
        return result.model_dump()


def _parse_result(raw: str, user_message: str) -> MasterAgentResult:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
        intent = data.get("intent", "general_chat")
        if intent not in INTENT_AGENT_MAP:
            intent = "general_chat"
        need_agent = data.get("need_agent", INTENT_AGENT_MAP.get(intent))
        confidence = float(data.get("confidence", 0.5))
        return MasterAgentResult(
            intent=intent,
            confidence=min(max(confidence, 0.0), 1.0),
            need_agent=need_agent,
        )
    except (json.JSONDecodeError, TypeError, ValueError):
        return _fallback_classify(user_message)


def _fallback_classify(user_message: str) -> MasterAgentResult:
    """Keyword fallback when LLM JSON parsing fails."""
    text = user_message.lower()
    # Constraints / anti-fabrication first — even if sentence also mentions 简历/面试
    constraint_keys = [
        "没有真实",
        "只上过",
        "只是上过",
        "不要虚构",
        "不希望虚构",
        "禁止虚构",
        "【约束】",
    ]
    if any(k in user_message for k in constraint_keys):
        return MasterAgentResult(
            intent="memory_update",
            confidence=0.9,
            need_agent=INTENT_AGENT_MAP["memory_update"],
        )
    # Memory facts next — before resume keywords like 经历
    memory_keys = [
        "我之前",
        "我做过",
        "我的经历",
        "记住",
        "补充一下",
        "我的技能",
        "目标岗位是",
        "纠正一下",
        "工作年限",
    ]
    if any(k in user_message for k in memory_keys):
        return MasterAgentResult(
            intent="memory_update",
            confidence=0.85,
            need_agent=INTENT_AGENT_MAP["memory_update"],
        )
    rules: list[tuple[list[str], str]] = [
        (["优化简历", "定制简历", "改简历", "简历优化", "star", "自我介绍"], "resume"),
        (["jd", "岗位分析", "招聘", "job description", "分析岗位"], "jd_analysis"),
        (["面试", "模拟", "技术面", "追问", "复盘", "问我一些技术"], "interview"),
        (["职业", "规划", "offer", "方向", "咨询"], "career_consult"),
    ]
    for keywords, intent in rules:
        if any(kw in text for kw in keywords):
            return MasterAgentResult(
                intent=intent,
                confidence=0.6,
                need_agent=INTENT_AGENT_MAP[intent],
            )
    return MasterAgentResult(intent="general_chat", confidence=0.7, need_agent=None)
