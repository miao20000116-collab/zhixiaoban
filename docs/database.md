# 数据库设计

## 概述

- **引擎:** PostgreSQL 16
- **扩展:** pgvector（向量检索，Phase 1+ 启用）
- **ORM:** SQLAlchemy 2.x
- **迁移:** Alembic

---

## ER 关系

```
User ──1:N── Conversation ──1:N── Message
  │
  ├──1:1── CareerProfile
  ├──1:N── Experience
  └──1:N── Project

AgentRun ──N:1── User (optional)
AgentRun ──N:1── Conversation (optional)

PromptTemplate (独立，按 agent_name 索引)
```

---

## 核心表（Phase 0 已建）

### users

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| email | VARCHAR(255) UNIQUE | 登录邮箱 |
| password_hash | VARCHAR(255) | 密码哈希，可空 |
| avatar | VARCHAR(512) | 头像 URL |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### conversations

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 所属用户 |
| title | VARCHAR(255) | 窗口标题，默认「新对话」 |
| summary | TEXT | AI 生成的对话摘要 |
| status | VARCHAR(20) | active / archived |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### messages

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| conversation_id | UUID FK → conversations | 所属对话 |
| role | VARCHAR(20) | user / assistant / system / tool |
| content | TEXT | 消息内容 |
| token_count | INT | Token 计数，用于上下文管理 |
| created_at | TIMESTAMPTZ | 创建时间 |

### career_profiles

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users UNIQUE | 一对一 |
| target_position | VARCHAR(255) | 目标岗位 |
| target_industry | VARCHAR(255) | 目标行业 |
| experience_year | INT | 工作年限 |
| career_summary | TEXT | AI 生成的职业摘要 |
| confidence_score | FLOAT | Memory 完整度 0-1 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### experiences

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 所属用户 |
| company | VARCHAR(255) | 公司 |
| position | VARCHAR(255) | 职位 |
| duration | VARCHAR(100) | 时长 |
| responsibility | TEXT | 职责 |
| achievement | TEXT | 成就 |
| source | VARCHAR(50) | conversation / resume_upload / manual_edit |
| confidence | FLOAT | AI 提取置信度 |

### projects

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 所属用户 |
| project_name | VARCHAR(255) | 项目名称 |
| background | TEXT | 背景 |
| goal | TEXT | 目标 |
| role | VARCHAR(255) | 用户角色 |
| action | TEXT | 具体行动 |
| result | TEXT | 结果 |
| skill_tags | JSONB | 技能标签数组 |
| source | VARCHAR(50) | conversation / resume / manual（Phase 7） |
| confidence | FLOAT | AI 提取置信度 |

---

## 预留表（Schema 已建，逻辑未实现）

### prompt_templates

Prompt 版本管理，供 Phase 1 Agent 开发使用。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| agent_name | VARCHAR(100) | Agent 名称 |
| version | VARCHAR(20) | 版本号 |
| prompt_content | TEXT | Prompt 内容 |
| status | VARCHAR(20) | draft / active / deprecated |
| created_at | TIMESTAMPTZ | 创建时间 |

### agent_runs

Agent 执行追踪，供可观测性与调试。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 可空 |
| conversation_id | UUID FK → conversations | 可空 |
| agent_name | VARCHAR(100) | Agent 名称 |
| input_data | JSONB | 输入 |
| output_data | JSONB | 输出 |
| status | VARCHAR(20) | pending / success / failed |
| duration_ms | FLOAT | 执行耗时 |
| created_at | TIMESTAMPTZ | 创建时间 |

---

## 后续扩展表（未建）

| Phase | 表名 | 用途 |
|-------|------|------|
| Phase 2 | jobs, jd_records, resumes, resume_optimizations | JD 与简历 |
| Phase 3 | interview_sessions, interview_questions, interview_answers | 模拟面试 |
| Phase 1+ | document_chunks (vector) | RAG 向量检索 |
| Phase 1+ | skills, career_goals | 能力画像 |
| Phase 2 | job_analyses | Job Intelligence 分析记录 ✅ |
| Phase 3 | resume_versions | Resume 解析/优化版本 ✅ |
| Phase 4 | interview_sessions | 模拟面试会话 ✅ |
| Phase 5 | evaluation_records, bad_cases | 质量控制 |

---

## Phase 2 新增表

### job_analyses

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 所属用户 |
| conversation_id | UUID FK → conversations | 可选，关联对话 |
| input_type | VARCHAR(32) | jd_text / jd_file / position_company |
| input_text | TEXT | JD 原文 |
| position | VARCHAR(255) | 岗位名 |
| company | VARCHAR(255) | 公司名 |
| result_json | JSONB | Job Agent 结构化输出 |
| evaluation_json | JSONB | 真实性检查结果 |
| created_at | TIMESTAMPTZ | 创建时间 |

迁移文件: `alembic/versions/003_job_analyses.py`

---

## Phase 3 新增表

### resume_versions

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 所属用户 |
| conversation_id | UUID FK → conversations | 可选 |
| task_type | VARCHAR(32) | parse / diagnose / star / optimize |
| source_text | TEXT | 简历/项目原文 |
| target_position | VARCHAR(255) | 目标岗位 |
| jd_text | TEXT | 目标 JD |
| result_json | JSONB | Resume Agent 输出 |
| evaluation_json | JSONB | 真实性检查 |
| created_at | TIMESTAMPTZ | 创建时间 |

迁移文件: `alembic/versions/004_resume_versions.py`

---

## Phase 4 新增表

### interview_sessions

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK | 用户 |
| conversation_id | UUID FK | 关联对话 |
| mode | VARCHAR(32) | full / technical_interview |
| stage | VARCHAR(32) | 状态机当前阶段 |
| status | VARCHAR(20) | active / completed |
| position | VARCHAR(255) | 目标岗位 |
| jd_text | TEXT | JD |
| resume_text | TEXT | 简历/记忆素材 |
| question_bank_json | JSONB | 题库 |
| turns_json | JSONB | 对话回合 |
| turns_in_stage | INT | 当前阶段回合数 |
| review_json | JSONB | 复盘 |
| evaluation_json | JSONB | 真实性检查 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

迁移文件: `alembic/versions/005_interview_sessions.py`

---

## Phase 5 新增表

### evaluation_records

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK | 可选 |
| conversation_id | UUID FK | 可选 |
| agent_name | VARCHAR(100) | 被审核的 Agent |
| task_type | VARCHAR(50) | analyze / optimize / star / review 等 |
| input_data | JSONB | 审核输入摘要 |
| output_data | JSONB | 被审核输出摘要 |
| score | INT | 0–100 |
| risk_level | VARCHAR(20) | low / medium / high |
| feedback | JSONB | 完整 EvaluationResult |
| trace_id | UUID | 关联 Agent Trace |
| created_at | TIMESTAMPTZ | 创建时间 |

### bad_cases

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK | 可选 |
| agent_name | VARCHAR(100) | 相关 Agent |
| problem_type | VARCHAR(100) | hallucination / high_risk 等 |
| description | TEXT | 问题描述 |
| solution | TEXT | 解决方案 |
| status | VARCHAR(20) | open / resolved |
| evaluation_record_id | UUID FK | 关联审核记录 |
| context_json | JSONB | 附加上下文 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

### agent_runs（增强）

新增：`trace_id` / `parent_run_id` / `task_type` / `error_message`，用于完整调用链路。

迁移文件: `alembic/versions/006_evaluation_qc.py`

---

## Phase 6 新增表

### interview_audios

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| session_id | UUID FK | 面试会话 |
| user_id | UUID FK | 用户 |
| role | VARCHAR(20) | user / assistant |
| audio_url | VARCHAR(512) | 音频 URL |
| transcript | TEXT | ASR 逐字稿 |
| duration_ms | INT | 时长 |
| question_text | TEXT | 对应问题 |
| analysis | JSONB | 语速/停顿/口头禅/流畅度 |
| answer_score | JSONB | 回答质量评分 |
| created_at | TIMESTAMPTZ | 创建时间 |

### career_statuses

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK UNIQUE | 用户 |
| stage | VARCHAR(50) | exploring / preparing / applying / interviewing / offer / paused |
| interview_count | INT | 模拟面试次数 |
| application_count | INT | 投递相关次数 |
| strength / weakness | TEXT | 优劣势汇总 |
| mood_signals | JSONB | 情绪信号 |
| recent_failures | INT | 近期偏弱次数 |
| last_interview_score | INT | 最近得分 |
| focus_areas | JSONB | 短板列表 |
| next_action | TEXT | 建议下一步 |
| latest_gap | JSONB | 最近 Gap 分析结果（Phase 8） |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

迁移文件: `alembic/versions/007_voice_career_status.py`；`latest_gap` 见 `009_career_intelligence.py`

迁移文件: `alembic/versions/009_career_intelligence.py`

### career_tasks（Phase 8.2 · Task Memory）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK | 用户 |
| conversation_id | UUID FK | 可选，关联当前推进中的对话 |
| task_type | VARCHAR(50) | job_search / jd_analysis / resume_prepare / interview_prepare / career_growth |
| goal | TEXT | 当前目标描述 |
| status | VARCHAR(20) | active / completed / paused |
| progress | FLOAT | 0–1 进度 |
| completed_steps | JSONB | 已完成步骤 |
| pending_steps | JSONB | 未完成步骤 |
| next_action | TEXT | 下一步行动 |
| meta | JSONB | 扩展元数据 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

与 Conversation 的关系：Conversation 记录「聊了什么」；Task Memory 记录「正在完成什么」。跨对话复用同一 active Task。

### recommendations（Phase 8）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK | 用户 |
| conversation_id | UUID FK | 可选 |
| action | TEXT | 建议动作 |
| why | TEXT | 为什么 |
| sources | JSONB | 依据来源 |
| priority | VARCHAR(20) | high / medium / low |
| status | VARCHAR(20) | pending / accepted / dismissed |
| trigger | VARCHAR(50) | 触发场景 |
| plan | JSONB | 可执行计划步骤 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

迁移文件: `alembic/versions/009_career_intelligence.py`

### career_gaps（Phase 8.1）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 用户 |
| jd_id | UUID FK → job_analyses | 可选，关联本次 JD 分析 |
| target_position | VARCHAR(255) | 目标岗位 |
| company | VARCHAR(255) | 目标公司 |
| match_score | INT | 匹配度 0–100 |
| strengths | JSONB | 优势列表（含 evidence） |
| gaps | JSONB | 能力缺口（含 reason / evidence） |
| recommendations | JSONB | 提升建议 |
| evidence | JSONB | 结论来源汇总 |
| result_json | JSONB | 完整 Gap 结果 |
| evaluation_json | JSONB | Evaluation Agent 审核结果 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

迁移文件: `alembic/versions/010_career_gaps.py`

---

## 迁移命令

```bash
cd backend

# 升级到最新
alembic upgrade head

# 创建新迁移（开发时使用）
alembic revision --autogenerate -m "description"

# 回滚一步
alembic downgrade -1
```

初始迁移文件: `alembic/versions/001_initial_schema.py`

---

## pgvector

迁移 `001_initial` 会执行:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

向量表 `document_chunks` 将在 Phase 1 RAG 实现时添加。
