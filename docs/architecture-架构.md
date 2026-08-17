# 系统架构

## 1. 架构概览

AI Career Assistant 采用 **六层架构**，支持 Chat、Agent、Memory、RAG、Evaluation 的长期扩展。

```
L1 用户交互层     Next.js + shadcn/ui (Chat First)
L2 会话管理层     Conversation Manager (多窗口 / 摘要)
L3 Agent 编排层   Master Agent (意图识别 / 任务规划 / 路由)
L4 专业 Agent 层  Resume / Job / Interview / Career / Evaluation
L5 AI 基础能力层  Memory / RAG(pgvector) / LLM Provider
L6 数据与工具层   PostgreSQL / 搜索 / 文件解析 / ASR(未来)
```

## 2. 请求数据流

```
用户消息
  → Frontend (SSE)
  → POST /chat
  → Master Agent（意图识别）
  → 若存在进行中的模拟面试
        → Interview Agent 追问 / 推进状态机 / 复盘
  → 若 intent=interview 或「开始模拟面试」
        → 启动面试状态机（可带 JD）
  → 若 intent=resume 且含简历/优化请求
        → Resume Agent（解析 / STAR / JD 定制）
        → Evaluation（禁止虚构项目/数据/职责）
        → 流式返回优化报告（含修改原因）
  → 若 intent=jd_analysis 且含 JD/岗位信息
        → Job Intelligence Agent
        → Search Tool（公司/行业）
        → Evaluation（真实性检查）
        → 流式返回岗位分析报告
  → 否则普通 LLM 回复
  → Memory Agent 提取职业信息
  → 返回 Frontend
```

## 3. Agent 协作模型

```
                    用户
                     ↓
                Master Agent
                     ↓
    ┌────────────────┼────────────────┐
    ↓                ↓                ↓
Resume Agent   Job Agent    Interview Agent
    ↓                ↓                ↓
    └────────────────┼────────────────┘
                     ↓
              Evaluation Agent
                     ↓
              Memory Update
                     ↓
                  返回用户
```

**约束：**
- 专业 Agent 之间禁止直接互相调用
- 所有路由必须经过 Master Agent
- Evaluation 作为横切能力，重要输出必须经其审核

## 3.1 Evaluation 质量控制（Phase 5）

```
Agent Output → Evaluation Agent → Risk Check → Final Response
                     ↓
         EvaluationRecord + Agent Trace
                     ↓
              high → BadCase（自动）
```

能力：真实性检查 / 岗位匹配 / 面试回答加权评分  
配套：Prompt 版本管理、Evaluation Dataset、Dashboard（`/dashboard`）

## 3.2 语音面试 + 长期陪伴（Phase 6）

```
Audio → ASR → Interview Agent → Evaluation → 表达分析 → Feedback
                                                      ↓
                                              Career Status 更新
                                                      ↓
                                              Next Action 推荐
```

- 情绪陪伴：Master 能力增强（`career_consult`），禁止空泛鼓励，必须引用面试次数/得分/短板
- 智能推荐：JD 分析后建议改简历；面试后建议专项训练

## 3.3 产品体验优化（Phase 7）

```
Chat First 首页 → 阶段/问题引导（无工具按钮墙）
       ↓
Conversation 自动标题 + Summary（侧栏副标题）
       ↓
个人画像（优势 / 经历 / 目标 / 短板 / 训练进展）
       ↓
Next Action = 建议 + 为什么 + 依据来源（外部检索 / 记忆）
```

- `projects.source` 补齐，Memory Context 携带来源与置信度
- SSE 新增 `conversation_updated` 实时刷新侧栏标题与摘要

## 3.4 Career Intelligence Layer（Phase 8）

```
User → Master Agent
         ↓
   Career Memory + Task Memory
         ↓
   Career Gap Analysis（可选，岗位/目标相关时）
         ↓
   Scene Agent（Job / Resume / Interview / Career）
         ↓
   Recommendation Agent + Next Action Planner
         ↓
   Evaluation → Response → 更新 Task Memory / latest_gap
```

- 不新增工具墙页面；能力挂在 Conversation 侧栏（Current Task）与 Profile（Gap Card / Career Progress）
- Memory 类型扩展：`fact` / `skill` / `goal` / `gap` / `progress`
- SSE：`career_gap`、`task_updated`；表：`career_tasks`、`career_gaps`、`recommendations`
- Task Memory：Master 每次路由读取当前任务；有则续写，无则在明确目标时创建；跨 Conversation 保持 active Task

## 4. LLM Provider Layer

```
services/llm/
├── provider.py          # BaseLLMProvider / BaseEmbeddingProvider 抽象
├── openai_provider.py # Phase 0 实现（OpenAI 兼容 API）
└── config.py          # 从环境变量读取，不绑定具体模型
```

替换模型时只需修改 `.env` 中的 `MODEL_NAME` 和 `OPENAI_API_BASE`。

## 5. 部署架构

```
docker-compose
├── frontend:3000   (Next.js dev/build)
├── backend:8000    (FastAPI + Uvicorn)
└── postgres:5432   (pgvector/pgvector:pg16)
```

## 6. 能力现状与后续（与 README / HANDOFF 对齐）

| 组件 | 当前状态 | 后续 |
|------|----------|------|
| Chat API / 多窗口 / SSE | 已实现（Phase 0 ✅） | 持续体验打磨 |
| Master Agent | 已实现意图路由 + Task 续写 | 澄清链话术与套件回归 |
| Memory Pipeline | 已实现提取与画像写入 | **质量验收加强**（见 MEMORY 验收规格）；套件曾 0/7 需修复 |
| Job / Resume / Interview | 已实现（含语音面试） | 短 JD、复盘解析等失败态 |
| Evaluation | 已实现横切质检 + Dashboard | 精标集扩容、误伤治理 |
| Career Gap / Task / Recommendation | 已实现（Phase 8 ✅） | 解析失败与空输入兜底 |
| RAG / Embedding / pgvector | Schema/配置预留；**业务主路径未强依赖** | 按 [材料与RAG决策.md](./材料与RAG决策.md) 后置 |
| Redis 缓存 | 未加入 | 按需评估 |

## 7. 相关文档

- [产品文档](./product.md)
- [API 设计](./api.md)
- [数据库设计](./database.md)
