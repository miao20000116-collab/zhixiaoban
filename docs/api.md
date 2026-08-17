# API 设计

Base URL: `http://localhost:8000`

---

## 已实现（Phase 0–2）

### GET /api/health

健康检查。

### Conversation / Chat

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/conversation` | 创建对话 |
| GET | `/conversation` | 对话列表 |
| GET | `/conversation/{id}` | 对话详情 |
| GET | `/conversation/{id}/messages` | 消息历史 |
| PATCH | `/conversation/{id}` | 重命名 |
| DELETE | `/conversation/{id}` | 删除 |
| POST | `/chat` | SSE 流式聊天 |

**Chat SSE 事件：**

| event | 说明 |
|-------|------|
| `intent` | Master Agent 意图：`intent` / `confidence` / `need_agent` |
| `token` | 流式文本片段 |
| `job_analysis` | Job Agent 结构化结果（`jd_analysis` 意图触发时） |
| `memory_updated` | 职业记忆写入条数 |
| `done` | 完成，含 `message_id` |
| `error` | 错误详情 |

### Profile（Phase 1）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/profile` | 完整职业档案 |
| PATCH | `/profile` | 更新基本信息 |
| PATCH/DELETE | `/profile/experiences/{id}` | 编辑/删除经历 |
| PATCH/DELETE | `/profile/projects/{id}` | 编辑/删除项目 |
| PATCH/DELETE | `/profile/skills/{id}` | 编辑/删除技能 |

### Job Intelligence（Phase 2）

#### POST /job/analyze

分析 JD 文本或岗位+公司。

**Request:**
```json
{
  "jd_text": "可选，JD 全文",
  "position": "可选，岗位名",
  "company": "可选，公司名",
  "conversation_id": "可选，写入对话时提供"
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "analysis": { "position_overview": {}, "user_match": {}, "...": "..." },
  "evaluation": { "risk_level": "low", "score": 90, "problems": [], "fabricated_claims": [] },
  "markdown": "# 岗位分析报告\\n...",
  "created_at": "..."
}
```

#### POST /job/analyze/upload

上传 JD 文件（`.txt` / `.md` / `.pdf` / `.docx`）。

**Form fields:** `file`（必填）, `conversation_id`, `position`, `company`

#### GET /job/analyses

分析历史列表。

#### GET /job/analyses/{id}

单条分析详情。

### Resume Agent（Phase 3）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/resume/parse` | 解析简历文本 |
| POST | `/resume/parse/upload` | 上传简历（可带目标岗位直接优化） |
| POST | `/resume/diagnose` | 简历诊断 |
| POST | `/resume/star` | STAR 项目经历优化 |
| POST | `/resume/optimize` | 按目标岗位/JD 定制简历（含修改原因 + Evaluation） |
| GET | `/resume/versions` | 历史版本列表 |
| GET | `/resume/versions/{id}` | 版本详情 |

#### POST /resume/optimize

**Request:**
```json
{
  "resume_text": "简历全文",
  "target_position": "AI产品经理",
  "jd_text": "可选目标 JD",
  "conversation_id": "可选",
  "sync_memory": true
}
```

**Response：** 含 `optimized_resume`、`change_reasons`、`diagnosis`、`star_projects`、`evaluation`、`markdown`。

#### POST /resume/parse/upload（验收路径）

Form：`file` + `target_position`（或 `jd_text`）+ `optimize=true`  
→ 解析并生成针对目标岗位的优化版简历报告。

**Chat SSE 新增：** `resume_result`

### Interview Agent（Phase 4）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/interview/start` | 开始模拟面试（生成题库 + 进入状态机） |
| POST | `/interview/questions` | 仅生成题库（行为/业务/项目/技术） |
| GET | `/interview/active` | 当前进行中的面试 |
| POST | `/interview/{id}/answer` | 提交回答，获取追问/下一题 |
| POST | `/interview/{id}/end` | 结束并生成复盘 |
| GET | `/interview/{id}` | 会话详情 |

#### 状态机

```
START → SELF_INTRO → PROJECT_DEEP_DIVE → BUSINESS → TECHNICAL → REVERSE_QA → END
```

技术专项 `technical_interview`：

```
START → TECHNICAL → REVERSE_QA → END
```

覆盖：LLM / RAG / Agent / Prompt / Evaluation

#### POST /interview/start

```json
{
  "conversation_id": "uuid",
  "position": "AI产品经理",
  "jd_text": "JD 全文",
  "mode": "full"
}
```

**Chat SSE 新增：** `interview_turn` / `interview_review` / `interview_questions`

### Evaluation QC（Phase 5）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/evaluation/dashboard` | 成功率 / 幻觉率 / Bad Case / Prompt 版本等指标 |
| GET | `/evaluation/records` | Evaluation 审核记录 |
| GET/POST/PATCH | `/evaluation/bad-cases` | Bad Case 列表 / 创建 / 更新状态 |
| GET/POST | `/evaluation/prompts` | Prompt 版本列表 / 新建版本 |
| POST | `/evaluation/prompts/seed` | 从 `prompt.md` 导入 v1.0 |
| POST | `/evaluation/prompts/{id}/activate` | 激活指定 Prompt 版本 |
| GET | `/evaluation/traces/{trace_id}` | Agent 调用链路 |
| GET | `/evaluation/datasets` | Evaluation Dataset 列表 |
| POST | `/evaluation/datasets/{id}/run` | 运行回归测试集 |
| POST | `/evaluation/check` | 手动触发一次 Evaluation |

内置 Dataset：`resume_hallucination` / `jd_analysis` / `interview_answer`

前端看板：`/dashboard`

### 语音面试 + 陪伴推荐（Phase 6）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/interview/voice/start` | 开始语音面试（题库 + TTS 提问） |
| POST | `/interview/voice/{id}/answer` | 上传音频 → ASR → 面试推进 → 表达分析/评分 |
| GET | `/interview/{id}/transcript` | 完整逐字稿 + 音频片段 |
| POST | `/speech/tts` | 文本转语音 |
| GET | `/career/status` | 求职状态 Memory |
| POST | `/career/status/refresh` | 按历史重算状态 |

Chat SSE 新增：`next_action`（JD/简历/面试/陪伴后的下一步建议）

媒体文件：`/media/audio/{filename}`

### 产品体验（Phase 7）

| 能力 | 说明 |
|------|------|
| Chat First 首页 | 阶段/问题引导芯片，禁止功能按钮墙 |
| 个人画像 | 侧栏 + `/profile`：优势 / 经历 / 目标 / 短板 / 训练进展 |
| 自动标题 | 按意图生成如「字节面试准备」 |
| Conversation Summary | 滚动摘要写入 `conversations.summary`，侧栏副标题展示 |
| 建议归因 | `next_action.why` + `sources`（workflow / memory / external） |
| 记忆可信度 | 经历/项目/技能展示来源与置信度 |

Chat SSE 新增：`conversation_updated`（`id` / `title` / `summary`）

迁移：`alembic upgrade head`（含 `008_project_source_phase7`）

### Career Intelligence（Phase 8）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/career/gap` | 最近一次职业差距分析 |
| POST | `/career/gap/analyze` | 主动触发 Gap Analysis |
| GET | `/career/tasks` | 进行中任务列表 |
| GET | `/career/tasks/active` | 当前 Task Memory（可按 conversation_id） |
| POST | `/career/plan` | Next Action Planner 生成可执行计划 |
| GET | `/career/recommendations` | 建议历史（含 why / sources / priority） |
| GET | `/career/intelligence` | 画像侧栏快照：status + gap + active task |

Chat SSE 新增：`career_gap`、`task_updated`；`next_action` 可带 `plan` / `priority`

前端：

- Conversation 侧栏展示 Current Task（进度 / 已完成 / 下一步）
- `/profile` + 右侧画像展示 Career Gap Card（匹配度 / 优势 / 缺口 / 建议）

迁移：`009_career_intelligence`（`career_tasks`、`recommendations`、`career_statuses.latest_gap`）

---

## 认证

当前使用 Dev User（`dev@local.ai`），无需登录。

---

## 交互式文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
