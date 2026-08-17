"""Recommendation Agent — plan next actions from memory/gap/task."""

from __future__ import annotations

import json
import re

from app.agents.recommendation.schema import PlanStep, RecommendationItem, RecommendationPlan
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt


class RecommendationAgent:
    """Builds an actionable plan with why/sources/priority."""

    async def plan(
        self,
        *,
        user_goal: str,
        memory_context: str = "",
        gap_context: str = "",
        task_context: str = "",
        history_context: str = "",
    ) -> RecommendationPlan:
        system_prompt = load_agent_prompt("recommendation")
        user_content = (
            f"## 用户目标\n{user_goal}\n\n"
            f"## Career Memory\n{memory_context or '（暂无）'}\n\n"
            f"## Career Gap\n{gap_context or '（暂无）'}\n\n"
            f"## Task Memory\n{task_context or '（暂无）'}\n\n"
            f"## 历史行为\n{history_context or '（暂无）'}\n\n"
            "请输出完整 JSON 行动计划。每条建议必须有 why 与 sources。"
            "禁止输出「行动计划解析失败」等内部错误文案。"
        )
        provider = get_llm_provider()
        raw = await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
        )
        result = _parse_result(raw, user_goal=user_goal)
        if user_goal and not result.goal:
            result.goal = user_goal
        if _is_failed_plan(result):
            return _fallback_plan(user_goal)
        return result

    async def run(self, input_data: dict) -> dict:
        result = await self.plan(
            user_goal=input_data.get("user_goal", ""),
            memory_context=input_data.get("memory_context", ""),
            gap_context=input_data.get("gap_context", ""),
            task_context=input_data.get("task_context", ""),
            history_context=input_data.get("history_context", ""),
        )
        return result.model_dump()


def _is_failed_plan(plan: RecommendationPlan) -> bool:
    blob = f"{plan.summary or ''}{plan.primary_action or ''}"
    if "解析失败" in blob or "行动计划解析失败" in blob:
        return True
    if not plan.plan and not plan.recommendations and not plan.primary_action:
        return True
    return False


def _fallback_plan(user_goal: str) -> RecommendationPlan:
    """User-readable rule fallback — never expose internal parse errors."""
    goal = (user_goal or "").strip() or "推进当前求职准备"
    source = {"type": "workflow", "label": "求职工作流兜底"}

    if any(k in goal for k in ["1小时", "一小时", "30分钟", "今天", "半小时"]):
        steps = [
            PlanStep(
                step="0–15 分钟：明确本场目标岗位与 3 个必问点",
                reason="时间盒内先对齐目标，避免盲目准备",
                source="用户时间约束",
                priority="high",
            ),
            PlanStep(
                step="15–40 分钟：用 STAR 重讲 1 段核心项目（含指标口径）",
                reason="面试高频考察项目深挖与量化结果",
                source="Interview / Resume 工作流",
                priority="high",
            ),
            PlanStep(
                step="40–60 分钟：过 2 道岗位相关追问并写下改进点",
                reason="快速闭环：练习→发现问题→记下下次改进",
                source="Interview 工作流",
                priority="medium",
            ),
        ]
        primary = "按 60 分钟时间盒完成：对齐目标 → STAR 复述 → 两道追问复盘"
        summary = "你只有有限准备时间，下面按时间盒拆解，先做最高杠杆的练习。"
    elif any(k in goal for k in ["JD分析后", "JD 分析后", "岗位分析后", "分析完JD", "分析完岗位"]):
        steps = [
            PlanStep(
                step="从 JD 提取能力差距清单（必会 / 加分 / 隐藏要求）",
                reason="把分析结论变成可执行差距项",
                source="Job / Career Gap",
                priority="high",
            ),
            PlanStep(
                step="按差距改一版针对性简历（补证据，不虚构）",
                reason="投递前需要岗位关键词与真实经历对齐",
                source="Resume 工作流",
                priority="high",
            ),
            PlanStep(
                step="准备 5 个可能被追问的面试问题并写要点",
                reason="JD 关键词通常会转化为面试追问",
                source="Interview 工作流",
                priority="medium",
            ),
        ]
        primary = "提取差距 → 改简历补证据 → 准备面试追问"
        summary = "JD 分析完成后，优先把差距落到简历证据和面试题准备上。"
    elif any(k in goal for k in ["简历优化后", "改完简历", "优化完简历"]):
        steps = [
            PlanStep(
                step="检查简历中每条成果是否有证据与指标口径",
                reason="避免投递后被追问时说不清",
                source="Resume / Evaluation",
                priority="high",
            ),
            PlanStep(
                step="补齐 1 个与目标岗位最相关的项目段落（真实经历）",
                reason="岗位匹配度取决于可验证项目",
                source="Career Memory",
                priority="high",
            ),
            PlanStep(
                step="做投递前检查：岗位关键词、联系方式、文件命名",
                reason="减少因材料不完整导致的无效投递",
                source="求职工作流",
                priority="medium",
            ),
        ]
        primary = "补证据 / 补相关项目 / 投递前检查"
        summary = "简历优化后，下一步应验证证据完整性并完成投递检查。"
    elif any(k in goal for k in ["面试复盘", "复盘后", "模拟面试后"]):
        steps = [
            PlanStep(
                step="从复盘中挑出得分最低的 1–2 个短板",
                reason="专项训练比平均用力更有效",
                source="Interview Review",
                priority="high",
            ),
            PlanStep(
                step="针对短板做 15 分钟专项追问训练（录音或文字）",
                reason="把复盘结论变成可重复练习",
                source="Interview 工作流",
                priority="high",
            ),
            PlanStep(
                step="用改进后的答案再跑半轮模拟面试验证",
                reason="用下一轮表现验证训练是否生效",
                source="Interview 工作流",
                priority="medium",
            ),
        ]
        primary = "按复盘短板做专项训练，再用半轮模拟验证"
        summary = "面试复盘后，优先针对短板做专项训练，而不是立刻海投。"
    else:
        steps = [
            PlanStep(
                step="确认目标岗位与一份完整 JD",
                reason="没有岗位标准时，建议容易空泛",
                source="Job 工作流",
                priority="high",
            ),
            PlanStep(
                step="对照 JD 补齐简历中可验证的项目证据",
                reason="匹配度取决于真实经历，而非堆砌关键词",
                source="Resume / Memory",
                priority="high",
            ),
            PlanStep(
                step="完成 1 次模拟面试并记录短板",
                reason="用实战暴露表达与迁移逻辑问题",
                source="Interview 工作流",
                priority="medium",
            ),
        ]
        primary = steps[0].step
        summary = "先对齐目标与材料，再进入面试训练；以下为可执行兜底计划。"

    # Opening diversity: time-box / post-JD / post-resume / review first
    if "焦虑" in goal or "迷茫" in goal or "压力" in goal:
        summary = "先稳住节奏：把焦虑拆成今天能完成的 2–3 个动作。" + summary

    recommendations = [
        RecommendationItem(
            action=primary,
            why=summary,
            sources=[source],
            priority="high",
        ),
        RecommendationItem(
            action=steps[1].step if len(steps) > 1 else primary,
            why=steps[1].reason if len(steps) > 1 else "推进求职准备",
            sources=[source, {"type": "goal", "label": "用户目标"}],
            priority="medium",
        ),
    ]
    return RecommendationPlan(
        goal=goal,
        plan=steps,
        recommendations=recommendations,
        primary_action=primary,
        summary=summary,
    )


def _parse_result(raw: str, user_goal: str = "") -> RecommendationPlan:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        plan = RecommendationPlan.model_validate(data)
        if _is_failed_plan(plan):
            return _fallback_plan(user_goal)
        return plan
    except (json.JSONDecodeError, TypeError, ValueError):
        return _fallback_plan(user_goal)
