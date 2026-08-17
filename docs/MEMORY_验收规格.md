# Career Memory 验收规格

> 对应优化项 P0b-1。质量报告历史：`MEMORY_AGENT_QUALITY_REPORT.md` 曾录得 **0/7**（经历被路由成简历索要、Profile 未命中）。  
> 代码修复点：`chat_service._looks_like_memory_share`、`memory.service.rule_based_extractions`、Master fallback。

## 1. 验收原则

| 原则 | 说明 |
|------|------|
| 事实优先入库 | 用户明确陈述的经历/技能/目标/否定约束必须写入，不得要求「先上传完整简历」才肯记 |
| 否定性约束不可丢 | 「没有真实…经验」必须落 `constraint_memory` / 摘要【约束】 |
| 纠正覆盖旧值 | 「年限不是 3 年是 5 年」以纠正后为准 |
| 与简历优化分离 | 未出现「优化/改/定制简历」时，不得走 Resume 索要材料话术 |

## 2. 用例表（手工 / 自动化）

| ID | 用户输入（示例） | 期望 intent | Profile/Memory 命中 | 用户可见回复不得包含 |
|----|------------------|-------------|---------------------|----------------------|
| M01 | 我之前负责浏览器用户增长，负责 DAU 提升和用户留存优化。 | memory_update | experiences 或 summary 含增长/DAU/留存 | 请上传或粘贴简历全文 |
| M02 | 我做过一个新用户增长项目，负责用户分层、首页推荐入口和 A/B 实验。 | memory_update | projects 有记录 | 同上 |
| M03 | 我的主要技能是需求分析、用户研究、数据分析、跨团队推进。 | memory_update | skills ≥1 | 同上 |
| M04 | 我的目标岗位是 AI 产品经理。 | memory_update | target_position=AI产品经理 | 强制先改简历 |
| M05 | 我没有真实 RAG 项目经验，只上过一门 RAG 课程。 | memory_update | summary 含【约束】或 focus 含限制 | 写成「丰富 RAG 经验」 |
| M06 | 纠正一下，我的工作年限不是 3 年，是 5 年。 | memory_update | experience_year=5 | 仍显示 3 年 |
| M07 | 根据刚才的信息，我的优势是什么？ | career_consult 或 general | 回答引用已入库事实 | 声称无任何记录且编造优势 |

**P0 出站线**：M01–M06 至少 **5/6** 通过（理想 6/6）；M07 为加分。

## 3. 离线门禁

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.agents.master.test_memory_intent
.\.venv\Scripts\python.exe scripts\acceptance_quality_fixes.py
```

## 4. 关闭标准

- [ ] 上表手工勾选达标  
- [ ] `test_memory_intent` 全绿  
- [ ] VERIFY 差异化硬门槛「Memory 否定约束」勾选  
- [ ] 更新或附注 `MEMORY_AGENT_QUALITY_REPORT.md`（重跑 live 套件后）
