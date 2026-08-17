# Prompt 规格总表

> 优化项 P1-3。路径均相对 `backend/app/agents/`。

| Agent | prompt.md | 对用户 | 关键红线 | 关联评测 | 最近报告 |
|-------|-----------|--------|----------|----------|----------|
| master | master/prompt.md | 否 | 只输出 intent JSON；否定事实优先 memory_update | master intent 单测 | 8/8 |
| memory | memory/prompt.md | 否 | 只提取明确陈述；constraint 必提 | MEMORY 验收 M01–M07 | 历史 0/7 |
| resume | resume/prompt.md | 是 | 禁止虚构项目/数据/职责升级 | resume_hallucination.json | 8/8 |
| job | job/prompt.md | 是 | 推测须标注；禁止解析失败糊弄 | jd_analysis.json | 6/8→兜底 |
| interview | interview/prompt.md | 是 | 复盘基于对话；禁虚构经历 | interview_answer.json | 6/7→兜底 |
| career | career/prompt.md | 是 | 禁止空泛鸡汤；须引用状态数据 | Career 报告 | 6/6 |
| career_gap | career_gap/prompt.md | 是 | 优势/缺口须 evidence | career_gap.json | 6/7 |
| recommendation | recommendation/prompt.md | 是 | 每条 why+sources；禁保证 offer | Recommendation 报告 | 4/6→兜底 |
| evaluation | evaluation/prompt.md | 否 | 风险分档；防误伤合理归纳 | 上述 datasets + Eval 报告 | 6/7 |

**变更规则**：改任一 prompt → 重跑对应 QUALITY_REPORT 或 dataset_runner → 更新本表「最近报告」列。
