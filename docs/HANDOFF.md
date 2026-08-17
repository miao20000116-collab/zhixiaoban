# 交接文档（给下一位 Context / 协作者）

> 更新于 2026-08-17。本文件用于快速接手验证，不替代完整 PRD。

## 1. 项目是什么

**职小伴 / AI 求职助手**：Chat First 的 Multi-Agent 求职产品。

主闭环：对话 → JD 分析 / 简历优化 → 模拟面试（文字 + 语音）→ 复盘 / 画像 / 推荐。

**产品策略：无登录。** 访客画像可在 `/profile` 清空；不提供账号体系。

## 2. 仓库结构（整理后）

```
职小伴-求职agent/
├── README.md                 # 总览与启动
├── .env.example              # 环境变量模板（无密钥）
├── .env                      # 本地密钥（已 gitignore，勿提交）
├── .cursorrules.md           # Agent 开发约束
├── docker-compose.yml        # 可选 Docker（本机当前多用便携 Postgres）
├── docs/                     # 文档（从这里的 README 进）
│   ├── HANDOFF.md            # 本文件
│   ├── VERIFY.md             # 验证清单
│   ├── prd.md                # 完整 PRD（原「求职agent.md」已改名）
│   ├── product.md / architecture.md / api.md / database.md
├── backend/                  # FastAPI
│   ├── app/
│   │   ├── api/              # REST：chat / resume / job / interview / voice …
│   │   ├── agents/           # Master / Resume / Job / Interview / …
│   │   ├── services/         # 业务编排 + speech(ASR/TTS)
│   │   ├── models/ schemas/ prompts/
│   │   └── config.py         # 文本 LLM 与语音 API 分离
│   ├── scripts/
│   │   ├── start_local_pg.py # 启动便携 Postgres（C:\ai-career-pg）
│   │   └── verify_smoke.py   # 冒烟验证
│   └── data/audio/           # TTS/录音落盘（gitignore）
└── frontend/                 # Next.js
    ├── app/                  # 页面：/  /profile  /dashboard
    ├── components/
    │   ├── chat/             # 对话、输入框、语音通话面板
    │   ├── layout/           # 侧栏、画像、拖拽调宽
    │   ├── atmosphere/       # 春夏秋冬主题 / 安抚语
    │   └── career/           # Gap / 当前任务等
    ├── hooks/ services/ types/ lib/
```

## 3. 本机运行方式（当前实测）

**不是 Docker 一键**（本机可能无 Docker）。惯例：

| 组件 | 方式 |
|------|------|
| Postgres | 便携版 `C:\ai-career-pg`，脚本 `backend/scripts/start_local_pg.py`，端口 `5432` |
| Backend | `cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload` |
| Frontend | `cd frontend && npm run dev`（Node 在 `D:\Program Files\nodejs`） |
| 前端地址 | http://localhost:3000 |
| 后端文档 | http://localhost:8000/docs |

改 `.env` 后必须**重启 uvicorn**（`--reload` 不监视 `.env`）。

## 4. 模型与密钥（两套）

| 用途 | 配置项 | 当前约定 |
|------|--------|----------|
| 文本 LLM | `OPENAI_API_KEY` / `OPENAI_API_BASE` / `MODEL_NAME` | DeepSeek（`deepseek-v4-flash`） |
| 语音 ASR+TTS | `SPEECH_API_KEY` / `SPEECH_API_BASE` / `WHISPER_MODEL` / `TTS_*` | 硅基流动 SenseVoice + CosyVoice2 |

**注意：** 语音不要回退到 DeepSeek Base（DeepSeek 无 `/audio/*`）。逻辑在 `backend/app/config.py` 的 `resolved_speech_*`。

`.env` 已配置过真实 Key；交接时只确认「已 set」，不要把 Key 写进文档或提交 git。

## 5. 近期产品改动（需重点验）

1. **三栏布局**：中间优先；右侧画像可拖宽/隐藏；窄屏自动藏画像（`use-panel-layout`）
2. **四季主题 + 安抚语**：atmosphere 相关组件
3. **输入区**：`JD` / `简历` / **`语音面试`** 并排（语音入口不再单独占一行）
4. **语音面试**：电话式一对一；**实时字幕上屏**、停顿约1秒自动进入下一问、可打断面试官；大红「结束面试」；通话内固定展示「面试官提问」
5. **API 报错**：前端 `readApiError` 解析 FastAPI `detail`，避免整段 JSON 甩给用户
6. **文档分类误传**：JD 上传若实为简历会自动切换解析（`LOOKS_LIKE_RESUME`）
7. **Career Gap（Phase 8.1）**：JD 分析后自动对比 Career Memory，输出匹配度/优势/缺口/建议+evidence；Profile + 右侧画像 Career Gap Card；表 `career_gaps`
8. **Task Memory（Phase 8.2）**：识别长期目标并跨对话保持进度；侧栏 Current Task + Profile Career Progress；Master 路由读取 Task 上下文；表 `career_tasks`

## 6. 关键路径速查

| 场景 | 路径 |
|------|------|
| 语音通话 UI | `frontend/components/chat/voice-interview-panel.tsx` |
| 输入工具栏 | `frontend/components/chat/message-input.tsx` |
| 聊天壳 | `frontend/components/chat/chat-area.tsx` |
| 语音 API | `backend/app/api/voice.py` |
| 语音编排 | `backend/app/services/voice_interview_service.py` |
| ASR/TTS | `backend/app/services/speech.py` |
| 结束面试 | `POST /interview/{id}/end`（`frontend/services/interview.ts`） |

## 7. 已知限制

- Embedding 配置存在，业务主路径尚未强依赖
- 语音面试已支持浏览器实时听写上屏 + 断句自动提交（跳过整段上传 ASR）；面试官 TTS 仍为整句合成
- Cursor 内置预览常无麦克风；应用 **Chrome/Edge** 打开 `localhost:3000`
- 仓库可能尚未 `git init`；交接前建议初始化并确保 `.env` 不被跟踪

## 8. 建议接手顺序

1. 读本文件 + [VERIFY.md](./VERIFY.md)
2. 跑 `python backend/scripts/verify_smoke.py`
3. 浏览器走一遍：发消息 → 上传简历/JD → 点「语音面试」→ 结束面试
4. 有问题再下钻 `docs/api.md` / `architecture.md`
