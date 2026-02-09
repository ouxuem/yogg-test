# AI Evaluation System V2 — MVP 技术设计文档（审阅版）

> MVP：上传文本 → AI 分析 → 展示结果 → 导出 PDF<br>
> 不做：登录/历史记录/分享链接/一键改写<br>
> 目的：**对齐 V2 评分体系**，并能产出与 UI 截图一致的 Dashboard/Diagnosis 数据结构（N 集自适应）。

---

## 1. 背景与目标

### 1.1 产品目标（MVP）

- 用户提交一份**完整分集稿**（英文/中文均可的小说/短剧剧本），包含从 `EPISODE 1` 到 `EPISODE N` 的全部内容（N 不固定）。
- 系统输出：
  - 右上角 `Overall Score 0–100`
  - 中部 `Grade (S+/S/A+/A/B/C)`
  - 三条维度条：`Monetization / Story / Market`
  - 图表：情绪曲线、Ext/Int 冲突柱状图（按阶段聚合）
  - 逐集矩阵（Episode Matrix）与逐集列表（Episode Breakdown）
  - 诊断页（Structural Diagnosis）：Issue + Suggestion
  - Export PDF（打印视图）

> 重要说明：**V2 评分体系天然更偏向“完整输入（全书/全剧本）”**。因此本 MVP 只接受“完整分集稿”为输入；若缺集/只有前几集，将直接判定为输入不合格并提示补齐。

### 1.2 约束（来自业务）

- **集数 N 不固定**：完全取决于文本里出现的 Episode 数量（或章节数）。
- **输入必须完整**：必须包含 `EPISODE 1..N` 的完整文本；缺集视为输入错误（MVP 不处理“半篇/前几章”）。
- **作者可按需要格式编辑**：可以提供 Episode 标题与 Paywall 标记（推荐）。
- **MVP 不落库**：不做账号/历史记录；一次分析一次结果。

### 1.3 V2 对“完整输入”的依赖（需要在评审时明确）

《AI Evaluation System V2》里大量规则是**位置型/窗口型**（依赖明确的 Episode 编号、付费点位置、前后集承接），典型例子：

- 开篇吸引力：要求 **Episode 1/2/3 的固定窗口**（例如 “Episode 2 开头 1000 字符内”）。
- 付费卡点：要求 **PAYWALL 在 6–7 / 10–12 / 13–15**，并且还要评估前一集与后一集。
- 看点密度：存在 **“前 12 集”**、**“抽查 Ep2/4/8/10”** 等条件。
- 第二付费点：依赖 **剧本总集数区间**（<30/30–50/51–70/…）来判断窗口与是否“自动满分”。

因此：

- **MVP 默认只接受完整输入**：能覆盖绝大多数规则，分数与等级口径稳定。
- **缺集/非完整输入**：判定为输入不合格（返回错误，提示作者补齐 `EPISODE 1..N`）。

---

## 2. 输入契约（Input Contract）

> MVP 建议强制要求作者使用 Episode 标题；否则“按字数自动切分”会显著损害可解释性与评分可靠性。

### 2.1 推荐格式

```text
TITLE: The Last Horizon
TOTAL_EPISODES: 50        # 必填（用于 V2 的长度窗口与第二付费点评估）
IS_COMPLETED: true        # 必填（MVP 只接受完结/全本输入；false 直接判定输入不合格）

EPISODE 1
...

EPISODE 2
...

EPISODE 9
...
[PAYWALL]
...
```

### 2.2 解析规则（大小写不敏感）

- Episode 头：`^EPISODE\s+(\d+)\b`（可扩展兼容 `^EP\s+(\d+)`）
- Paywall 标记：`\[PAYWALL\]`
- 元信息：
  - `TITLE: ...`（可选）
  - `TOTAL_EPISODES: <int>`（必填：用于判断剧本长度区间、第二付费点窗口，以及“<30 集自动满分”是否成立）
  - `IS_COMPLETED: true|false`（必填：MVP 必须为 true）

### 2.3 完整性校验（MVP 必做）

在进入评分前执行预检；任一失败直接返回错误（避免“半篇也给分”导致口径争议）：

1) `TOTAL_EPISODES` 必须存在，且为整数；MVP 建议要求 `TOTAL_EPISODES >= 15`（V2 存在 Ep10/Ep12/Ep15 等固定窗口规则）。
1.1) `IS_COMPLETED` 必须存在，且为 `true`；若为 `false` 直接返回错误（MVP 不支持“未完结/不完整输入”的评分口径）。
2) Episode 集合必须覆盖 `1..TOTAL_EPISODES`：
   - 不允许缺号（例如缺 EPISODE 7）
   - 不允许重复编号（例如两个 EPISODE 9）
3) `[PAYWALL]` 标记：
   - 允许 **0/1/2 个**
   - 超过 2 个视为输入错误（MVP 不支持更多付费点）
   - 若某一集出现多个 `[PAYWALL]`，视为输入错误
4) `[PAYWALL]` 所在集必须满足 `2 <= ep <= TOTAL_EPISODES - 1`（V2 需要评估前一集与后一集）。
5) 仅当 `TOTAL_EPISODES < 30` 且 `IS_COMPLETED=true` 时，才允许按 V2 规则将“第二付费点”判为自动满分；**不得**用“当前文本解析到的集数 < 30”做推断。

错误码（MVP）：

- `ERR_INCOMPLETE`：`IS_COMPLETED=false`
- `ERR_TOO_SHORT`：`TOTAL_EPISODES < 15`
- `ERR_MISSING_EPISODE`：缺集（未覆盖 1..N）
- `ERR_DUPLICATE_EPISODE`：重复集号
- `ERR_TOO_MANY_PAYWALLS`：`[PAYWALL]` > 2
- `ERR_MULTI_PAYWALL_IN_EPISODE`：单集出现多个 `[PAYWALL]`
- `ERR_PAYWALL_OUT_OF_RANGE`：`[PAYWALL]` 出现在第 1 集或最后一集

---

## 3. 输出与评分口径（对齐 UI + 避免逻辑漏洞）

### 3.1 双轨制（Score vs Diagnosis）

- **Track A（Auditor / Score）**：严格按《AI Evaluation System V2》执行打分（0–110）。
- **Track B（Coach / Diagnosis）**：逐集结构诊断、卡点强弱、节奏问题、建议文本（不直接改动 Track A 分数）。

> UI 的 “Episode Structural Diagnosis” 属于 Track B；UI 的 `Overall Score/Grade/三维度条` 属于 Track A 的聚合展示。

### 3.2 审计项（Audit Items）与异常处理

MVP 默认输入为完整分集稿，因此不做“部分输入归一化”，所有 V2 子项都按其定义的 `max` 直接计入 `total_110`。

每条规则输出一条审计记录（用于生成维度条解释文案、PDF 附录、以及技术排查）：

```json
{ "id": "pay.opening.ml_entry", "status": "ok|warn|fail", "score": 3, "max": 5, "reason": "...", "evidence": ["..."] }
```

状态含义：

- `ok`：规则按 V2 成功执行，且输入满足前置条件
- `warn`：规则可执行但存在质量问题（例如缺少 `[PAYWALL]` 导致付费点子项为 0 分；或 L2 置信度低导致回退到关键词近似）
- `fail`：输入违背契约（原则上应在 2.3 预检阶段被拦截；保留该状态用于兜底）

### 3.3 分数换算（110 → 100 + Grade）

- `total_110`：Track A 得分（0–110）
- `overall_100 = round(total_110 / 110 * 100)`
- `grade`（按 V2 阈值）：
  - S+：101–110
  - S：91–100
  - A+：86–90
  - A：81–85
  - B：70–80
  - C：<70

> UI 默认展示 `overall_100` 与 `grade`。

---

## 4. 系统架构（最小可落地：单体 Next.js）

### 4.1 页面与路由

- `/`：输入页（粘贴/上传文本，点击 Analyze）
- `/result`：Dashboard（对齐截图 1）
- `/diagnosis`：Episode Structural Diagnosis（对齐截图 2）
- `/print`：打印视图（Export PDF）

交互约定（对齐截图）：

- Dashboard 的 `Episodes 1–N Summary →` 不是在本页切换组件，而是跳转到 `/diagnosis` 并默认聚焦到逐集内容（同一份 `Result JSON`）。

### 4.2 计算分层（性能与可控性）

1. **L1（Deterministic / 规则层）**：纯本地计算（Node/JS），可在浏览器或服务端执行。
   - 词表/正则/计数/密度/窗口截取
   - 建议：在浏览器端用 **Web Worker** 执行（避免主线程卡顿；不改变评分口径）
2. **L2（LLM / 结构识别层）**：小模型批量输出结构化 JSON（温度 0）
   - Hook 类型/强度、Ext/Int 分布、Primary Hook Type、AI highlight、可选的建议文本

> MVP 建议：**L1 在前端执行，L2 走服务端 API route**（避免暴露服务端凭据），并采用“按批次多次调用”规避单次超时。

Web Worker 约定（MVP 推荐）：

- Worker 负责：Episode 解析/预检、tokenizer、窗口构建、L1Stats 计算、阶段聚合
- 主线程负责：loading UI、触发/取消、调用 L2 API、路由跳转与结果存储
- 通信：只传 JSON（避免重复拷贝大文本）；Worker 可按步骤发送 progress 事件（用于 loading 文案与进度条）

---

## 5. 数据流与处理流水线（端到端）

### Step 0：预处理与窗口构建

对每个 Episode 提取：

- `head_500w`：开头 500 words（覆盖开篇规则：Ep1 start/Ep2 start 等）
- `tail_350w`：结尾 350 words（覆盖卡点/Hook）
- `paywall_context`：若本集含 `[PAYWALL]`，截取标记前后各 350 words（通用展示/诊断）

付费点专用窗口（非对称，提升可判定性）：

- `paywall_pre_context_1000t`：`[PAYWALL]` 前文 1000 tokens（用于“前一集精彩度/铺垫充分性”等判断）
- `paywall_post_context_400t`：`[PAYWALL]` 后文 400 tokens（用于“后一集是否立即解答/是否开启新情节”）

跨集 Hook 窗口（防止 cliffhanger 掉到下一集开头）：

- `next_head_100t`：下一集开头 100 tokens（若不存在下一集则为空）
- `hook_context`：`tail_350w + next_head_100t`（用于 Hook 类型/强度判定）

> 窗口单位按“token”（见 12.2.1）：英文 token≈word；中文 token 由 `Intl.Segmenter`（word granularity）提供。窗口大小可配置。

### Step 1：L1 规则层（全量/逐集）

逐集输出（最小集合，支撑 UI + V2）：

- `wordCount`
- `vulgarCount`（V2 3.2 Level1）
- `redFlagHit`（V2 3.2 Level2，一票否决）
- `emotionDensity`（V2 2.3）
- `conflictKeywordCount`（V2 2.4 冲突词表）
- `twistSignalCount`（V2 2.4 反转：twist 邻域 identity 信号）
- `visualHammerCount`（V2 1.5）
- `visualHammerCount_Ep1to3`（V2 1.5 前 3 集密度/占比专用）
- `foreshadowCount`（V2 1.4 紧张感）
- `dialogueRatio`（pacing proxy：引号内 words / total words）
- `plotEventCount`（pacing proxy：discover/reveal/decide/confront 等事件词）

全局输出：

- `totalEpisodesProvided`
- `vulgarPenalty`
- `redFlagVerdict`（命中直接触发“底线否决机制”）

执行建议：

- L1 在 Web Worker 运行；每完成一个阶段/批次向主线程发送 `progress`（例如 `parsing/l1_stats/scoring`）
- Worker 运行环境下需做 feature detect：若 `Intl.Segmenter` 不可用，按 12.2.1 执行 `char-fallback`

### Step 2：L2 结构识别（批量 JSON）

输入：每集 `{ep, head_500w, hook_context}`（若有 paywall 再附上 `paywall_pre_context_1000t` 与 `paywall_post_context_400t`）。

输出（每集）：

```json
{
  "ep": 9,
  "hook": { "type": "Information", "score": 6.2, "label": "Information Hook (Weak)" },
  "emotionLevel": "Medium",
  "conflict": { "ext": 3, "int": 7 },
  "primaryHookType": "Sub-plot Setup",
  "aiHighlight": "Pacing dips slightly. Suggest tightening scenes 12–15.",
  "opening": {
    "maleLead": { "present": false, "visualTags": 0, "personaTags": 0, "confidence": 0.0 },
    "femaleLead": { "present": false, "hasConflict": false, "hasMotivation": false, "confidence": 0.0 }
  },
  "genre": { "label": "Unknown", "isOfficeRomance": false, "confidence": 0.0 },
  "confidence": 0.9
}
```

说明：

- `hook.type` 对齐 V2 Hook 类别（Decision/Crisis/Information/Emotion/None）
- `hook.score` 用于 Episode Matrix、paywall 候选、强弱判断（0–10）
- `primaryHookType` 是 UI 表格字段（结构标签，不参与 V2 计分）
- `aiHighlight` 是 UI 表格与卡片说明（可模板化或由 LLM 生成）
- `opening.*`：用于开篇吸引力的**角色归因**（只对 Ep1–Ep3 有意义；其余集可返回默认值）
- `genre.*`：用于核心推动力的题材修正（只需在 Ep1–Ep3 给出可靠值；其余集可返回默认值）

批量策略：

- `batch_size = 10`（按 N 自动分批）
- `temperature = 0`
- 输出必须是 JSON（建议使用模型的结构化输出能力；并对 “```json ...```” 做容错剥离）

### Step 3：Track A（V2 计分）

- 逐条规则输出 `audit.items[]`（可解释、可追责）
- 汇总得分到 4 大维度：
  - `pay(50) / story(30) / market(20) / potential(10)`

### Step 4：Track B（UI 诊断聚合）

- Episode Matrix 状态（Optimal/Issue/Neutral）
- Analysis Details（Issue 卡片 + Suggestion）
- 图表数据（情绪曲线、Ext/Int 冲突按阶段聚合）

### Step 5：组装 Result JSON → `/result`、`/diagnosis`、`/print`

---

## 6. V2 计分落地（工程实现映射）

> 下表强调：哪些数据来自 L1/L2；哪些需要覆盖条件；哪些进入 UI。

### 6.1 付费维度（50）

| V2 子项 | 覆盖条件 | 数据来源 | MVP 实现要点 |
|---|---|---|---|
| 1.1 开篇吸引力（10） | 至少 2 集（用于 Ep1/Ep2 固定窗口） | L1+L2 | **按 V2 分表锁定为 10 分=男主 5 + 女主 5**。L1 负责计数与证据切片；L2 负责“归因到角色”（避免把反派/路人当主角）。实现：扫描 Ep1–Ep3 的 L2 `opening` 结果，按 V2 时机窗口给分（男主优先 Ep2 `1000 chars`，再看 Ep3；女主以 Ep1 开头窗口为准）。 |
| 1.2 第一付费点（14） | 存在 `[PAYWALL]` 且有前/后集 | L1+L2 | 位置：按 paywall 集号落窗；Hook：优先用 L2 `hook.type` 映射 5/4/3/2/0；前后集吸引力按关键词 |
| 1.2 第二付费点（10） | `TOTAL_EPISODES` 必填 | L1+L2 | 若 `TOTAL_EPISODES < 30`：按 V2 规则第二付费点自动满分；否则必须检测到第二个 `[PAYWALL]`（缺失则该子项记 0 分并给出 warning） |
| 1.3 免费集单集卡点（7） | `TOTAL_EPISODES >= 10`（MVP 预检建议保证） | L1 | 按 V2 抽查 Ep2/4/8/10 集尾；MVP 假设分集完整（缺集属于输入错误） |
| 1.4 看点密度（7） | `TOTAL_EPISODES >= 12`（MVP 预检建议保证） | L1 | 按 V2 规则统计频率/密度（MVP 假设分集完整） |
| 1.5 视觉锤（2） | 至少 1 集 | L1 | 计数+分布（前 3 集占比） |

### 6.2 剧作维度（30）

- 2.1 核心推动力（10）：关系词 vs 职场词占比（L1）+ 题材修正（L2 genre）
  - 若 `genre.isOfficeRomance=true`：职场词（subplot_keywords）计入干扰项时权重减半（或从干扰项中剔除一部分“职业/会议/合同”基础词，具体按配置写死并版本化）
- 2.2 角色辨识度（10）：male/female 标签覆盖（L1）
- 2.3 情绪浓度（6）：情绪词密度（L1）
- 2.4 冲突/反转（4）：冲突词密度（L1）+ 反转信号（L1）

### 6.3 市场维度（20）

- 3.1 爆款对标（5）：
  - MVP：仅实现 A) 机制识别（规则）；B) 数据库验证默认 2/5 或人工输入（不做向量库）
- 3.2 文化禁忌（5）：粗俗词扣分 + 红线否决（L1）
- 3.3 本地化梗（5）：本地化关键词计数（L1）
- 3.4 受众匹配（5）：MVP 用规则映射（genre→受众），输出 warn（可后续用 LLM 提升）

### 6.4 改造潜力（10）

MVP 实现可解释启发式（不做重模型预测）：

- 修复成本（3）：按问题类型映射工时档位（语言/卡点/结构）
- 修复后预期提升（3）：可回收分数（例如粗俗词扣分最多回收 2）
- 内核评估（3）：剧作维度达到阈值（例如 ≥27/30）+ 核心推动力 ≥8 等
- 稀缺性（1）：MVP 走 **A 启发式**（不落库/无数据库也可算），按 `mechanisms[]` 的“组合稀缺度”给 `0/0.5/1`（见 6.4.1）

#### 6.4.1 市场稀缺性（A 启发式，0/0.5/1）

输入：复用 `3.1 A) 自动识别` 的 `mechanisms[]`（机制标签数组），不依赖外部数据库。

定义：

- `categoryCount`：机制覆盖的类别数（identity / relationship / conflict / other），上限 4
- `rarityPoints`：对每个机制按固定表赋权并求和：`COMMON=0`、`MEDIUM=1`、`RARE=2`

固定稀缺度表（MVP 可调，但一旦上线必须版本化）：

- `RARE`：`重生穿越`
- `MEDIUM`：`双重身份`、`隐藏身份`
- `COMMON`：`身份反转`、`契约关系`、`替身替嫁`、`闪婚`、`复仇`、`虐恋`、`打脸`、`逆袭`

计分规则：

- `1.0`：`rarityPoints >= 2` 且 `categoryCount >= 2`
- `0.5`：`rarityPoints >= 1` 且 `categoryCount >= 2`，或 `mechanisms.length >= 3` 且 `categoryCount >= 3`
- `0.0`：其他情况

输出要求：写入 `audit.items[]` 的 `evidence`（列出命中的 mechanisms、rarityPoints、categoryCount），并在 `meta.rulesetVersion` 下可复现。

---

## 7. UI 字段生成规则（对齐两张截图）

### 7.1 顶部：Overall Score（0–100）与 Grade（S/A…）

- `overall_score = overall_100`
- `grade = map(total_110)`
- 说明：若关键标记缺失（例如未检测到 `[PAYWALL]`），在页面顶部以 `warnings[]` 明确提示。

### 7.2 三条维度条（Monetization/Story/Market）

- `monetization_percent = round(pay / 50 * 100)`
- `story_percent = round(story / 30 * 100)`
- `market_percent = round(market / 20 * 100)`

每条附带解释文本（MVP 规则）：

- 从 Track A 审计项中取“扣分最多的 Top 2 原因”拼成 1–2 句模板文案

### 7.3 Emotional Intensity（折线）

- 数据点：`emotion_value_ep = scale(emotionDensity)` → 0–10（或 0–100）
- x 轴：`EP 1..N`（N 自适应）

推荐缩放（英文文本）：

- `emotionDensity` 是百分比（例如 1.2%）
- `emotion_value_ep = clamp( round(emotionDensity / 0.015 * 10, 1), 0, 10 )`

### 7.4 Conflict Frequency（Ext/Int 柱 + 阶段）

1) 每集 Ext/Int：

- 来源优先级：L2 `conflict.ext/int`（0–10）

2) 阶段划分（N 不固定）：

- `Start / Inc / Rise / Climax / Fall / Res`：将 `[1..N]` 均分为 6 段（按索引范围切分）

3) 每阶段聚合：

- `ext_phase = avg(ext of episodes in phase)`
- `int_phase = avg(int of episodes in phase)`

### 7.5 Episode Matrix（Optimal / Issue / Neutral）

定义最小可解释规则（可调参）：

- `hookWeak = (hook.type in [None, Information]) OR (hook.score < 6.5)`
- `conflictLow = conflictKeywordCount < threshold_by_words`（L1）
- `pacingDrag = (dialogueRatio > 0.55) OR (plotEventCount very low)`

输出状态：

- `Optimal`：不命中任何问题
- `Issue Detected`：命中任意一项（并记录 issue types）
- `Neutral/Healthy`：缺数据（L2 confidence 低或输入太短导致无法评估）

### 7.6 Individual Episode Breakdown（表格）

字段与来源：

- `EP #`：重排后的连续 epIndex（保留 `sourceEpisodeNumber` 供 debug）
- `HEALTH`：
  - `GOOD`：Optimal
  - `FAIR`：Issue（轻度）
  - `PEAK`：`hook.score >= 8.5` 且 `emotion_value` 高（或冲突高）
- `PRIMARY HOOK TYPE`：L2 `primaryHookType`（MVP taxonomy）
- `AI HIGHLIGHT`：L2 `aiHighlight`（若 L2 缺失，用模板）

展示约定（对齐截图）：

- `/result` 仅展示表格的前若干行（preview）
- `Episodes 1–N Summary →` 跳转到 `/diagnosis` 查看全量 Episodes 列表与矩阵

### 7.7 Analysis Details（选中某集的卡片）

输出字段对齐截图：

- `Hook Type`：`hook.label`（例如 `Information Hook (Weak)`）
- `Emotion Level`：L2 `emotionLevel`（Low/Medium/High）
- `Conflict Density`：由 L1 `conflictKeywordCount` 映射 Low/Med/High
- `Pacing Score`：0–10（由 `dialogueRatio + plotEventCount` 归一化）
- `AI Suggestion`：
  - MVP 默认模板化（按 issue type 输出）
  - 可选：只对 Top-3 issue 额外调用一次 LLM 生成更贴合上下文的建议

---

## 8. Result JSON（单次分析的最终交付结构）

```json
{
  "meta": {
    "title": "The Last Horizon",
    "evaluationVersion": "AI Assessment v2.x",
    "rulesetVersion": "v2.0.0-mvp.1",
    "language": "en",
    "tokenizer": "whitespace",
    "declaredTotalEpisodes": 50,
    "episodeCount": 50,
    "warnings": ["PAYWALL marker not found: paywall-related rules scored as 0."]
  },
  "score": {
    "total_110": 88,
    "overall_100": 80,
    "grade": "A",
    "breakdown_110": { "pay": 38, "story": 24, "market": 18, "potential": 8 }
  },
  "dashboard": {
    "header": {
      "kicker": "PROJECT ANALYSIS",
      "subtitle": "Evaluation Dashboard: AI Assessment v2.x"
    },
    "gradeCard": {
      "title": "Commercial Adaptability",
      "text": "Projected to rank in the top 15% of genre releases. Strong alignment with current market trends for sci-fi drama."
    },
    "dimensionBars": {
      "monetization": { "label": "Monetization Power", "percent": 76, "text": "Primary paywall marker missing; monetization score may be underestimated." },
      "story": { "label": "Story Structure Quality", "percent": 80, "text": "Emotional intensity is strong; conflict density dips in mid section." },
      "market": { "label": "Market Compatibility", "percent": 90, "text": "No redline content detected; vulgarity penalty is low." }
    },
    "charts": {
      "emotionalIntensity": [{ "ep": 1, "value": 3.2 }],
      "conflictFrequency": [{ "phase": "Start", "ext": 2.1, "int": 5.4 }]
    },
    "episodeMatrix": [{ "ep": 9, "status": "issue", "issues": ["STRUCTURAL_WEAKNESS"] }],
    "episodeTable": [
      { "ep": 1, "health": "GOOD", "primaryHookType": "Inciting Incident", "aiHighlight": "Strong opening hook..." }
    ]
  },
  "diagnosis": {
    "selectedEpisode": 9,
    "integrityChecks": [
      {
        "title": "Structural Integrity Check",
        "text": "Episodes 1-5 and 7-8 follow the Hero's Journey archetype closely."
      }
    ],
    "issues": [
      {
        "ep": 9,
        "type": "STRUCTURAL_WEAKNESS",
        "severity": "yellow",
        "hookType": "Information",
        "hookLabel": "Information Hook (Weak)",
        "emotionLevel": "Medium",
        "conflictDensity": "LOW",
        "pacingScore": 6.2,
        "suggestion": "Consider upgrading to a Decision-Based Cliffhanger."
      }
    ]
  },
  "audit": {
    "items": [
      { "id": "pay.opening.ml_entry", "status": "ok", "score": 3, "max": 5, "reason": "ML described in EP2 with 1 visual tag + 1 persona tag." },
      { "id": "pay.paywall.primary", "status": "warn", "score": 0, "max": 14, "reason": "No [PAYWALL] marker found; primary paywall scoring is forced to 0." }
    ]
  }
}
```

> 注：为便于阅读，上例对 `dashboard.charts.*`、`dashboard.episodeMatrix[]`、`dashboard.episodeTable[]` 做了缩略。
> 实际交付必须是 **1..N 全量**：
> - `dashboard.charts.emotionalIntensity`：每集 1 个点
> - `dashboard.episodeMatrix`：每集 1 个格子（用于 `/diagnosis` 的矩阵）
> - `dashboard.episodeTable`：每集 1 行（用于 `/diagnosis` 的 Episodes 1–N Summary 全量表格）

---

## 9. PDF 导出（MVP：打印视图）

- `/print` 使用同一份 `Result JSON` 渲染（避免二次计算）
- 推荐分页：
  - 第 1 页：标题 + overall + grade + 三条 bar
  - 第 2 页：两张图（情绪/冲突）
  - 第 3 页：Episode 表格（前 N 行）+ Top Issues（最多 5 条）
- `@media print` 隐藏按钮与交互组件
- 点击 Export PDF：跳转 `/print` → `window.print()`

---

## 10. 失败模式与降级策略（保证“不会出错”）

- Episode 解析失败（无 Episode 头）：
  - MVP 推荐直接报错（要求作者补齐 Episode 标题），而不是自动切分
- Paywall 缺失：
  - 不报错；相关付费点子项按 V2 记 0 分，并在 `audit.items[]` 标记 `warn`
- L2（LLM）失败或返回非 JSON：
  - 该 batch `confidence=0`
  - Track B：Episode Matrix 该段标记 `Neutral`
  - Track A：涉及 L2 的子项置 `warn`，并回退到 L1 关键词近似（若仍无法判定则记 0 分）
  - 结果页仍能渲染（避免整单崩）

---

## 11. MVP 实施清单（工程拆解）

1) `EpisodeParser` + `PaywallLocator` + `WindowBuilder`
2) `L1Stats`（词表配置化：V2 keywords）
3) `L2BatchAnalyzer`（hook/conflict/primaryHook/aiHighlight）
4) `V2ScoringEngine`（Track A：0–110 + audit items）
5) `UIDiagnostics`（Track B：matrix/issue/pacing）
6) `Result/Diagnosis/Print` 三个页面渲染同一份 `Result JSON`

---

## 12. 口径锁定（避免“看起来一致、算出来不一致”）

> 这一节的目标：把所有“可能产生歧义”的点写死。实现时必须严格按本节执行。

### 12.1 文本规范化（所有计数都先做）

- 换行：把 `\r\n` 与 `\r` 统一成 `\n`
- 大小写：所有关键词匹配默认 `case-insensitive`
- 空白：连续空白折叠为单个空格（用于 word 计数稳定）

### 12.2 计量单位（chars vs words）

- `chars`：按 JS 字符串长度（UTF-16 code units）
- `words`：在本系统中等价于 `tokens`（见 12.2.1），用于窗口与密度类规则的分母

#### 12.2.1 Tokenizer（EN/ZH）

为保证中文输入可用且可复现，所有 `words` 相关规则都必须通过统一的 tokenizer 得到 `tokens[]`。

- `language=en`：
  - `tokens`：对规范化后的文本按空白分割（`/\s+/`），过滤空 token
  - 关键词匹配：默认 `case-insensitive`；**禁止子串 count**。英文单词类关键词必须使用 token 精确匹配或正则单词边界（例如 `\bkill\b`、`\bass\b`），避免 `ass` 命中 `class`。
- `language=zh`：
  - `tokens`：使用 `Intl.Segmenter('zh-CN', { granularity: 'word' })` 分词，取 `isWordLike=true` 的片段
  - 关键词匹配：中文优先 token 精确匹配；确需“包含匹配”的关键词必须在配置里显式标注 `matchMode=substring`，并在 `audit.items[].evidence` 记录命中词与片段

可选增强（非 MVP 硬依赖）：

- POS Tagging（词性标注）：用于区分 `kill` 的动词/名词用法、减少误报。
  - MVP 默认不启用（引入依赖与一致性风险较高）
  - 若启用：建议在服务端 L1 增强层使用轻量 JS NLP（例如 `compromise`）并固定版本；输出必须进入 `audit.items[].evidence` 以便追溯

兜底：

- 若运行环境不支持 `Intl.Segmenter`，则 `language=zh` 回退为 `chars` 近似（以 Unicode 字符数组作为 token），并在 `meta.warnings[]` 标记 tokenizer 降级（分数口径仍保持可复现）

#### 12.2.2 language 记录

- 每次分析必须在 `Result JSON meta` 里记录：
  - `meta.language`：`en|zh`（MVP 不建议 `auto`，避免环境差异导致口径漂移）
  - `meta.tokenizer`：`whitespace|intl-segmenter|char-fallback`

规则口径：

- 若 V2 明确写了 `1000 chars`（例如 Ep2 开头窗口），则该条规则用 `chars`
- 其余窗口默认用 `words/tokens`（例如 `head_500w`、`tail_350w`、`paywall_context`）

> 注意：不要把 `1000 chars` 偷换成 `N words`。如果确实要换算，必须在规则清单里写明换算因子并固定。

### 12.3 窗口定义（必须一致）

- `head_500w`：Episode 文本开头 500 tokens
- `tail_350w`：Episode 文本结尾 350 tokens
- `paywall_context`：以 `[PAYWALL]` 为中心，向前/向后各 350 tokens；若 `[PAYWALL]` 位于边界则截断

付费点专用窗口（非对称）：

- `paywall_pre_context_1000t`：`[PAYWALL]` 前 1000 tokens
- `paywall_post_context_400t`：`[PAYWALL]` 后 400 tokens

跨集 Hook 窗口：

- `next_head_100t`：下一集开头 100 tokens
- `hook_context`：`tail_350w + next_head_100t`

> 注意：token 的定义取决于 `meta.language` 与 tokenizer（12.2.1）。

### 12.4 关键词库与阈值版本（可追溯）

实现要求：

- 所有关键词库/阈值/窗口大小必须“配置化”，禁止散落在代码里
- 每次分析的结果必须记录配置版本，用于复现实验

建议字段（写入 `Result JSON`）：

- `meta.rulesetVersion`：例如 `v2.0.0-mvp.1`
- `meta.language`：`en|zh`
- `meta.tokenizer`：`whitespace|intl-segmenter|char-fallback`
- `meta.windowPolicy`：例如 `{ headWords: 500, tailWords: 350, paywallContextWords: 350, ep2OpenChars: 1000 }`

> 中文模式下，`windowPolicy.*Words` 仍表示 token 数量（不是“中文空格词”）。

### 12.5 缺数据与降级矩阵（统一处理）

原则：

- 违反输入契约（缺集/重复集/超 2 个 paywall 等）= 直接报错，不进入评分
- 满足契约但缺少某个“可选标记/可选能力”（例如缺 `[PAYWALL]` 或 L2 失败）= 允许出结果，但必须明确 `warnings[]` + `audit.items[].status=warn`

统一规则：

- 缺 `[PAYWALL]`：所有依赖 paywall 的子项（例如第一/第二付费点）强制记 0 分，并写明 reason
- L2 批处理失败或输出非 JSON：该批次 episodes `confidence=0`
  - Track B：这些 episodes 的 matrix 标记 `Neutral`
  - Track A：仅对“必须依赖 L2 的子项”降级为 `warn`；若存在 L1 近似回退则用 L1，否则记 0

L2 置信度阈值（MVP 写死）：

- `CONFIDENCE_MIN = 0.7`
- 若某集 `confidence < CONFIDENCE_MIN`：视为该集 L2 数据不可用，按“L2 失败”同等降级处理（matrix=Neutral；相关子项 warn + fallback/0）

> 重要：哪些子项“允许 L1 回退”、哪些子项“必须记 0”，必须在 `audit item` 清单里逐条写死。

### 12.6 红线一票否决（最终展示口径）

定义：

- `redFlagHit=true` 表示命中文化禁忌 Level 2（红线），触发“底线否决机制”

最终覆盖逻辑（必须写死）：

- 仍然计算 `total_110` 与 `overall_100`（用于内部分析与 debug）
- Track A 计分口径：
  - 市场维度 `3.2 文化禁忌（5）`：命中 Level 2 时该子项记 `0/5`，并在 `audit.items[]` 写明命中证据（这等价于“直接 -5 分”）
- 但对外展示强制执行：
  - `grade = C`
  - `overall_100 = min(overall_100, 69)`（保证不会显示为 A/B 等）
  - `meta.warnings[]` 追加一条明确提示（例如 `Redline content detected: final grade forced to C.`）
