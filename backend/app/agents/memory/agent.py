"""Memory Agent — extract career information from conversations."""

import json
import re

from app.agents.memory.schema import MemoryExtraction, MemoryExtractionResult
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt


class MemoryAgent:
    """Extracts career memory from user messages."""

    async def extract(self, user_message: str, existing_memory: str = "") -> MemoryExtractionResult:
        system_prompt = load_agent_prompt("memory")
        user_content = (
            f"## 已有职业记忆\n{existing_memory or '（暂无）'}\n\n"
            f"## 用户最新消息\n{user_message}\n\n"
            "请提取新的职业信息，避免与已有记忆重复。"
            "若用户表达「没有真实…经验 / 只上过课程 / 不要虚构」，必须输出 constraint_memory。"
        )

        provider = get_llm_provider()
        raw = await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
        result = _parse_extractions(raw)
        # Merge rule-based fallback for constraints / short career facts
        try:
            from app.memory.service import rule_based_extractions

            rules = rule_based_extractions(user_message)
        except Exception:
            rules = []
        if rules:
            existing_keys = {f"{e.type}:{sorted((e.data or {}).items())}" for e in result.extractions}
            for item in rules:
                key = f"{item.type}:{sorted((item.data or {}).items())}"
                if key not in existing_keys:
                    result.extractions.append(item)
                    existing_keys.add(key)
        return result

    async def run(self, input_data: dict) -> dict:
        result = await self.extract(
            user_message=input_data.get("message", ""),
            existing_memory=input_data.get("existing_memory", ""),
        )
        return result.model_dump()


def _parse_extractions(raw: str) -> MemoryExtractionResult:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
        items = data.get("extractions", [])
        extractions: list[MemoryExtraction] = []
        for item in items:
            try:
                extractions.append(MemoryExtraction.model_validate(item))
            except Exception:
                continue
        return MemoryExtractionResult(extractions=extractions)
    except (json.JSONDecodeError, TypeError):
        return MemoryExtractionResult()


# Keep extract() able to merge rule-based fallback at call sites when empty.
