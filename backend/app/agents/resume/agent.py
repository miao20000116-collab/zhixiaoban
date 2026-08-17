"""Resume Agent — parse, diagnose, STAR rewrite, JD-tailored optimization."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from app.agents.resume.schema import (
    ResumeDiagnosisResult,
    ResumeOptimizeResult,
    ResumeParseResult,
    STAROptimizeResult,
)
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt

TaskType = Literal["parse", "diagnose", "star", "optimize"]


class ResumeAgent:
    """Resume parsing and optimization with anti-fabrication constraints."""

    async def parse(self, resume_text: str, *, memory_context: str = "") -> ResumeParseResult:
        raw = await self._complete("parse", resume_text=resume_text, memory_context=memory_context)
        return _parse_model(raw, ResumeParseResult)

    async def diagnose(
        self,
        *,
        resume_text: str,
        parsed: ResumeParseResult | None = None,
        target_position: str | None = None,
        jd_text: str | None = None,
        memory_context: str = "",
    ) -> ResumeDiagnosisResult:
        raw = await self._complete(
            "diagnose",
            resume_text=resume_text,
            parsed=parsed,
            target_position=target_position,
            jd_text=jd_text,
            memory_context=memory_context,
        )
        return _parse_model(raw, ResumeDiagnosisResult)

    async def optimize_star(
        self,
        *,
        project_text: str | None = None,
        resume_text: str | None = None,
        memory_context: str = "",
    ) -> STAROptimizeResult:
        if not project_text and not resume_text:
            raise ValueError("需要提供项目描述或简历文本以生成 STAR")
        raw = await self._complete(
            "star",
            resume_text=resume_text,
            project_text=project_text,
            memory_context=memory_context,
        )
        return _parse_model(raw, STAROptimizeResult)

    async def optimize(
        self,
        *,
        resume_text: str,
        target_position: str | None = None,
        jd_text: str | None = None,
        memory_context: str = "",
    ) -> ResumeOptimizeResult:
        if not target_position and not jd_text:
            raise ValueError("请提供目标岗位或目标 JD")
        raw = await self._complete(
            "optimize",
            resume_text=resume_text,
            target_position=target_position,
            jd_text=jd_text,
            memory_context=memory_context,
        )
        result = _parse_model(raw, ResumeOptimizeResult)
        if not result.target_position:
            result.target_position = target_position
        return result

    async def run(self, input_data: dict) -> dict:
        task = input_data.get("task", "optimize")
        if task == "parse":
            return (await self.parse(input_data.get("resume_text", ""), memory_context=input_data.get("memory_context", ""))).model_dump()
        if task == "diagnose":
            return (
                await self.diagnose(
                    resume_text=input_data.get("resume_text", ""),
                    target_position=input_data.get("target_position"),
                    jd_text=input_data.get("jd_text"),
                    memory_context=input_data.get("memory_context", ""),
                )
            ).model_dump()
        if task == "star":
            return (
                await self.optimize_star(
                    project_text=input_data.get("project_text"),
                    resume_text=input_data.get("resume_text"),
                    memory_context=input_data.get("memory_context", ""),
                )
            ).model_dump()
        return (
            await self.optimize(
                resume_text=input_data.get("resume_text", ""),
                target_position=input_data.get("target_position"),
                jd_text=input_data.get("jd_text"),
                memory_context=input_data.get("memory_context", ""),
            )
        ).model_dump()

    async def _complete(
        self,
        task: TaskType,
        *,
        resume_text: str | None = None,
        project_text: str | None = None,
        parsed: ResumeParseResult | None = None,
        target_position: str | None = None,
        jd_text: str | None = None,
        memory_context: str = "",
    ) -> str:
        system_prompt = load_agent_prompt("resume")
        # Layered inputs: resume_text is sole fact source; memory is constraints / verify-only.
        parts = [f"## 任务类型\n{task}"]
        if resume_text:
            parts.append(
                "\n## 简历原文（唯一事实来源）\n"
                "以下文本是生成/改写的唯一事实依据；不得新增此处未出现的公司、项目、指标、职级或技术栈。\n"
                f"{resume_text}"
            )
        if project_text:
            parts.append(f"\n## 项目描述（事实来源）\n{project_text}")
        if memory_context:
            parts.append(
                "\n## 约束记忆（一票否决）\n"
                "仅含目标摘要与【约束】。必须遵守；不得把课程/练习写成真实落地项目；"
                "不得从其他职业记忆合并进简历正文。\n"
                f"{memory_context}"
            )
        else:
            parts.append("\n## 约束记忆（一票否决）\n（暂无）")
        if parsed:
            parts.append(f"\n## 已解析结构\n```json\n{parsed.model_dump_json(indent=2)}\n```")
        if target_position:
            parts.append(f"\n## 目标岗位\n{target_position}")
        if jd_text:
            parts.append(f"\n## 目标 JD\n{jd_text}")
        parts.append(
            "\n## 再次强调\n"
            "1. 简历原文是唯一事实来源；禁止把未出现在原文的公司/项目/指标写入 optimized_resume。\n"
            "2. 若约束记忆含【约束】（如无真实 RAG 项目），不得写成落地项目，只能写学习/待补充。\n"
            "3. 信息不足请写入 missing_information，不要猜测补全。\n"
            f"请输出 {task} 对应的完整 JSON。"
        )

        provider = get_llm_provider()
        return await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "\n".join(parts)},
            ],
            temperature=0.2,
        )


def _strip_json(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


def _parse_model(raw: str, model: type[Any]) -> Any:
    cleaned = _strip_json(raw)
    try:
        data = json.loads(cleaned)
        return model.model_validate(data)
    except (json.JSONDecodeError, TypeError, ValueError):
        if model is ResumeParseResult:
            return ResumeParseResult(missing_information=["简历解析失败，请重新上传或粘贴文本"])
        if model is ResumeDiagnosisResult:
            return ResumeDiagnosisResult(
                overall_score=0,
                problems=[],
                missing_information=["诊断结果解析失败"],
            )
        if model is STAROptimizeResult:
            return STAROptimizeResult(notes=["STAR 结果解析失败"])
        return ResumeOptimizeResult(
            optimized_resume="优化结果解析失败，请重试。",
            missing_information=["优化结果解析失败"],
        )
