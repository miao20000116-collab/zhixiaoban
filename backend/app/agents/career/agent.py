"""Career companionship — data-backed guidance (Master capability, not empty pep-talk)."""

from __future__ import annotations

from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt


class CareerAgent:
    """Produces actionable career guidance using Career Status + Memory facts."""

    async def advise(
        self,
        *,
        user_message: str,
        memory_context: str = "",
        career_status_context: str = "",
        mood: str | None = None,
    ) -> str:
        system_prompt = load_agent_prompt("career")
        user_content = (
            f"{career_status_context}\n\n"
            f"## 职业记忆\n{memory_context or '（暂无）'}\n\n"
            f"## 情绪信号\n{mood or 'neutral'}\n\n"
            f"## 用户消息\n{user_message}\n\n"
            "请给出基于事实的陪伴回复：引用面试次数/得分/短板等数据，给出 1–3 条可执行下一步。"
            "禁止空泛鼓励。"
        )
        provider = get_llm_provider()
        return await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.4,
        )

    async def run(self, input_data: dict) -> dict:
        text = await self.advise(
            user_message=input_data.get("user_message", ""),
            memory_context=input_data.get("memory_context", ""),
            career_status_context=input_data.get("career_status_context", ""),
            mood=input_data.get("mood"),
        )
        return {"reply": text}


def looks_like_emotional_need(text: str) -> bool:
    keys = [
        "焦虑",
        "压力",
        "被拒",
        "迷茫",
        "难过",
        "崩溃",
        "没信心",
        "好累",
        "怎么办",
        "挂了",
        "面试失败",
        "连续失败",
        "心情不好",
    ]
    return any(k in text for k in keys)
