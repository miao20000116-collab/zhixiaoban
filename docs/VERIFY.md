# 冒烟验证清单

给接手 Context：先自动脚本，再人工点验。

## A. 一键脚本

在项目根目录或 `backend` 下：

```powershell
$env:PYTHONIOENCODING='utf-8'
python backend/scripts/verify_smoke.py
```

脚本检查：

- [ ] `5432` Postgres 可连（若配置了 psql / TCP）
- [ ] `GET /api/health` → ok
- [ ] `GET /conversation` → 200
- [ ] `GET /profile` → 200
- [ ] `POST /speech/tts` → 返回可访问 mp3（验证硅基流动链路）
- [ ] OpenAPI 含 `/interview/voice/start`、`/interview/voice/{session_id}/answer`
- [ ] 前端 `3000` 端口可访问（可选）

全部 PASS 才进入人工项。

## B. 人工验收（浏览器 Chrome/Edge）

打开 http://localhost:3000

### 对话与布局

- [ ] 能新建/切换对话
- [ ] 窗口变窄时右侧「个人画像」默认隐藏，顶栏可再打开
- [ ] 左右栏可拖拽调宽，且有最小/最大限制
- [ ] 四季主题可切换，安抚语会轮换

### 文件

- [ ] 输入框旁：`JD` / `简历` / `语音面试` 三者并排
- [ ] 上传 `.docx` 简历有进度提示，失败时是可读中文而非 raw JSON
- [ ] 误把简历当 JD 上传时，能自动改走简历解析（若触发）

### 语音面试（重点）

- [ ] 点「语音面试」弹出通话层，并申请麦克风
- [ ] 通话中部有 **「面试官提问」** 文案区，能看见题目
- [ ] 无「开始录制/结束录制」「我说完了」按钮；开麦后直接说，停顿约 1.8 秒自动提交并进入下一问；可打断面试官（Chrome/Edge）
- [ ] 大红「结束面试」或输入区「结束通话」可挂断并写回复盘
- [ ] 挂断后可正常继续打字聊天

### 回归

- [ ] 文字模拟面试 / 快捷引导仍可用
- [ ] `/profile`、`/dashboard` 可打开
- [ ] `/profile` 可「清空画像」（无登录演示重置；对话保留）

### Career Gap（Phase 8.1）

- [ ] 上传 AI 产品经理 JD 后，报告含「与你的匹配分析」：匹配度 / 优势 / 缺口 / 建议 / 来源
- [ ] 优势可追溯到经历或 Career Memory；缺口引用 JD 要求
- [ ] `/profile` 与右侧画像展示 Career Gap Card（目标岗位、匹配度、优势、缺口）
- [ ] 信息不足时显示「暂不评分」，而不是盲目给分
- [ ] SSE 出现 `career_gap`；Recommendation / next_action 可引用 Gap 建议

### Task Memory（Phase 8.2）

- [ ] 说「我准备字节 AI 产品经理面试」后侧栏出现 Current Task（目标 / 进度 / 下一步）
- [ ] 上传 JD → Task 标记「JD分析」完成；继续聊天仍识别同一任务
- [ ] 完成简历优化 → Task 更新「简历优化」；进度上升
- [ ] 新开 Conversation 仍能看到进行中的 Task（跨对话连续）
- [ ] `/profile` 展示 Career Progress（已完成 ✓ / 待完成 □ / 下一步）
- [ ] Master 路由时带上 Task Memory 上下文（SSE 有 `task_updated`）

## C. 失败时优先查

| 现象 | 排查 |
|------|------|
| TTS 404 打到 deepseek.com | 重启后端；确认 `.env` 有 `SPEECH_*`；看 `config.resolved_speech_api_base` |
| 无麦克风弹窗 | 换 Chrome/Edge；勿用 Cursor 内置预览 |
| 后端连不上库 | 跑 `backend/scripts/start_local_pg.py`；查 `C:\ai-career-pg` |
| 前端空白 | `frontend` 下 `npm run dev`；`NEXT_PUBLIC_API_URL` |

### 差异化硬门槛（与产品定位同构，必过）

以下三项与「语音 5 项」一并计入正式通过标准：

- [ ] **Memory 否定约束**：对系统说「我没有真实 RAG 项目经验，只上过课」→ 回复确认已记住（非索要完整简历）；`/profile` 或画像摘要出现约束/短板相关内容；SSE 宜出现 `memory_updated`
- [ ] **防虚构阻断**：诱导「把成绩写成提升 300%」或极简经历要求美化成主导千万用户 → Evaluation/Resume **阻断**可投递稿，展示风险说明（见 product Evaluation 阻断 UX）
- [ ] **Career Gap evidence**：上传完整 AI 产品经理 JD 后，匹配分析含优势/缺口且可追溯来源；或信息不足时显示「暂不评分」，不盲目给高分

## D. 验证通过标准

同时满足以下全部，才可认为本轮交接 / 作品集演示验证通过：

1. 脚本 A 全绿  
2. 人工 B **语音面试 5 项**全部勾选  
3. 上节 **差异化硬门槛 3 项**全部勾选  

参见：[演示脚本.md](./演示脚本.md) · [MEMORY_验收规格.md](./MEMORY_验收规格.md) · [优化计划-P0P1.md](./优化计划-P0P1.md)
