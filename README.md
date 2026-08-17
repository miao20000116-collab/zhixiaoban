# 职小伴 · AI 求职助手

基于 **Multi-Agent + Career Memory + Evaluation** 的 AI 求职伙伴。覆盖岗位分析、简历优化、模拟面试（文字/语音）与可解释下一步。

> 不是 ChatGPT 包装站；**不提供登录**——本机/演示以访客身份使用，可在「完整档案」清空画像后重新演示。

## 产品一句话

理解你的职业事实 → 分析目标岗位差距 → 基于真实材料优化简历（高风险虚构会阻断）→ 模拟面试复盘 → 给出带依据的下一步。

## 能力状态（能力 ✅ / 质量门禁持续守门）

| 能力 | 阶段 | 备注 |
|------|------|------|
| Chat + 多窗口 + SSE | Phase 0 ✅ | |
| Master + Career Memory | Phase 1 ✅ | Memory live 需按 VERIFY 硬门槛验收 |
| Job / Resume / Interview | Phase 2–4 ✅ | 含语音（实时听写上屏 + 断句提交） |
| Evaluation + Dashboard | Phase 5 ✅ | 精标集持续扩容 |
| 陪伴 / 推荐 / 画像体验 | Phase 6–7 ✅ | |
| Gap / Task Memory / Planner | Phase 8 ✅ | |
| 强 RAG 主路径 | 预留 | Embedding/pgvector 未强依赖业务主路径 |

## 技术架构

```
Frontend (Next.js)
    ↓
Backend (FastAPI)
    ↓
Master → Resume / Job / Interview / Career / Gap / Recommendation
    ↓
Evaluation（横切） + Career Memory
    ↓
PostgreSQL（pgvector 预留）
```

## 快速启动

### 推荐：本机开发（Windows 常见路径）

1. 复制 `.env.example` → `.env`，配置文本 LLM 与语音 API（两套分离）
2. Postgres：`python backend/scripts/start_local_pg.py`（或 Docker 只起数据库）
3. 后端：`cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
4. 前端：`cd frontend && npm run dev` → http://localhost:3000
5. 冒烟：`python backend/scripts/verify_smoke.py`

改 `.env` 后必须重启 uvicorn。

### 可选：Docker Compose

若本机已安装 Docker：`docker compose up -d`（详见 `docker-compose.yml`）。**不以 Docker 为唯一启动方式。**

## 演示前硬门槛

见 [`docs/VERIFY.md`](./docs/VERIFY.md) 与 [`docs/演示脚本.md`](./docs/演示脚本.md)：

1. Memory 否定约束可写入且顶栏可见「已记住」
2. 简历诱导虚构被阻断（不可投递）
3. Career Gap 有 evidence 或「暂不评分」

## 文档入口

先读 [`docs/HANDOFF.md`](./docs/HANDOFF.md) → [`docs/VERIFY.md`](./docs/VERIFY.md) → [`docs/README.md`](./docs/README.md)。

## License

Private · 作品集项目
