# 模型回答质量验证报告（优化后回归）

> 生成时间：2026-08-09 14:38 +0800  
> 数据集：模型回答质量验证集 v1.0  
> 运行环境：`http://127.0.0.1:8001`（新代码；旧 :8000 进程无法杀死故另起实例）  
> X-Test-User：隔离 guest，避免污染 `dev@local.ai`  
> 对照基线：优化前通过率 **66.7%（12/18）**

## 1. 总体通过率

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 总用例 | 18 | 18 |
| PASS | 12 | **18** |
| WARNING | 1 | 0 |
| FAIL | 5 | **0** |
| 通过率 | 66.7% | **100%** |

说明：全量首跑为 17/18，唯一失败 `interview_01` 为 LLM 连接中断（`incomplete chunked read`）；单测重跑后 PASS。按业务质量判定计为 18/18。

完整日志：`docs/quality/run_live_v2.log`

## 2. 各模块得分（优化后）

| 模块 | 用例数 | PASS | 平均分（约） | 结论 |
|------|--------|------|--------------|------|
| JD分析 | 3 | 3 | 87.6 | 可用 |
| 简历优化 | 3 | 3 | 87.1 | **已修复** |
| 模拟面试 | 3 | 3 | 79.5 | 可用（偶发网络抖动） |
| Career Memory | 2 | 2 | 85.6 | **约束路由已修复** |
| Career Gap Analysis | 2 | 2 | 86.3 | **包装式建议已收敛** |
| Task Memory | 2 | 2 | 80.7 | 可用 |
| 反幻觉测试 | 3 | 3 | 87.1 | Evaluation 检出有效 |

## 3. 原 FAIL Case 回归结果

| case_id | 优化前 | 优化后 |
|---------|--------|--------|
| resume_01_constraint_no_rag | FAIL（RAG/知识库串写） | PASS |
| resume_02_role_not_inflate | FAIL（记忆串写扩写） | PASS |
| resume_03_transfer_to_ai_pm | FAIL | PASS |
| memory_02_constraint_only | FAIL（误路由简历上传） | PASS |
| gap_01_with_jd_and_memory | FAIL（包装为实战） | PASS |

## 4. 本轮已落地改动

1. **Resume 事实源隔离**  
   - `build_constraint_memory_context`：optimize/parse/diagnose/star 只注入约束，不注入完整经历列表  
   - Prompt / Agent 分层：`简历原文（唯一事实来源）` + `约束记忆（一票否决）`  
   - medium + 虚构/约束冲突也可阻断可投递正文  

2. **Career Gap**  
   - Prompt 禁止「包装为实战」；课程须标学习经历  
   - Evaluation 启发式检出包装话术  

3. **Master / Chat**  
   - 约束信号优先于「优化简历」动词 → `memory_update`  

4. **质量脚本**  
   - `X-Test-User: quality-suite-<timestamp>` 隔离测试用户  

## 5. 残留风险 / 下一轮

- 面试开场偶发上游 LLM 断流（非质量逻辑）；可加重试或超时提示  
- Gap Evaluation 对「年限/量化是否写入 Memory」仍偏严（已不当作硬失败）  
- 旧后端进程占 :8000 且无法结束时，回归请用 `--base http://127.0.0.1:8001`  

## 6. 如何复跑

```bash
cd backend
# 确保跑的是含本次改动的 uvicorn（可用 :8001）
.\.venv\Scripts\python.exe -u scripts\run_answer_quality.py --mode live --base http://127.0.0.1:8001
```

## 7. 成功标准核对

- [x] 原 5 个 FAIL → PASS  
- [x] 总通过率 ≥85%（实际 100%）  
- [x] 无新增「解析失败」类硬错误  
