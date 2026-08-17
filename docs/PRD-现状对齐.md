# PRD 现状对齐（短文）

> 优化项 P1-2。长文仍见 [prd.md](./prd.md)（文首状态可能仍写「MVP设计阶段」——以本文 + README Phase ✅ 为准）。

## 1. 已实现范围（对照 README Phase 0–8）

| 能力 | 状态 | 入口 |
|------|------|------|
| Chat / 多窗口 / SSE | ✅ | `/` |
| Master 路由 + Task | ✅ | chat |
| Memory / Profile | ✅（质量需守门） | Profile / 侧栏 |
| Job + Gap | ✅ | JD 上传/粘贴 |
| Resume + Eval | ✅ | 简历优化 |
| Interview 文字+语音 | ✅ | 语音面试面板 |
| Recommendation / Next Action | ✅ | 侧栏建议 |
| Dashboard | ✅ | `/dashboard` |
| 强 RAG 主路径 | ❌ 预留 | pgvector |

## 2. AI 功能失败态（产品期望）

| 场景 | 用户应看到 |
|------|------------|
| 无简历却要优化 | 索要简历/JD；可基于 Memory 优化时说明来源 |
| 仅岗位+公司无线索 JD | 「推测分析」+ 匹配暂不评分；禁止「解析失败」 |
| 面试复盘 JSON 失败 | 基于对话的兜底复盘；禁止「解析失败」 |
| 推荐计划 JSON 失败 | 带 why/sources 的时间盒/工作流兜底计划 |
| Eval high | 阻断可投递结果 + 问题列表 |
| Gap 信息不足 | 「暂不评分」 |
| Memory 补充事实 | 确认已记住；禁止无故索要完整简历 |

## 3. 与长 PRD 的关系

- 目标用户、愿景：继承 prd.md  
- 实现真伪、失败态、验收：以本文 + VERIFY + 各 prompt 为准  
