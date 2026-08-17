# 回答质量验证套件

固定用例验证「模型回答是否真的可用」，复用 Evaluation / Bad Case / Dashboard。

## 文件

| 路径 | 作用 |
|------|------|
| `backend/app/evaluation/quality_suite/answer_quality_cases.json` | 18 条固定用例 |
| `backend/app/evaluation/quality_scorer.py` | 六维打分 + PASS/WARNING/FAIL |
| `backend/scripts/run_answer_quality.py` | 批量跑 Agent + Evaluation + 写报告/Bad Case |
| `docs/quality/answer_quality_report.md` | 最新 Markdown 报告 |

## 运行

后端需在 `http://127.0.0.1:8000`：

```bash
cd backend
.\.venv\Scripts\python.exe -u scripts\run_answer_quality.py --mode live
```

脚本会自动带 `X-Test-User: quality-suite-<timestamp>`，避免污染默认 `dev@local.ai` 记忆。

离线只测 Evaluation 反幻觉：

```bash
.\.venv\Scripts\python.exe -u scripts\run_answer_quality.py --mode offline
```
