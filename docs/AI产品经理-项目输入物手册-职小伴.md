# 职小伴 · AI 产品经理项目输入物手册

> 用途：面试 / 作品集——讲清「作为 AI 产品经理，我在职小伴应当输入/产出什么」。  
> 硬约束：下文「项目现状」只写仓库里**已经有的**内容（带路径）；没有但应当有的，一律标 **【建议添加】** 并写清原因。  
> 配套文档：[product.md](./product.md) · [architecture.md](./architecture.md) · [HANDOFF.md](./HANDOFF.md) · [VERIFY.md](./VERIFY.md) · [逐字稿-职小伴求职agent.md](./逐字稿-职小伴求职agent.md)

---

## 0. 怎么读这份手册

| 符号 | 含义 |
|------|------|
| **【现状】** | 仓库已存在的文档、Prompt、表结构、质量报告结论（可追溯） |
| **【建议添加】** | 我认为作为 AI PM 还应补上的输入物；含原因与优先级 |
| **【备注】** | 简单名词、原理、AI 产品基础知识解释 |
| 状态列 | `已有` / `部分具备` / `建议添加强依赖` |

**阅读顺序建议**：第 1 章职责边界 → 第 2 章总览表 → 按面试高频抽读第 6–14 项（Agent / 意图 / Prompt / Memory / Evaluation / 指标）→ 附录 C 缺口总表。

**【备注】什么叫「产品经理输入物」**  
不是让你去写后端代码，而是你交给研发 / 算法 / 自己验收用的**规格与约束**：问题定义、PRD、Agent 职责、意图规则、Prompt 产品要求、评测集、指标口径、验收清单、风险红线。有了这些，工程才知道「做成什么样算对」，面试官能听出你不是「调了两句 Prompt 的使用者」。

**【备注】AI 产品经理 vs 传统产品经理**  
传统 PM 更常交付页面流程与业务规则；AI PM 额外必须定义：**模型该做什么/不该做什么、上下文从哪来、幻觉如何拦、如何评测发版**。职小伴的差异化恰恰在 Multi-Agent + Memory + Evaluation，所以输入物重心在「智能规格」而不只在「按钮布局」。

---

## 1. AI 产品经理在本项目的职责边界

### 1.1 你应当负责（输入/验收）

1. **问题与定位**：求职场景痛点、差异化（相对 ChatGPT / 单点简历工具）。
2. **闭环与优先级**：先做什么、后做什么、什么叫 MVP。
3. **Agent 产品规格**：每个 Agent 的职责边界、协作约束、意图路由规则。
4. **Prompt 产品层要求**：角色、知识边界、输出格式、负面示例、拒答/阻断策略（可与工程一起落进 `prompt.md`）。
5. **Memory / Task 字段语义**：什么算事实、否定性约束如何处理、跨对话任务如何续写。
6. **质量体系**：Evaluation 风险分级、精标集场景、BadCase 归因口径、发版门槛。
7. **体验与验收**：Chat First、可解释建议、VERIFY 清单、演示脚本。
8. **风险红线**：虚构履历、无依据推荐、密钥与隐私不进仓库文档。

### 1.2 你通常不单独负责（但要懂、能验收）

- 具体框架代码、SQL 迁移、Docker/便携 Postgres 排障（可协作，见 [HANDOFF.md](./HANDOFF.md)）。
- 模型权重训练 / LoRA 训练流水线（本项目生产路径未做微调，见逐字稿 §8）。
- 真流式 WebSocket ASR 实现（HANDOFF 已列为已知限制）。

### 1.3 与工程的「接口物」一句话

你输出规格与评测 → 工程落在 `backend/app/agents/*/prompt.md`、API、表结构、Dashboard；你用 [VERIFY.md](./VERIFY.md) 与各 `*_QUALITY_REPORT.md` 做验收。

**面试一句话**：我不是调包调用大模型，而是把求职闭环拆成可路由的 Agent，并用 Evaluation 和精标集守住「真实可投递」底线。

---

## 2. 输入物总览表

| 序号 | 输入物 | 状态 | 现状锚点（路径） | 面试一句话 |
|------|--------|------|------------------|------------|
| 1 | 问题定义与用户痛点 | 部分具备 | `prd.md` 背景；`product.md`；逐字稿 §2 | 痛点是无记忆/易幻觉/无闭环，不是「文案不够漂亮」 |
| 2 | 产品定位与差异化 | 已有 | `product.md` 定位表与原则 | Multi-Agent + Career Memory + Evaluation |
| 3 | 用户旅程与 MVP 闭环 | 已有 | `product.md` MVP；HANDOFF 主闭环 | 目标→理解→JD→简历→面试→评价→记忆 |
| 4 | 优先级与范围裁剪 | 部分具备 | 逐字稿优先级；VERIFY 通过标准偏语音 | 先防幻觉，再主闭环，最后体验 |
| 5 | PRD / 功能规格 | 部分具备 | `prd.md`（状态仍写 MVP 设计阶段）；`product.md` 摘要有断链 | 有长 PRD，但需与实现再对齐一版「现状 PRD」 |
| 6 | Agent 职责矩阵 | 部分具备 | `product.md` 表不完整；9 个 Agent 均有 `prompt.md` | Master 只路由，专业 Agent 分工，Eval 横切 |
| 7 | 意图体系与澄清 | 已有 | `master/prompt.md` | 六类 intent + Task 续写优先 |
| 8 | Prompt 产品规格 | 已有（散落） | 各 `agents/*/prompt.md` | Prompt 外置，禁止写死在 chat 接口 |
| 9 | Memory / Task 规则 | 部分具备 | `memory/prompt.md`；database；HANDOFF；**质量报告 0/7** | 记忆是差异化，但验收未过必须正视 |
| 10 | 材料与知识规范 | 部分具备 | Resume/Job prompt；HANDOFF：Embedding 未强依赖 | 主路径是结构化材料+Memory，不是文献级 RAG |
| 11 | Evaluation 规则 | 已有 | `evaluation/prompt.md`；Dashboard | high 风险阻断虚构 |
| 12 | 精标集 / 评测集 | 部分具备 | `evaluation/datasets/` 四文件约 9 条 | 有门类，但样本偏少 |
| 13 | 指标体系 | 部分具备 | 逐字稿 §5；Dashboard API；缺独立短文 | 三层指标：闭环/体验/模型 |
| 14 | BadCase 归因 SOP | 部分具备 | `docs/quality/`、Dashboard；缺正式 SOP 文 | 不笼统归「模型幻觉」 |
| 15 | 交互体验规格 | 部分具备 | HANDOFF 近期改动；前端组件路径 | Chat First、三栏、语音面试边界 |
| 16 | 验收与演示脚本 | 已有 | `VERIFY.md` | 脚本+人工；硬门槛偏语音 |
| 17 | 风险与合规 | 部分具备 | Eval/Resume 防虚构；HANDOFF 密钥规范 | 虚构履历是产品事故 |

---

## 3. 分项详写（1–17）

### 1. 问题定义与用户痛点文档 · 状态：部分具备

**目的**  
在写功能之前先定义「为谁解决什么问题」，避免做成又一个 ChatGPT 套壳。

**怎么做（AI PM）**  
1. 写清目标用户与场景（求职准备全流程）。  
2. 列出竞品/替代方案的结构性缺陷（不是功能多少对比）。  
3. 用可验证的表述定义痛点（无长期记忆、输出不可审计、链路割裂）。  
4. 明确非目标（例如：本阶段不做招聘方 ATS 对接）。

**【现状】项目里已有的内容**  
- [docs/prd.md](./prd.md) §1.2–1.6：工具割裂、缺少长期背景理解、心理压力；定位为 AI 求职伙伴。  
- [docs/product.md](./product.md)：相对「普通 AI 工具」的差异化表（无记忆 / 单模型 / 无审核 / 功能菜单）。  
- [docs/逐字稿-职小伴求职agent.md](./逐字稿-职小伴求职agent.md) §2：把模糊诉求「帮我找工作」拆成可落地闭环。

**【建议添加】独立《痛点与非目标一页纸》**（P1）  
- **补什么**：一页 Markdown：Top3 痛点、证据来源（访谈/自用/竞品）、明确 Non-Goals。  
- **原因**：`prd.md` 过长（万行级）且状态仍写「MVP设计阶段」，面试官很难在 30 秒内抓住痛点；作品集需要「一眼可读」的问题定义。痛点若不独立，后面所有 Agent 优先级容易漂成「什么都想做」。  
- **不补的风险**：被追问「你和 ChatGPT 差在哪」时只能背差异化口号，说不清问题从哪来。

**【备注】痛点 vs 需求**  
痛点是用户处境里的「疼」；需求是你提出的解决方案形态。先痛点后方案，避免一上来就写「我们要上 Multi-Agent」。

**【备注】Non-Goal（非目标）**  
明确本期不做的事，防止范围膨胀。例如职小伴当前不把「真流式低延迟语音」当已交付能力（见 HANDOFF 已知限制）。

**模板**

| 字段 | 填写说明 | 应基于现状填写 |
|------|----------|----------------|
| 用户 | 谁 | 求职中的转岗/社招等（prd 已列群体） |
| 场景 | 何时何地 | 准备材料→投递→面试训练 |
| 痛点 | 可验证 | 无记忆；易虚构；链路割裂 |
| 现状替代 | 用户现在怎么办 | ChatGPT / 单点简历工具 / 题库 App |
| 非目标 | 本期不做 | 真流式 ASR；重 RAG 文献库 等 |

**面试一句话**：我先定义的是「无记忆、不可审计、无闭环」，再决定上 Multi-Agent 和 Evaluation，而不是先堆功能。

---

### 2. 产品定位与差异化一页纸 · 状态：已有

**目的**  
让团队与面试官用同一句话理解产品是什么、不是什么。

**怎么做**  
写定位句 + 对比表 + 体验原则；每条原则能映射到一个实现约束。

**【现状】**  
[docs/product.md](./product.md) 已写：

- 定位句：理解职业背景、分析岗位、生成材料、模拟面试、持续提升的 AI 求职伙伴。  
- 差异化四维：Career Memory / Multi-Agent / Evaluation / Chat First。  
- 六条体验原则：Chat First、渐进采集、多窗口 Memory 共享、基于事实反馈、建议可解释、画像而非表单。  
- Phase 7/8 目标：从「问答」升级到「理解→发现问题→下一步」。

**【建议添加】**（P2，可选）  
在 `product.md` 顶部增加「一句话定位 + 三不」（不是 ChatGPT 包装站；不是功能菜单墙；不是可随意美化履历的工具）。  
**原因**：HANDOFF / `.cursorrules.md` 已有「不是什么」的工程约束，产品摘要页同步后，面试与开发口径更一致。

**【备注】Chat First**  
用户用自然语言表达需求，而不是先点「简历」「面试」等工具按钮墙。职小伴仍保留 JD/简历/语音入口，但是辅助，不是主导航墙（见 HANDOFF 输入区说明）。

**【备注】可解释建议（Explainability）**  
每条下一步要有「为什么」和依据来源（记忆 / 本次流程 / 外部检索）。这是 AI 产品信任设计，不是文案装饰。

**模板**

| 维度 | 普通工具 | 职小伴（摘自 product） |
|------|----------|------------------------|
| 用户理解 | 单次对话 | Career Memory |
| 任务处理 | 单模型 | Multi-Agent |
| 输出质量 | 无审核 | Evaluation |
| 交互 | 功能菜单 | Chat First |

**面试一句话**：定位不是生成器，而是带记忆与质检的求职伙伴。

---

### 3. 用户旅程与 MVP 闭环 · 状态：已有

**目的**  
把「求职」拆成可实现、可验收的阶段链路，避免无主线的功能堆砌。

**怎么做**  
画主路径；标每步由哪个 Agent/系统能力承接；定义最小可演示闭环。

**【现状】**  
- [docs/product.md](./product.md) MVP：

```
用户表达求职目标 → Memory → Job → Resume → Interview → Evaluation → 记忆更新
```

- [docs/HANDOFF.md](./HANDOFF.md)：对话 → JD 分析 / 简历优化 → 模拟面试（文字+语音）→ 复盘 / 画像 / 推荐。  
- [docs/architecture.md](./architecture.md)：请求经 Master 路由；面试状态机；重要输出经 Evaluation。  
- Phase 8：Career Gap、Task Memory、Recommendation、Next Action（product / architecture / HANDOFF 均有描述）。

**【建议添加】《主路径验收对照表》**（P1）  
- **补什么**：每一步对应 VERIFY 勾选项 + 质量报告相关项（例如 Resume 防虚构、Gap 有 evidence）。  
- **原因**：闭环在文档里「写全了」，但 [VERIFY.md](./VERIFY.md) §D 正式通过标准 = 脚本全绿 + **语音面试 5 项**，未把 Gap/Task/防幻觉列为硬门槛——旅程叙事与验收口径不一致，面试深挖「你怎么证明闭环可用」时会露怯。

**【备注】MVP（Minimum Viable Product）**  
最小可行产品：用最小功能集验证核心价值假设。职小伴的核心假设是「长期理解 + 专业分工 + 输出可审计」能优于单次 Chat。

**【备注】用户旅程（User Journey）**  
用户从认知到完成目标的阶段路径。AI 产品要标出每段「上下文从哪来、模型输入是什么」。

**模板**

| 步骤 | 用户动作 | 系统能力 | 现状证据 |
|------|----------|----------|----------|
| 表达目标 | 自然语言 | Master + Task | master prompt；HANDOFF Task |
| 分析岗位 | 上传/粘贴 JD | Job + Gap | job/career_gap prompt；VERIFY Gap |
| 优化简历 | 上传简历 | Resume + Eval | resume/evaluation prompt |
| 模拟面试 | 文字/语音 | Interview | voice panel；VERIFY 语音 |
| 下一步 | 查看建议 | Recommendation | recommendation prompt |

**面试一句话**：闭环不是页面列表，而是 Memory→JD→简历→面试→评价→再记忆的飞轮。

---

### 4. 需求优先级与范围裁剪原则 · 状态：部分具备

**目的**  
资源有限时决定先后；AI 项目尤需把「安全/真实性」放在体验彩蛋之前。

**怎么做**  
定原则（价值 × 风险 × 成本）；列 Must / Should / Could；用评测结果回流改优先级。

**【现状】**  
- 逐字稿明确口径：**先防幻觉底线 → 主闭环跑通 → Chat First 体验**。  
- 工程约束 [`.cursorrules.md`](../.cursorrules.md)：重要 AI 输出必须经 Evaluation；Agent 模块化。  
- 实现顺序从 README Phase 0–8 可见：先 Chat/Master/Memory，再到 Job/Resume/Interview/Eval，再到语音与 Gap/Task。  
- VERIFY 硬门槛却偏向语音体验项（见上）。

**【建议添加】《优先级原则 + Now/Next/Later》一页》**（P0）  
- **补什么**：  
  - P0：虚构拦截、Master 路由正确、简历/JD 主路径、Memory 关键写入（尤其否定性约束）。  
  - P1：Gap/Task 跨对话、Recommendation sources、面试复盘稳定性。  
  - P2：四季主题、真流式语音、重 RAG。  
- **原因**：  
  1. Memory 质量报告为 **0/7**（`MEMORY_AGENT_QUALITY_REPORT.md`），与「Memory 是核心差异化」冲突——说明优先级执行与叙事可能脱节，PM 必须用书面原则把「先修记忆验收」提为 P0。  
  2. 没有书面裁剪原则时，体验项（主题、布局）容易显得与质量项同等，面试官会问「你怎么取舍的」。  
  3. HANDOFF 已承认 Embedding 未强依赖——应写进 Later，避免被追问成「RAG 没做完的半成品」而非「有意阶段取舍」。

**【备注】RICE / 价值-风险矩阵（简释）**  
RICE：Reach（触达）× Impact（影响）× Confidence（信心）÷ Effort（工作量）。AI 场景建议把 **风险**（幻觉伤害）单独加权：高风险能力未达标时，不应用体验需求插队。

**模板**

| 层级 | 原则 | 职小伴对应现状 |
|------|------|----------------|
| P0 底线 | 不伤害用户求职诚信 | Evaluation high 阻断；Resume 禁虚构 |
| P1 闭环 | 主路径可演示 | JD/简历/面试 |
| P2 体验 | 好用爱用 | 三栏、主题、语音体验打磨 |
| Later | 明确推迟 | 真流式 ASR；强 RAG |

**面试一句话**：我的排序是防幻觉 → 闭环 → 体验；语音流式和重 RAG 是有意后置。

---

### 5. PRD / 功能规格 · 状态：部分具备

**目的**  
把定位落成可开发、可测试的需求说明（场景、规则、异常、验收）。

**怎么做**  
PRD 写：背景、目标、用户、范围、功能详述、数据、指标、风险；AI 功能必须加「模型输入/输出/失败态/质检」。

**【现状】**  
- [docs/prd.md](./prd.md)：完整长文 PRD；文首状态仍为 **「MVP设计阶段」**；含背景、定位、目标指标、用户等。  
- [docs/product.md](./product.md)：可执行摘要；但「完整 PRD」链接仍指向 `求职agent.md`（文件已不存在，已改名为 `prd.md`）——**断链**。  
- [docs/api.md](./api.md)、[docs/database.md](./database.md)：接口与数据规格，偏工程，可作 PRD 附录。  
- [docs/HANDOFF.md](./HANDOFF.md)：近期产品改动清单（三栏、语音、Gap、Task 等）——这是「实现后的现状说明」，不是字段级 PRD。

**【建议添加】**（P0）  
1. **修复 product.md 死链** → 指向 `prd.md`。  
   - **原因**：文档索引信任是作品集基本功；死链会让面试官怀疑文档治理能力。  
2. **《现状对齐短 PRD》或在 prd 文首增加「实现对照」**（10–20 页级，不必再写 1.5 万行）。  
   - **原因**：超长 PRD +「设计阶段」状态，与 README「Phase 0–8 均 ✅」并存，外部读者无法判断哪份是真相；PM 输入物应有一份 **Source of Truth（单一事实来源）** 标明已实现范围。  
3. **每个 AI 功能补「失败态」**：如 Job 短输入解析失败、Interview 复盘解析失败（质量报告已暴露）——写清产品期望（重试文案 / 降级 / 索要更多信息）。  
   - **原因**：没有失败态规格，工程只能返回「解析失败」，体验与评测都会脏。

**【备注】PRD（Product Requirements Document）**  
产品需求文档。AI PRD 比传统 PRD 多三块：**上下文来源、生成约束、评测与门禁**。

**【备注】Source of Truth**  
团队公认的「以哪份文档为准」。现状建议：日常接手以 HANDOFF+VERIFY 为准，定位以 product 为准，细节以各 prompt+api 为准，并尽快消掉 prd 与实现的时间差。

**模板（AI 功能规格字段）**

| 字段 | 说明 |
|------|------|
| 场景 | 用户一句话 |
| 触发意图 | intent 名 |
| 必要输入 | 简历/JD/Memory… |
| 输出给用户 | 结构 |
| 质检 | 是否过 Evaluation |
| 失败态 | 缺材料/低置信/解析失败时说什么 |
| 验收 | VERIFY 或质量套件条目 |

**面试一句话**：我有完整 PRD 与实现摘要，当前要补的是「与 Phase8 对齐的短事实来源」和断链修复。

---

### 6. Agent 职责矩阵与协作约束 · 状态：部分具备

**目的**  
多智能体系统必须先划清「谁干什么、谁不能瞎调用谁」，否则变成不可控的套娃 Prompt。

**怎么做**  
画矩阵：Agent × 职责 × 输入 × 输出 × 是否对用户可见；写协作约束。

**【现状】**  
- [docs/product.md](./product.md) Agent 表仅列：Master / Resume / Job / Interview / Career / Evaluation（**未列** Memory、Career Gap、Recommendation）。  
- 仓库实际存在 **9** 个 Agent，且均有 `prompt.md`：

| Agent | 路径 | Prompt 首段职责（现状） |
|-------|------|-------------------------|
| Master | `backend/app/agents/master/prompt.md` | 意图分类与路由，不直接答用户 |
| Resume | `.../resume/prompt.md` | 解析/诊断/STAR/JD 定制；禁虚构 |
| Job | `.../job/prompt.md` | JD 分析与匹配等 |
| Interview | `.../interview/prompt.md` | 出题/模拟/复盘 |
| Career | `.../career/prompt.md` | 状态识别与基于事实的陪伴 |
| Career Gap | `.../career_gap/prompt.md` | 匹配差距，优势/缺口要有 evidence |
| Memory | `.../memory/prompt.md` | 从对话提取职业信息与约束 |
| Evaluation | `.../evaluation/prompt.md` | 内部质检，不对用户直接对话 |
| Recommendation | `.../recommendation/prompt.md` | 带 why/sources/priority 的行动计划 |

- [docs/architecture.md](./architecture.md) 约束：**专业 Agent 禁止直接互相调用；路由必须经 Master；Evaluation 横切**。  
- [`.cursorrules.md`](../.cursorrules.md)：Agent 模块化；Prompt 不写死在代码。

**【建议添加】更新 product.md Agent 表 + 一页《协作约束》**（P0）  
- **补什么**：补上 Memory / Career Gap / Recommendation；写明 Evaluation「不对用户说话」；写明 Gap/Recommendation 与 Career/Job 的触发关系（以 HANDOFF/architecture 为准）。  
- **原因**：面试官若只看 product 会以为只有 6 个 Agent，与你演示的 Gap Card、推荐行动计划对不上，会被认为「文档脱离实现」。协作约束写清，才能讲明白为什么不能让 Resume 直接调 Interview。

**【备注】Agent（智能体）**  
在约定职责内，能感知输入、决策（常含是否调用工具/其它步骤）、产出结果的 LLM 封装单元。不是「又一个聊天窗口」那么简单。

**【备注】Multi-Agent**  
多个 Agent 分工协作。职小伴是 **Master 中心路由** 模式，不是完全对等自由对话。

**【备注】横切（Cross-cutting）**  
Evaluation 像质检流水线，挂在多个业务输出之后，而不是与 Resume 平级的「用户可选功能」。

**模板**

| Agent | 对用户可见 | 主要输入 | 主要输出 | 必须经 Eval？ |
|-------|------------|----------|----------|---------------|
| Master | 否（路由） | 用户消息+Task | intent JSON | 否 |
| Resume | 是 | 简历+JD | 优化报告 | 是（重要输出） |
| Evaluation | 否 | Agent 输出+原文 | risk/score | — |

**面试一句话**：九个 Agent 各有 prompt；Master 路由，Evaluation 做横切质检，禁止专业 Agent 互调。

---

### 7. 意图体系与澄清策略 · 状态：已有

**目的**  
把自然语言映射到正确 Agent；模糊时先澄清，避免乱调度。

**怎么做**  
定义意图枚举、边界案例、低置信策略、与 Task Memory 的优先级。

**【现状】——以代码规格为准**  
[backend/app/agents/master/prompt.md](../backend/app/agents/master/prompt.md) 已定义：

| intent | 含义 | need_agent |
|--------|------|------------|
| memory_update | 补充/纠正/记住职业事实 | memory_agent |
| resume | 简历优化等 | resume_agent |
| jd_analysis | JD/岗位分析 | job_agent |
| interview | 模拟面试/复盘等 | interview_agent |
| career_consult | 职业咨询/方向/Offer | career_agent |
| general_chat | 弱相关闲聊 | null |

特殊规则（现状原文要点）：  
- 「我之前负责… / 没有真实…经验」等 → 优先 `memory_update`。  
- 焦虑/被拒 → 优先 `career_consult`。  
- 仅明确要求优化/改/定制简历或粘贴全文 → `resume`。  
- 有 Task 时优先推进下一步对应意图，但不覆盖用户明确新意图。

质量证据：`MASTER_AGENT_QUALITY_REPORT.md` **8/8**，均分 4.88/5。

**【建议添加】《模糊意图澄清话术表》**（P1）  
- **补什么**：例如「我想转 AI 产品」→ 固定追问：目标岗位？是否有 JD？是否有简历？并写清最多追问轮次。  
- **原因**：规则在 Master prompt 里较全，但**产品侧澄清话术与完成率指标**未写成独立输入物；复合指令（「分析岗位+改简历+面试」）依赖模型拆解，缺少 PM 验收文案时，体验一致性难保证。

**【备注】Intent（意图）**  
用户这句话「想干什么」的类别标签，用于路由。  
**【备注】置信度（Confidence）**  
模型/规则对分类把握程度；低置信时应澄清而非硬路由。  
**【备注】澄清链**  
用有限轮次追问把模糊需求收敛到可执行意图（科研 Agent 项目同构方法论）。

**模板**

| 用户原话类型 | 期望 intent | 若信息不足 |
|--------------|-------------|------------|
| 补充经历/否定事实 | memory_update | 确认记入 Memory |
| 明确改简历 | resume | 索要简历/JD |
| 粘贴 JD 分析 | jd_analysis | — |
| 开始面试 | interview | 可基于已有画像开场 |
| 迷茫/被拒 | career_consult | 引用 Career Status 数据 |

**面试一句话**：意图六类写在 Master prompt 里，否定性事实优先入库，不与改简历关键词打架。

---

### 8. Prompt 产品规格 · 状态：已有（散落在各 Agent）

**目的**  
把「模型该如何表现」写成可版本管理的产品资产，而不是口头跟开发说「再严谨一点」。

**怎么做**  
对每个 Agent 规定：角色、边界、输入字段、输出 schema、负面示例、与 Evaluation 关系；外置文件；改版可回归。

**【现状】**  
- 九个 Agent 均有独立 `prompt.md`（见上表路径）。  
- `.cursorrules.md`：Prompt 禁止写死在代码，统一放 `prompt.md` 或 `prompts/`。  
- `evaluation/prompt.md` 含风险分档表（润色/归纳/结构化 vs 事实新增）、简历检查重点、面试评分权重、Gap/Recommendation 检查点。  
- `memory/prompt.md` 含类型、importance 评分、constraint 必须提取。  
- Dashboard 可看 Prompt 相关能力（api / frontend dashboard；库表预留 `prompt_templates` 在 database.md）。

**【建议添加】《Prompt 规格总表（PM 版）》**（P1）  
- **补什么**：一张总表：Agent、当前文件路径、关键红线、最近质量通过率、负向用例 ID。  
- **原因**：规格已散落在 9 个文件，PM 面试需要「我如何管理 Prompt 质量」的总览；否则只能说「每个都有 prompt」。总表也能驱动发版：哪份 prompt 变更必须跑哪套 dataset。

**【备注】Prompt**  
给模型的指令文本。  
**【备注】System Prompt**  
系统级角色与硬约束，通常优先级高于用户闲聊。  
**【备注】结构化输出**  
要求模型只输出 JSON 等固定结构，便于程序路由与质检（Master/Memory/Eval 均如此）。  
**【备注】Few-shot**  
在提示中给少量示例，引导格式与边界。  
**【备注】负面示例（Negative Example）**  
明确「错误示范」，降低幻觉与越权（如禁止输出保证拿 offer）。

**模板（单 Agent Prompt 产品规格）**

| 字段 | 内容 |
|------|------|
| 角色一句话 | |
| 必须做 | |
| 严禁做 | |
| 输入 | |
| 输出 schema | |
| 负面示例 | |
| 关联精标集 | |
| 变更回归命令 | |

**面试一句话**：Prompt 是产品规格的一部分，外置可管，并和精标集绑定回归。

---

### 9. Memory / Task 字段与写入规则 · 状态：部分具备（能力有，验收弱）

**目的**  
让系统「长期理解用户」可落地：存什么、怎么更新、如何注入后续 Agent。

**怎么做**  
定义记忆类型、冲突策略、否定性事实、来源与置信度、Task 生命周期。

**【现状】**  

**Memory Agent 规格**（`memory/prompt.md`）：  
- 事实：experience / project / skill / career_goal / profile  
- 限制：constraint_memory（如无真实 RAG 经验）**必须提取**  
- 状态：gap_memory / progress_memory  
- 规则：只提取用户明确陈述；不要推测编造  

**数据模型**（`database.md`）：  
- `career_profiles`、`experiences`、`projects`（含 source、confidence）  
- Phase 8：`career_tasks`、`career_gaps`、`recommendations`（HANDOFF / architecture / database 后文）  
- product/architecture：Memory 类型扩展 fact/skill/goal/gap/progress；Task 跨 Conversation 保持 active  

**产品表现**：Profile、右侧画像、Current Task 面板、Gap Card（前端路径见 HANDOFF / VERIFY）。

**质量硬证据**：`MEMORY_AGENT_QUALITY_REPORT.md` —— **0/7 通过，均分 1.0/5**（报告写明 Profile 未命中、易误路由成简历优化等）。这与「Memory 是核心差异化」的产品叙事**冲突**。

**【建议添加】（P0，强烈建议）**  
1. **《Memory 验收规格》**：每类记忆的正反用例、Profile 字段命中标准、constraint 优先级测试。  
2. **把 Memory 冒烟纳入 VERIFY 硬门槛**（至少 3 条：写入经历、写入否定约束、纠正冲突）。  
3. **对照 0/7 报告出修复优先级**（产品验收条目，不只是「算法再调调」）。  

**详细原因**：  
- 面试官若先看 product 再看质量报告，会认为差异化未达标——你必须能主动讲「问题已知、规格如此、验收门禁要补上」。  
- 否定性约束若落库不稳，Resume/Gap 会重新「造出 RAG 经验」，Evaluation 再疲于拦截，成本高且体验差。  
- Memory 是所有下游 Agent 的上下文根；根不稳时，Job/Gap/Recommendation 的「有依据」都会变成空中楼阁。

**【备注】Memory（记忆）**  
跨会话保存的用户信息与状态，供后续推理使用。  
**【备注】Task Memory**  
记的是「正在完成什么任务/进度/下一步」，不是聊天摘要。Conversation 是「聊了什么」，Task 是「在推进什么」。  
**【备注】置信度 / source**  
表示提取可靠程度与来源（简历上传 / 对话 / 手动），供 Gap 引用与审计。

**模板**

| 类型 | 必须字段 | 冲突策略 | 验收用例 |
|------|----------|----------|----------|
| constraint_memory | constraint, topic? | 纠正优先于旧事实 | 「没有真实 RAG」不得被优势写成有 RAG |
| experience | position, responsibility… | 同公司合并规则 | 对话补充后 Profile 可见 |
| task | goal, progress, next | 跨会话复用 active | 新开对话仍见任务 |

**面试一句话**：Memory 规格写得很全，但质量套件 0/7 说明验收未过，我把它列为 P0 补门禁与修复，而不是回避。

---

### 10. 材料与知识规范（简历 / JD / RAG 定位） · 状态：部分具备

**目的**  
规定用户材料如何进入系统、解析期望是什么、检索能力处在哪一阶段。

**怎么做**  
定义支持格式、解析输出结构、误传处理、知识更新；诚实写清 RAG 是否主路径。

**【现状】**  
- Resume / Job Agent prompt 规定解析与优化行为；防虚构。  
- HANDOFF：JD 上传若实为简历会自动切换（`LOOKS_LIKE_RESUME`）；docx 进度与可读错误。  
- [docs/database.md](./database.md)：`document_chunks` 向量表在「后续扩展 / Phase1+」叙述中；HANDOFF：**Embedding 配置存在，业务主路径尚未强依赖**。  
- 逐字稿 §3：主路径是 Career Memory + 结构化材料，不是十万级文献混合检索。  
- architecture §6 扩展表仍有过时「骨架」表述，与实现不完全一致（见建议）。

**【建议添加】**（P1）  
1. **《材料解析验收表》**：简历必备字段、JD 最短可分析长度、空 JD/短 JD 的产品文案（对齐 Job 报告里「仅岗位公司 / 管理岗解析失败」类问题）。  
2. **书面《RAG 阶段决策》**：为何先 Memory 后强 RAG；pgvector 预留用途。  
3. **修正 architecture §6 过时状态**，避免读者以为 Chat/Master 未实现。  

**原因**：  
- 不把「未强依赖 Embedding」写成主动决策，面试会被打成能力缺失。  
- Job 6/8、短输入失败已是现状，缺少材料规范就会重复踩坑。  
- 过时架构表会直接伤害作品集可信度。

**【备注】RAG（Retrieval-Augmented Generation）**  
先检索相关知识再生成，降低胡编、可引用。  
**【备注】Embedding**  
把文本变成向量以便相似度检索。  
**【备注】pgvector**  
PostgreSQL 的向量扩展；本项目架构选用其做预留能力。  
**【备注】幻觉（Hallucination）**  
模型生成无依据或错误的内容；求职场景下虚构项目/数据属于高危幻觉。

**模板**

| 材料 | 输入形式 | 解析输出 | 失败态 |
|------|----------|----------|--------|
| 简历 | 粘贴/docx | 经历/项目/技能/待补充 | 索要全文 |
| JD | 粘贴/上传 | 职责/硬性/隐性要求 | 信息不足提示 |
| 知识检索 | （预留） | chunks | 主路径不依赖 |

**面试一句话**：我把知识主路径定义在 Memory 与材料结构化上；向量检索是预留，是阶段取舍不是遗忘。

---

### 11. Evaluation 规则与风险分级 · 状态：已有

**目的**  
在用户看到「可投递结果」前增加质检闸门，守住真实性。

**怎么做**  
定义检查维度、风险分级、阻断策略、与各业务输出的挂钩点。

**【现状】**  
`evaluation/prompt.md` 已完整定义：  
- 检查：真实性、来源一致性、岗位匹配、质量分、风险等级。  
- 分档：表达润色/合理归纳/轻微结构化 → low；事实新增 → medium/high。  
- 简历：参与≠主导；禁增项目指标；注意误伤合理归纳。  
- 面试回答权重：理解 20% / 结构 20% / 专业 30% / 匹配 20% / 真实 10%。  
- Gap / Recommendation / 复盘均有检查重点。  
- 输出 JSON：`risk_level`、`score`、`problems`、`fabricated_claims` 等。  

质量：`EVALUATION_AGENT_QUALITY_REPORT.md` **6/7**，均分 4.43/5；存在「可信改写误伤」部分通过。  
产品：高风险可阻断（Resume 防虚构用例在 Resume 报告中体现）；Dashboard 看幻觉/BadCase（api.md / frontend dashboard）。

**【建议添加】《阻断策略产品说明》**（P1）  
- **补什么**：何种 risk 对用户显示什么（阻断全文 / 警告可编辑 / 仅记录）；误伤申诉/放行流程（作品集可简化为「降低阈值 + 加负面例」）。  
- **原因**：规则在 Eval prompt 很细，但**产品层阻断 UX**未单独成文；且 6/7 含误伤，说明阈值与产品文案需要 PM 定义「宁可严一点还是体验优先」的原则。

**【备注】Evaluation（评估/质检 Agent）**  
对其他 Agent 输出做审核的层。  
**【备注】风险分级**  
用 low/medium/high 决定是否展示、是否入库 BadCase。  
**【备注】忠实度（Faithfulness）**  
生成内容是否严格基于给定上下文，不编造。

**模板**

| 输出类型 | 必查项 | high 时产品行为 |
|----------|--------|-----------------|
| 简历优化 | 虚构项目/指标/职责升级 | 阻断可投递稿 |
| 面试复盘 | 虚构经历、分数脱离对话 | 不可展示虚假复盘 |
| Gap | 无 evidence 的优势 | 降级/重跑 |
| 推荐 | 无 sources / 保证 offer | 不下发 |

**面试一句话**：Evaluation 是横切质检，风险分档写在 prompt 里，高风险不能当可投递结果交给用户。

---

### 12. 精标集 / 评测集设计 · 状态：部分具备

**目的**  
用固定样本回归「该拦的拦住、不该杀的别杀」，支撑发版。

**怎么做**  
按场景建集；正负样本；期望 risk；与训练数据隔离；持续加 BadCase。

**【现状】**  
`backend/app/evaluation/datasets/`：

| 文件 | 用途（文件自述） | 规模（盘点约数） |
|------|------------------|------------------|
| `resume_hallucination.json` | 简历虚构 vs 正常改写 | 3 cases |
| `jd_analysis.json` | JD/公司事实虚构 | 2 |
| `interview_answer.json` | 面试编造经历 | 2 |
| `career_gap.json` | Gap 虚构优势 | 2 |

另有：`dataset_runner.py`；Dashboard 可跑 dataset；各 Agent 还有独立质量报告套件（题量 6–8 不等）；`docs/quality/answer_quality_report.md` 曾录得较低通过率（需以当次运行为准）。

**【建议添加】评测集扩容计划（P0）**  
- **补什么**：每类至少扩到能覆盖质量报告失败模式，例如：  
  - Resume：角色通胀、指标编造、合理归纳（防误杀）  
  - Job：短 JD、仅岗位公司、管理岗标题  
  - Interview：复盘解析失败文案、编造 RAG  
  - Memory：否定性约束、冲突纠正、勿误路由 resume  
  - Recommendation：缺 sources、解析失败  
- **原因**：约 **9** 条静态 case 不足以支撑「字段级回归」与面试叙事「我们有完善精标集」；质量报告已经暴露的失败类型若未进入 dataset，修了还会回退。  
- **不补的风险**：只能演示个别 happy path，被追问评测体系时样本单薄。

**【备注】精标集 / Golden Set**  
人工确认过的标准问答或输入输出对，用于评估而非（或不主要用于）训练。  
**【备注】正负样本**  
正：应正确通过；负：应拒答/判高风险。  
**【备注】回归（Regression）**  
改 Prompt/代码后重跑旧用例，防止修 A 坏 B。

**模板（单条 case）**

| 字段 | 说明 |
|------|------|
| id | 唯一 |
| kind | resume/job/interview/career_gap… |
| 输入 | source_text / jd / answer… |
| output 或待测对象 | |
| expected_risk_level | |
| expect_fabricated | true/false |
| 备注 | 对应质量报告哪条失败 |

**面试一句话**：四类精标集已经落地，但样本偏少；我会按 BadCase 与质量报告失败模式扩容并挂钩发版。

---

### 13. 指标体系 · 状态：部分具备

**目的**  
定义什么叫变好；区分业务、体验、模型，避免只用「感觉更聪明了」。

**怎么做**  
三层指标；写清分子分母；绑定数据来源（日志/人工套件/Dashboard）。

**【现状】**  
- [docs/prd.md](./prd.md) §1.4 有目标向指标（准备时长降低、训练完成率等）——偏目标设想。  
- 逐字稿 §5：作品集验证口径的三层（闭环完成度、可解释、路由/幻觉/耗时）+ 引用质量报告数字。  
- Dashboard / `api.md`：成功率、幻觉率、BadCase、Prompt 版本等。  
- 各 `*_QUALITY_REPORT.md`：分 Agent 通过率与均分（可作模型层现状）。  

**部分 Agent 现状摘要（以报告文件为准）**：  
Master 8/8；Resume 8/8；Career 6/6；Gap 6/7；Eval 6/7；Interview 6/7；Job 6/8；Recommendation 4/6；**Memory 0/7**。

**【建议添加】《指标定义 v1》短文档》（P0）**  
- **补什么**：北极星（建议：主闭环成功完成率 或 高风险输出拦截率——二选一写清）；三层指标字典（名称、公式、数据源、目标、现状值）；明确「作品集验证口径 vs 线上未建设」。  
- **原因**：指标散落导致面试口径漂移；Memory 0/7 与 Dashboard 成功率若不放在同一张表，无法做管理决策；prd 里「降低 50%」类目标缺少测量方法，易被追问穿帮。

**【备注】北极星指标（North Star Metric）**  
最能代表产品核心价值的单一指标。  
**【备注】代理指标（Proxy Metric）**  
如路由准确率，间接反映体验，不能单独代替业务结果。  
**【备注】作品集验证口径**  
用评测套件/演示路径证明能力，不伪装成大规模线上 DAU。

**模板**

| 层级 | 指标名 | 公式 | 数据源 | 现状 |
|------|--------|------|--------|------|
| 业务 | 主闭环完成 | 完成 JD+简历+面试的会话占比 | 需补埋点/手工演示清单 | 有路径，缺统一统计文 |
| 体验 | 建议含 sources 比例 | 含 sources 建议数/总建议 | Recommendation 输出 | prompt 强制 |
| 模型 | 路由准确率 | 套件正确数/总数 | MASTER 报告 | 8/8 |
| 模型 | 幻觉拦截 | 应 high 且被标出的占比 | Eval dataset | 有集，样本少 |
| 模型 | Memory 提取验收 | 套件通过率 | MEMORY 报告 | 0/7 |

**面试一句话**：我用三层指标看产品；当前会主动同步 Memory 0/7 等现状，而不是只报喜。

---

### 14. BadCase 归因与逆向排查 SOP · 状态：部分具备

**目的**  
出错时系统性定位，而不是一律「换个更大模型」。

**怎么做**  
分类标签；固定排查顺序；每案改一条规格或一条用例。

**【现状】**  
- 架构：high → BadCase 自动（architecture Phase5 描述）。  
- `docs/quality/`：`bad_cases_import.json`、answer quality 报告与日志。  
- Dashboard：BadCase 查看。  
- 质量报告已暴露可归因类型：意图/Memory 误路由、简历虚构、Eval 误伤、Job 解析失败、Interview 复盘解析失败、Recommendation 解析失败、Gap 空输入乱评分等。  
- 逐字稿 §6/§10：归因分类与逆向链路（意图→Memory→Prompt→Eval）。

**【建议添加】正式《BadCase SOP》+《未通过项产品清单》》（P0）  
- **补什么**：  
  1. 标签枚举（路由错误 / 幻觉 / 解析失败 / 缺 evidence / Memory 漏提…）。  
  2. 排查顺序清单。  
  3. 把当前报告「部分通过/未通过」收成一张必须关闭的产品表（负责人、验收标准、关联 dataset id）。  
- **原因**：有 BadCase 能力不等于有治理；没有 SOP，作品集只能展示「有 Dashboard」，不能证明你会运营 AI 质量。把已知失败写成清单，反而是加分的诚实与方法。

**【备注】BadCase**  
错误或不良案例，用于分析与回归。  
**【备注】逆向链路排查**  
从用户可见错误往回查：输入→路由→上下文→生成→质检→展示。

**模板**

| 字段 | 说明 |
|------|------|
| case_id | |
| 用户可见现象 | |
| 标签 | |
| 根因层 | 意图/Memory/Prompt/解析/Eval/前端 |
| 修复 | |
| 回归用例 | |
| 状态 | open/closed |

**面试一句话**：BadCase 我按层归因，固定逆向顺序，并强制回归进精标集。

---

### 15. 交互与体验规格 · 状态：部分具备

**目的**  
把 Chat First、画像、语音等体验变成可验收的界面与状态规则。

**怎么做**  
关键页面状态、空态、加载、错误文案、权限（麦克风）、响应式。

**【现状】**（HANDOFF + VERIFY + 前端路径）  
- 三栏布局、画像可拖隐：`use-panel-layout`；`career-profile-card`。  
- 输入区 JD / 简历 / 语音面试并排：`message-input.tsx`。  
- 语音：电话式、`voice-interview-panel.tsx`；非真流式限制已写明。  
- 四季主题与安抚语：`components/atmosphere/`。  
- Gap Card、Current Task：`components/career/`。  
- 错误：`readApiError` 解析 FastAPI detail。  
- SSE 事件：conversation_updated、career_gap、task_updated 等（architecture / api）。

**【建议添加】《关键交互状态规格》短文》（P2）**  
- **补什么**：语音权限拒绝、TTS 失败、Eval 阻断时的用户可见文案；Gap「暂不评分」的触发条件（VERIFY 已有行为描述，可升格为规格）。  
- **原因**：行为已实现一部分，但 PM 输入物层缺少集中 UX 规格，后续改交互易回退；面试讲体验时需要「状态机级」描述。

**【备注】SSE（Server-Sent Events）**  
服务器向浏览器推流事件，用于流式 token 与侧栏刷新。  
**【备注】ASR / TTS**  
语音转文字 / 文字转语音。本项目与文本 LLM 配置分离（HANDOFF）。  
**【备注】空态 / 加载态 / 错误态**  
无数据、进行中、失败时界面应分别设计，避免甩 JSON。

**模板**

| 场景 | 用户看见 | 系统行为 | 验收 |
|------|----------|----------|------|
| 无简历改简历 | 索要材料 | 不编造 | Resume 套件 |
| Eval high | 阻断说明 | 记 BadCase | Eval 套件 |
| 语音无麦 | 引导换浏览器 | — | VERIFY |

**面试一句话**：体验规格落到三栏、语音状态和可解释建议；流式语音是已知后置项。

---

### 16. 验收标准与演示脚本 · 状态：已有

**目的**  
定义「什么样算做完/可交接/可演示」。

**怎么做**  
自动脚本 + 人工清单 + 演示故事线；区分硬门槛与加分项。

**【现状】**  
[docs/VERIFY.md](./VERIFY.md)：  
- A. `verify_smoke.py`：DB、health、conversation、profile、TTS、语音 API、前端端口等。  
- B. 人工：布局、文件、**语音 5 项**、回归、Gap、Task。  
- D. **通过标准：脚本全绿 + 语音 5 项全部勾选**。  

演示素材：`docs/screenshots/`、`docs/职小伴-作品集截图.pdf`。

**【建议添加】调整通过标准 + 《3 分钟演示脚本》》（P0）  
- **补什么**：  
  1. 硬门槛增加：至少 1 条防虚构阻断演示；Memory 写入否定约束；Gap 有 evidence（现为清单项但非 §D 硬门槛）。  
  2. 一页演示脚本：开场定位 → 上传 JD → Gap → 改简历（含拦截）→ 面试一问 → Dashboard。  
- **原因**：当前硬门槛偏语音，与差异化（Memory/Eval/Gap）不完全同构；演示无脚本则作品集临场易跑偏到「看 UI」。

**【备注】冒烟测试（Smoke Test）**  
发布或交接前跑的最小子路径，证明系统「冒烟能开」。  
**【备注】验收标准（Acceptance Criteria）**  
可勾选的完成定义，避免「我觉得好了」。

**模板（演示脚本）**

| 分钟 | 动作 | 要讲的 PM 点 |
|------|------|--------------|
| 0–0.5 | 定位句 | Memory+Agent+Eval |
| 0.5–1.5 | JD→Gap | evidence |
| 1.5–2.5 | 简历优化/阻断 | 真实性 |
| 2.5–3 | 面试或 Dashboard | 质量运营 |

**面试一句话**：验收以 VERIFY 为准，但我会把防幻觉和 Memory 补进硬门槛，使之匹配产品定位。

---

### 17. 风险与合规 · 状态：部分具备

**目的**  
识别 AI 求职产品特有伤害面：虚假履历、错误承诺、隐私与密钥泄露。

**怎么做**  
风险清单；红线；降级策略；文档与 git 规范。

**【现状】**  
- 产品红线：Resume/Eval/Gap/Recommendation prompt 均反虚构、反无来源建议、反保证 offer。  
- HANDOFF：`.env` 不进 git；密钥不写进文档；语音与文本 API 分离，避免打到无音频能力的 Base。  
- `.gitignore` / 私有 License 声明在 README。  
- 质量体系对虚构类有检测集。

**【建议添加】《风险清单一页》》（P1）  
- **补什么**：风险项、严重级别、现有控制、残余风险（如 Memory 0/7、复盘解析失败、非真流式导致误听）。  
- **原因**：控制散落在多处 prompt 与交接文；汇总后可在面试 1 分钟讲完「我如何管 AI 风险」。

**【备注】合规（作品集语境）**  
至少做到：不泄露密钥与他人简历隐私；不对用户输出不实履历；对外演示数据用测试账号。  
**【备注】残余风险**  
控制措施之后仍可能发生的问题，需要监测与迭代，而不是假装为零。

**模板**

| 风险 | 级别 | 现有控制 | 残余 | 下一步 |
|------|------|----------|------|--------|
| 虚构简历 | 高 | Eval+精标集 | 误伤/漏检 | 扩容集 |
| 无依据推荐 | 中 | sources 约束 | 解析失败 | 修 Recommendation |
| 密钥泄露 | 高 | gitignore+HANDOFF | 人工失误 | 检查清单 |
| Memory 错写 | 高 | prompt 规则 | 验收 0/7 | P0 修复 |

**面试一句话**：最大产品风险是帮用户造假履历；我用 Evaluation 和精标集做闸门，并承认 Memory 验收仍是残余风险。

---

## 附录 A · AI 产品基础名词速查

| 名词 | 一句话 |
|------|--------|
| LLM | 大语言模型，根据提示生成文本 |
| Token | 模型计费与上下文的基本单位 |
| 上下文窗口 | 单次能「看见」的最大文本长度 |
| 温度 Temperature | 采样随机程度；越高越发散 |
| 幻觉 | 无依据或错误生成 |
| 忠实度 | 是否基于给定材料 |
| Prompt / System Prompt | 指令 / 系统级硬约束 |
| Few-shot | 用少量示例引导 |
| 结构化输出 | 固定 JSON 等便于程序处理 |
| Agent | 有职责边界的 LLM 单元 |
| Multi-Agent | 多 Agent 协作 |
| Intent | 意图类别，用于路由 |
| Tool | 模型可调用的外部能力（搜索、解析等） |
| RAG | 先检索再生成 |
| Embedding | 文本向量化 |
| 向量库 / pgvector | 存向量并检索；本项目预留 |
| Memory | 长期用户信息 |
| Task Memory | 跨对话任务进度 |
| Evaluation | 输出质检层 |
| 精标集 | 评估用金标准样本 |
| BadCase | 不良案例 |
| Chat First | 对话优先交互 |
| SSE | 服务端推流 |
| ASR / TTS | 语音识别 / 合成 |
| MVP | 最小可行产品 |
| 北极星指标 | 核心价值指标 |
| 澄清链 | 有限轮追问收敛意图 |
| STAR | 情境-任务-行动-结果 叙述结构 |
| North Star / Proxy | 核心指标 / 代理指标 |
| Source of Truth | 单一事实来源文档 |

---

## 附录 B · 面试口述提纲（2–3 分钟，基于现状）

1. **定位**：职小伴是 Multi-Agent 求职助手，核心不是套壳生成，而是 Career Memory + 专业 Agent + Evaluation。证据：`product.md`、九个 `prompt.md`。  
2. **我输入了什么**：问题与闭环、意图体系、各 Agent 边界、Eval 风险分档、精标集门类、VERIFY 验收。  
3. **闭环**：目标→Memory→JD→简历→面试→质检→记忆/任务更新（product + HANDOFF）。  
4. **质量诚实**：Master/Resume 套件表现好；**Memory 0/7**、Job/Interview/Recommendation 仍有部分失败——我把它写进 P0 输入物（验收规格与扩容精标集），而不是只讲亮点。  
5. **取舍**：主路径先 Memory 与防幻觉；Embedding/强 RAG、真流式语音是后置（HANDOFF）。  

---

## 附录 C · 【建议添加】汇总表（优先级）

| 优先级 | 建议添加项 | 主要原因（摘要） |
|--------|------------|------------------|
| P0 | 修复 `product.md` 死链；补全 Agent 表 | 入口文档与实现不一致，损害可信度 |
| P0 | 《指标定义 v1》 | 口径散落；无法管理 Memory 0/7 等现状 |
| P0 | Memory 验收规格 + 写入 VERIFY 硬门槛 | 核心差异化与质量报告冲突 |
| P0 | 精标集按失败模式扩容 | 约 9 条不足以回归 |
| P0 | BadCase SOP + 未通过项产品清单 | 有数据无治理 |
| P0 | VERIFY 硬门槛对齐差异化 + 演示脚本 | 现硬门槛偏语音 |
| P1 | 痛点/非目标一页纸；优先级 Now/Next/Later | 便于面试与裁剪 |
| P1 | 现状对齐短 PRD；AI 功能失败态 | 长 PRD 与 Phase✅ 时间差 |
| P1 | Prompt 规格总表；Eval 阻断 UX 说明 | 散落规格难管理 |
| P1 | 材料解析验收表；RAG 阶段决策书 | 短 JD 失败；避免被误解为半成品 |
| P1 | 风险清单一页 | 控制点汇总 |
| P2 | product「三不」；UX 状态规格；architecture §6 过时表修正 | 体验与文档卫生 |

---

## 附录 D · 仓库证据索引（写作用）

| 类型 | 路径 |
|------|------|
| 产品摘要 | `docs/product.md` |
| 长 PRD | `docs/prd.md` |
| 架构 | `docs/architecture.md` |
| 交接 | `docs/HANDOFF.md` |
| 验收 | `docs/VERIFY.md` |
| 逐字稿 | `docs/逐字稿-职小伴求职agent.md` |
| Agent Prompt | `backend/app/agents/*/prompt.md` |
| 精标集 | `backend/app/evaluation/datasets/*.json` |
| 质量报告 | `docs/*_AGENT_QUALITY_REPORT.md` |
| 质量跑批 | `docs/quality/` |
| 前端关键 | `frontend/components/chat|career|layout|atmosphere/` |
| 规范 | `.cursorrules.md` |

---

*文档版本：v1 · 基于仓库盘点撰写 · 角色视角：AI 产品经理输入物*
