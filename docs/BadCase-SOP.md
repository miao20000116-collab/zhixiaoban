# BadCase 归因与回归 SOP

> 优化项 P0c-3。

## 1. 何时记 BadCase

- Evaluation `risk_level=high` 自动入库（架构 Phase5）  
- 用户点踩 / 演示翻车 / 质量套件「需优化」「部分通过」  
- 出现内部错误文案（「解析失败」）流出到用户

## 2. 标签枚举

| 标签 | 含义 |
|------|------|
| route_error | 意图误路由 |
| memory_miss | Memory 未写入 / Profile 未命中 |
| hallucination | 虚构项目/数据/经历 |
| eval_false_positive | 合理改写被误杀 |
| parse_fail | 结构化输出解析失败 |
| missing_evidence | Gap/推荐缺 sources |
| material_parse | 简历/JD 材料解析失败 |
| ux_copy | 错误文案/空态不当 |

## 3. 逆向排查顺序（固定）

1. 用户原话是否清晰、是否缺材料  
2. Master 意图 + Task 优先级 + 内容启发式覆盖  
3. Memory / JD / 简历是否注入  
4. 专业 Agent Prompt 与结构化输出  
5. Evaluation 风险分档  
6. 前端展示是否丢字段或暴露内部错误  

## 4. 闭环模板

| 字段 | 填写 |
|------|------|
| case_id | |
| 现象 | 用户看见什么 |
| 标签 | 上表 |
| 根因层 | 意图/Memory/Prompt/解析/Eval/前端 |
| 修复 | PR / Prompt / 规则 |
| 回归用例 | dataset id 或 MEMORY 用例 id |
| 状态 | open / closed |

**强制**：关闭前必须把最小复现写入 `backend/app/evaluation/datasets/` 或 MEMORY 验收表。
