# V2 评分体系落地方案

> **规则基准**: 本方案严格遵循 [`V2_RULESET_FREEZE.md`](./V2_RULESET_FREEZE.md) (`v2.1.0-freeze-nodb`)
> **实现方式**: 将"关键词计数"升级为"L1 确定性规则 + L2 AI 结构化评分"

## 〇、规则基准引用

本文档的所有评分逻辑必须与 `V2_RULESET_FREEZE.md` 保持一致。如有冲突，以冻结文档为准。

| 文档 | 职责 |
|------|------|
| `V2_RULESET_FREEZE.md` | 评分规则的唯一真相源（分档、阈值、边界处理） |
| `V2_IMPLEMENTATION_PLAN.md` | 工程实现方案（架构、Prompt、Schema、代码） |

### 关键冻结决议速查

| 决议 | 内容 |
|------|------|
| 开篇吸引力 | `10分 = 男主5 + 女主5`，核心矛盾/风格改为诊断项 |
| 第二付费点 | `<30集` 自动满分，无 Escalation 时 Hook 上限 `1分` |
| 文化禁忌 | L1 单点裁决，L2 不重复检测 |
| 爆款对标 | 无数据库时纯机制识别 |
| 市场稀缺性 | 无数据库时固定 `0.5分`，标记 `N/A` |
| 单集卡点归一化 | `(raw_sum / available_count) * 4`，上限 7 |

---

## 一、总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户输入 (完整分集稿)                       │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     L0: 预检 (Web Worker)                        │
│  - 解析 Episode 头                                               │
│  - 校验完整性 (TOTAL_EPISODES / IS_COMPLETED / 缺集 / 重复)        │
│  - 定位 [PAYWALL] 标记                                           │
│  - 检测语言 (en/zh)                                              │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     L1: 切片与基础统计 (Web Worker)                │
│  - 构建窗口 (head_500w / tail_350w / paywall_context 等)          │
│  - 计算 tokenCount / wordCount                                   │
│  - 计算粗俗词/红线词命中 (文化禁忌 L1 部分)                          │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     L2: AI 结构化评分 (按维度分批调用)              │
│  - 付费维度 (50分): 3-4 次调用                                    │
│  - 剧作维度 (30分): 1 次调用                                      │
│  - 市场维度 (20分): 1 次调用（无数据库模式）                        │
│  - 改造潜力 (10分): 1 次调用 (依赖前三个维度结果)                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     聚合: 分数汇总与报告生成                        │
│  - total_110 → overall_100 → grade                              │
│  - 生成 audit.items[]                                           │
│  - 生成 dashboard / diagnosis 数据                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、评分体系速查

> 完整分档规则见 [`V2_RULESET_FREEZE.md`](./V2_RULESET_FREEZE.md) 第 2-8 节。

| 维度 | 满分 | 子项 |
|------|------|------|
| **付费维度** | 50 | 开篇吸引力(10) + 第一付费点(14) + 第二付费点(10) + 单集卡点(7) + 看点密度(7) + 视觉锤(2) |
| **剧作维度** | 30 | 核心推动力(10) + 角色辨识度(10) + 情绪浓度(6) + 冲突/反转(4) |
| **市场维度** | 20 | 爆款对标(5) + 文化禁忌(5) + 本地化梗(5) + 受众匹配(5) |
| **改造潜力** | 10 | 修复成本(3) + 预期提升(3) + 故事内核(3) + 稀缺性(1) |
| **总分** | 110 | → `overall100 = round(total110 / 110 * 100)` |

### Grade 映射

| Grade | 条件 (total110) |
|-------|-----------------|
| S+ | >= 101 |
| S | >= 91 |
| A+ | >= 86 |
| A | >= 81 |
| B | >= 70 |
| C | < 70 |

---

## 三、L2 调用规划

### 3.1 调用清单

| 调用 ID | 评估内容 | 输入窗口 | 覆盖 V2 子项 | 预估 tokens |
|---------|----------|----------|--------------|-------------|
| `L2_OPENING` | 开篇吸引力 | Ep1-3 head_500w | 1.1 (10分) | ~1500 |
| `L2_PAYWALL_1` | 第一付费点 | paywall 前后集窗口 | 1.2 前半 (14分) | ~2000 |
| `L2_PAYWALL_2` | 第二付费点 | 第二个 paywall 窗口 | 1.2 后半 (10分) | ~2000 |
| `L2_HOOKS` | 单集卡点 + 看点密度 + 视觉锤 | Ep2/4/8/10 tail + 全局统计 | 1.3 + 1.4 + 1.5 (16分) | ~2000 |
| `L2_STORY` | 剧作维度 | 全剧采样片段 + L1 统计 | 2.1-2.4 (30分) | ~2500 |
| `L2_MARKET` | 市场维度 | 全剧采样 + mechanism 识别 | 3.1-3.4 (20分) | ~2000 |
| `L2_POTENTIAL` | 改造潜力 | 前三维度结果 + 问题清单 | 4.1-4.4 (10分) | ~1000 |

**总计：7 次 AI 调用，约 13000 tokens 输入**

### 3.2 调用依赖关系

```
L2_OPENING ──┐
L2_PAYWALL_1 ├──→ L2_POTENTIAL
L2_PAYWALL_2 │
L2_HOOKS ────┤
L2_STORY ────┤
L2_MARKET ───┘
```

前 6 个调用可并行，`L2_POTENTIAL` 需要等待前 6 个完成。

---

## 四、各调用详细设计

### 4.1 L2_OPENING: 开篇吸引力 (10分)

#### 输入结构

```typescript
interface OpeningInput {
  ep1_head_500w: string
  ep2_head_500w: string
  ep2_head_1000chars: string // V2 明确要求 1000 字符
  ep3_head_500w: string
  language: 'en' | 'zh'
}
```

#### Prompt 模板

```
你是短剧剧本评估专家。请严格按照以下评分标准评估开篇吸引力。

## 评分标准

### 男主帅气出场（满分 5 分）
| 得分 | 条件 |
|------|------|
| 5分 | Episode 2 开头 1000 字符内出现，视觉标签≥2 + 人设标签≥1 |
| 3分 | Episode 2-3 出现，视觉或人设标签任一 |
| 1分 | Episode 3 之后出现，仅有名字 |
| 0分 | 前 3 集未出场 |

视觉标签：CEO、总裁、suit、abs、chest、handsome、帅、高大、性感、muscular、英俊
人设标签：mature、composed、devoted、cold、gentle、深情、负责、霸道、温柔、占有欲、成熟

### 女主带故事出场（满分 5 分）
| 得分 | 条件 |
|------|------|
| 5分 | Episode 1 开场即 conflict + 动机清晰 |
| 3分 | 有 conflict 但动机模糊 |
| 1分 | 静态介绍式出场 |
| 0分 | 无故事性 |

conflict 关键词：betray、设计、陷害、drug、下药、trap、危险、scheme、plot、deceive、欺骗
motivation 关键词：because、for、为了、想要、plan、计划、need、必须、goal、目标

## 待评估文本

### Episode 1 开头
${ep1_head_500w}

### Episode 2 开头 (1000 字符)
${ep2_head_1000chars}

### Episode 3 开头
${ep3_head_500w}

请输出结构化评分结果。
```

#### 输出 Schema

```typescript
const OpeningAssessmentSchema = z.object({
  maleLead: z.object({
    score: z.number().min(0).max(5),
    appearsInEpisode: z.number().nullable().describe('首次出场集数，null 表示未出场'),
    visualTagsFound: z.array(z.string()).describe('检测到的视觉标签'),
    personaTagsFound: z.array(z.string()).describe('检测到的人设标签'),
    reasoning: z.string().describe('评分理由'),
  }),
  femaleLead: z.object({
    score: z.number().min(0).max(5),
    hasConflict: z.boolean(),
    hasMotivation: z.boolean(),
    conflictEvidence: z.string().nullable().describe('冲突证据原文'),
    motivationEvidence: z.string().nullable().describe('动机证据原文'),
    reasoning: z.string(),
  }),
})
```

#### 分数映射

```typescript
function mapOpeningScore(output: OpeningAssessment): AuditItem[] {
  return [
    {
      id: 'pay.opening.male_lead',
      status: output.maleLead.score >= 3 ? 'ok' : 'warn',
      score: output.maleLead.score,
      max: 5,
      reason: output.maleLead.reasoning,
      evidence: output.maleLead.visualTagsFound.concat(output.maleLead.personaTagsFound),
    },
    {
      id: 'pay.opening.female_lead',
      status: output.femaleLead.score >= 3 ? 'ok' : 'warn',
      score: output.femaleLead.score,
      max: 5,
      reason: output.femaleLead.reasoning,
      evidence: [output.femaleLead.conflictEvidence, output.femaleLead.motivationEvidence].filter(Boolean),
    },
  ]
}
```

---

### 4.2 L2_PAYWALL_1: 第一付费点 (14分)

#### 输入结构

```typescript
interface Paywall1Input {
  paywallEpisode: number
  totalEpisodes: number
  prevEpisode_tail_500w: string // 前一集结尾
  prevEpisode_full: string // 前一集全文（用于情节密度检测）
  paywall_pre_1000t: string // PAYWALL 前 1000 tokens
  paywall_post_400t: string // PAYWALL 后 400 tokens
  nextEpisode_head_500w: string // 后一集开头
}
```

#### Prompt 模板

```
你是短剧剧本评估专家。请严格按照以下评分标准评估第一付费点。

## 评分标准

### 步骤 1: 位置检测（满分 2 分）
合理区间（含 ±2 集容差）：
- Episode 6-7（早期付费）→ 实际范围 4-9
- Episode 10-12（中期付费）→ 实际范围 8-14
- Episode 13-15（中后期付费）→ 实际范围 11-17

| 得分 | 条件 |
|------|------|
| 2分 | PAYWALL 在任一区间内 |
| 0分 | PAYWALL 偏离所有区间 |

当前 PAYWALL 位置：Episode ${paywallEpisode}
总集数：${totalEpisodes}

### 步骤 2: 前一集精彩度（满分 4 分）
| 得分 | 条件 |
|------|------|
| 4分 | 情节密度 + 情绪高潮 + 悬念铺垫 三项全满 |
| 3分 | 满足 2 项 |
| 2分 | 满足 1 项 |
| 0分 | 都不满足 |

检测标准：
- 情节密度：discover/reveal/expose/decide/confront/发现/揭露/决定/对峙 等词 ≥2
- 情绪高潮：cry/scream/shocked/furious/breakdown/哭/尖叫/震惊/愤怒/崩溃 等词 ≥2
- 悬念铺垫：soon/tomorrow/will/plan/V.O./即将/明天/将要/计划/内心 等词 ≥2

### 步骤 3: Hook 强度（满分 5 分）
| 得分 | Hook 类型 | 特征 |
|------|-----------|------|
| 5分 | 决策型 | A or B？影响主线的重大选择 |
| 4分 | 危机型 | 生死攸关、身体危险 |
| 3分 | 信息型 | 真相是什么？身份揭露 |
| 2分 | 情感型 | 他会回来吗？关系悬念 |
| 0分 | 无 Hook | 平淡结尾 |

决策型关键词：choose/decide/must/either/or/选择/决定/必须/要么/还是
危机型关键词：danger/life or death/attack/threaten/knife/gun/危险/生死/攻击/威胁/刀/枪
信息型关键词：who/what/secret/truth/identity/really/是谁/真相/秘密/身份/到底
情感型关键词：will he/can she/would/could/会不会/能否/是否/会吗

### 步骤 4: 后一集吸引力（满分 3 分）
| 得分 | 条件 |
|------|------|
| 3分 | 立即解答 + 新情节 + 新 Hook 三项全满 |
| 2分 | 满足 2 项 |
| 1分 | 满足 1 项 |
| 0分 | 都不满足 |

- 立即解答：reveal/announce/finally/truth is/揭露/公开/终于/真相是/原来
- 新情节：shocked/unexpected/suddenly/then/震惊/没想到/突然/接着
- 新 Hook：but/however/what if/now/但是/然而/如果/现在/不过

## 待评估文本

### 前一集 (Episode ${paywallEpisode - 1}) 全文
${prevEpisode_full}

### PAYWALL 前 1000 tokens
${paywall_pre_1000t}

### PAYWALL 后 400 tokens
${paywall_post_400t}

### 后一集 (Episode ${paywallEpisode + 1}) 开头 500 words
${nextEpisode_head_500w}

请输出结构化评分结果。
```

#### 输出 Schema

```typescript
const Paywall1AssessmentSchema = z.object({
  position: z.object({
    score: z.number().min(0).max(2),
    episode: z.number(),
    validRange: z.string().nullable().describe('命中的区间，如 "10-12"，null 表示未命中'),
    reasoning: z.string(),
  }),
  previousEpisode: z.object({
    score: z.number().min(0).max(4),
    hasPlotDensity: z.boolean(),
    hasEmotionalPeak: z.boolean(),
    hasForeshadowing: z.boolean(),
    plotEvidence: z.array(z.string()),
    emotionEvidence: z.array(z.string()),
    foreshadowEvidence: z.array(z.string()),
    reasoning: z.string(),
  }),
  hookStrength: z.object({
    score: z.number().min(0).max(5),
    hookType: z.enum(['decision', 'crisis', 'information', 'emotion', 'none']),
    hookEvidence: z.string().describe('Hook 原文片段'),
    reasoning: z.string(),
  }),
  nextEpisode: z.object({
    score: z.number().min(0).max(3),
    hasImmediateAnswer: z.boolean(),
    hasNewPlot: z.boolean(),
    hasNewHook: z.boolean(),
    reasoning: z.string(),
  }),
})
```

---

### 4.3 L2_PAYWALL_2: 第二付费点 (10分)

#### 特殊逻辑

```typescript
function shouldEvaluatePaywall2(totalEpisodes: number, paywallCount: number): boolean {
  // V2 规则：<30 集自动满分，不需要 AI 评估
  if (totalEpisodes < 30)
    return false
  // 必须有第二个 PAYWALL 才需要评估
  if (paywallCount < 2)
    return false
  return true
}

function getPaywall2Score(
  totalEpisodes: number,
  paywallCount: number,
  aiResult?: Paywall2Assessment
): AuditItem[] {
  // <30 集：自动满分，拆分为 4 个子项
  if (totalEpisodes < 30) {
    return [
      { id: 'pay.paywall.secondary.position', status: 'ok', score: 2, max: 2, reason: 'TOTAL_EPISODES < 30，自动满分', evidence: [] },
      { id: 'pay.paywall.secondary.previous', status: 'ok', score: 3, max: 3, reason: 'TOTAL_EPISODES < 30，自动满分', evidence: [] },
      { id: 'pay.paywall.secondary.hook', status: 'ok', score: 3, max: 3, reason: 'TOTAL_EPISODES < 30，自动满分', evidence: [] },
      { id: 'pay.paywall.secondary.next', status: 'ok', score: 2, max: 2, reason: 'TOTAL_EPISODES < 30，自动满分', evidence: [] },
    ]
  }

  // ≥30 集但没有第二个 PAYWALL：0 分，拆分为 4 个子项
  if (paywallCount < 2) {
    return [
      { id: 'pay.paywall.secondary.position', status: 'warn', score: 0, max: 2, reason: '总集数 ≥30 但未检测到第二个 [PAYWALL]', evidence: [] },
      { id: 'pay.paywall.secondary.previous', status: 'warn', score: 0, max: 3, reason: '总集数 ≥30 但未检测到第二个 [PAYWALL]', evidence: [] },
      { id: 'pay.paywall.secondary.hook', status: 'warn', score: 0, max: 3, reason: '总集数 ≥30 但未检测到第二个 [PAYWALL]', evidence: [] },
      { id: 'pay.paywall.secondary.next', status: 'warn', score: 0, max: 2, reason: '总集数 ≥30 但未检测到第二个 [PAYWALL]', evidence: [] },
    ]
  }

  // 有第二个 PAYWALL：使用 AI 评分结果
  return mapPaywall2Score(aiResult!)
}
```

#### 第二付费点位置区间 (V2 原版)

| 剧本长度 | 第二付费点位置 |
|----------|----------------|
| 30-50集 | Episode 20-25 |
| 51-70集 | Episode 30-40 |
| 71-100集 | Episode 50-60 |

#### 输出 Schema

```typescript
const Paywall2AssessmentSchema = z.object({
  position: z.object({
    score: z.number().min(0).max(2),
    episode: z.number(),
    validRange: z.string().nullable(),
    reasoning: z.string(),
  }),
  previousEpisode: z.object({
    score: z.number().min(0).max(3), // 第二付费点是 3 分
    hasPlotDensity: z.boolean(),
    hasEmotionalPeak: z.boolean(),
    hasForeshadowing: z.boolean(),
    reasoning: z.string(),
  }),
  hookStrength: z.object({
    score: z.number().min(0).max(3), // 第二付费点是 3 分
    hookType: z.enum(['decision', 'crisis', 'information', 'emotion', 'none']),
    hasEscalation: z.boolean().describe('赌注是否比第一付费点升级'),
    escalationEvidence: z.string().nullable(),
    reasoning: z.string(),
  }),
  nextEpisode: z.object({
    score: z.number().min(0).max(2), // 第二付费点是 2 分
    hasImmediateAnswer: z.boolean(),
    hasNewPlot: z.boolean(),
    hasNewHook: z.boolean(),
    reasoning: z.string(),
  }),
})
```

#### Escalation 检测关键词 (V2 原版)

```typescript
const escalationKeywords = {
  en: ['life', 'everything', 'forever', 'lose all', 'no turning back', 'final', 'ultimate'],
  zh: ['生命', '一切', '永远', '失去所有', '没有退路', '最后', '终极'],
}
```

#### Escalation 上限逻辑

```typescript
function mapPaywall2HookScore(aiResult: Paywall2Assessment): number {
  const rawScore = aiResult.hookStrength.score
  const hasEscalation = aiResult.hookStrength.hasEscalation

  // V2 冻结规则：无 Escalation 时 Hook 上限 1 分
  if (!hasEscalation) {
    return Math.min(rawScore, 1)
  }
  return rawScore
}
```

#### 第二付费点完整映射

```typescript
function mapPaywall2Score(aiResult: Paywall2Assessment): AuditItem[] {
  return [
    {
      id: 'pay.paywall.secondary.position',
      status: aiResult.position.score >= 1 ? 'ok' : 'warn',
      score: aiResult.position.score,
      max: 2,
      reason: aiResult.position.reasoning,
      evidence: aiResult.position.validRange ? [aiResult.position.validRange] : [],
    },
    {
      id: 'pay.paywall.secondary.previous',
      status: aiResult.previousEpisode.score >= 2 ? 'ok' : 'warn',
      score: aiResult.previousEpisode.score,
      max: 3,
      reason: aiResult.previousEpisode.reasoning,
      evidence: [],
    },
    {
      id: 'pay.paywall.secondary.hook',
      status: mapPaywall2HookScore(aiResult) >= 2 ? 'ok' : 'warn',
      score: mapPaywall2HookScore(aiResult), // 应用 Escalation 上限
      max: 3,
      reason: aiResult.hookStrength.reasoning,
      evidence: aiResult.hookStrength.escalationEvidence ? [aiResult.hookStrength.escalationEvidence] : [],
    },
    {
      id: 'pay.paywall.secondary.next',
      status: aiResult.nextEpisode.score >= 1 ? 'ok' : 'warn',
      score: aiResult.nextEpisode.score,
      max: 2,
      reason: aiResult.nextEpisode.reasoning,
      evidence: [],
    },
  ]
}
```

---

### 4.4 L2_HOOKS: 单集卡点 + 看点密度 + 视觉锤 (16分)

#### 输入结构

```typescript
interface HooksInput {
  // 1.3 单集卡点：抽查 Ep2/4/8/10 结尾 200 字符
  ep2_tail_200chars: string
  ep4_tail_200chars: string
  ep8_tail_200chars: string
  ep10_tail_200chars: string

  // 1.4 看点密度：前 12 集相关数据
  first12Episodes_combined: string // 前 12 集合并文本（用于 drama 事件检测）
  first5Episodes_combined: string // 前 5 集合并文本（用于动机清晰度）
  fullScript_foreshadowCount: number // L1 预计算的伏笔词总数

  // 1.5 视觉锤
  first12_visualHammerCount: number // L1 预计算
  first3_visualHammerCount: number // L1 预计算
  first3_ratio_percent: number // L1 预计算：first12=0 时为 0，否则 Math.round(first3/first12*100)

  // 元数据
  totalEpisodes: number
}
```

#### Prompt 模板

```
你是短剧剧本评估专家。请严格按照以下评分标准评估单集卡点、看点密度和视觉锤。

## 一、单集卡点（满分 7 分）

抽查 Episode 2, 4, 8, 10 的结尾，每集最高 1.75 分。

| 得分 | 条件 |
|------|------|
| 1.75分 | 有悬念 + 有可预测线索 |
| 1分 | 仅悬念或仅线索 |
| 0分 | 无卡点 |

悬念词：what/who/why/shocked/stunned/freeze/什么/谁/震惊/呆住/怎么
可预测线索词：will/soon/next/tomorrow/plan to/将要/即将/明天/下次/打算

### Episode 2 结尾
${ep2_tail_200chars}

### Episode 4 结尾
${ep4_tail_200chars}

### Episode 8 结尾
${ep8_tail_200chars}

### Episode 10 结尾
${ep10_tail_200chars}

## 二、看点密度（满分 7 分）

### 2.1 Drama 事件频率（满分 2.5 分）
检测前 12 集的生死级事件密度。

生死级事件词：kill/death/die/死/杀/生死/betray/背叛/drug/poison/attack/下药/中毒/袭击/kidnap/accident/绑架/事故/车祸/miscarry/流产/expose/揭露/曝光

| 得分 | 条件 |
|------|------|
| 2.5分 | 事件数 >= 6 |
| 1.5分 | 事件数 >= 4 |
| 1分 | 事件数 >= 3 |
| 0分 | 事件数 < 3 |

### 2.2 动机清晰度（满分 2 分）
检测前 5 集的主角和反派动机。

| 得分 | 条件 |
|------|------|
| 2分 | 主角动机清晰 + 反派动机清晰 |
| 1分 | 仅主角动机清晰 |
| 0分 | 都不清晰 |

动机词：because/for/want/need/goal/plan/must/因为/为了/想要/需要/目标/计划/必须/revenge/protect/love/复仇/保护/爱

### 2.3 "大事将至"紧张感（满分 2.5 分）
全剧伏笔词密度。

伏笔词：soon/will/going to/plan/next/即将/将要/准备/计划/下一步/V.O./thinking/wonder/内心/想到/思考

当前统计：全剧伏笔词 ${fullScript_foreshadowCount} 次，共 ${totalEpisodes} 集

| 得分 | 条件 |
|------|------|
| 2.5分 | 平均每集 ≥2 次 |
| 1.5分 | 平均每集 ≥1 次 |
| 0分 | 平均每集 <1 次 |

### 前 12 集文本（用于 Drama 事件检测）
${first12Episodes_combined}

### 前 5 集文本（用于动机清晰度检测）
${first5Episodes_combined}

## 三、视觉锤（满分 2 分）

视觉锤场景：slap/打脸/扇、kiss/吻/亲、punch/kick/打/踢/揍、pour water/splash/泼水/泼酒、kneel/kowtow/下跪/跪、propose/marry me/求婚/嫁给我、reveal identity/expose/揭露身份/曝光、luxury car/convoy/bodyguard/豪车/车队/保镖

当前统计（L1 预计算）：
- 前 12 集视觉锤场景：${first12_visualHammerCount} 个
- 前 3 集视觉锤场景：${first3_visualHammerCount} 个
- 前 3 集占比：${first3_ratio_percent}%（L1 预计算，first12=0 时为 0）

| 得分 | 条件 |
|------|------|
| 2分 | 总数 ≥5 且前 3 集占比 ≤50%（分布均匀）|
| 1.5分 | 总数 ≥3 |
| 1分 | 总数 ≥1 |
| 0分 | 总数 = 0 |

请输出结构化评分结果。
```

#### 输出 Schema

```typescript
const HooksAssessmentSchema = z.object({
  // 1.3 单集卡点 (7分)
  episodicHooks: z.object({
    ep2: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    ep4: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    ep8: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    ep10: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    totalScore: z.number().min(0).max(7),
    reasoning: z.string(),
  }),

  // 1.4 看点密度 (7分)
  density: z.object({
    dramaEvents: z.object({
      score: z.number().min(0).max(2.5),
      count: z.number(),
      events: z.array(z.string()).describe('检测到的事件列表'),
      reasoning: z.string(),
    }),
    motivationClarity: z.object({
      score: z.number().min(0).max(2),
      protagonistClear: z.boolean(),
      antagonistClear: z.boolean(),
      protagonistMotivation: z.string().nullable(),
      antagonistMotivation: z.string().nullable(),
      reasoning: z.string(),
    }),
    foreshadowing: z.object({
      score: z.number().min(0).max(2.5),
      avgPerEpisode: z.number(),
      reasoning: z.string(),
    }),
    totalScore: z.number().min(0).max(7),
  }),

  // 1.5 视觉锤 (2分)
  visualHammer: z.object({
    score: z.number().min(0).max(2),
    totalScenes: z.number(),
    first3Scenes: z.number(),
    isBalanced: z.boolean(),
    reasoning: z.string(),
  }),
})
```

#### 单集卡点归一化映射

```typescript
// 参考 V2_RULESET_FREEZE.md 第 5.3 节
function mapEpisodicHooksScore(aiResult: HooksAssessment, totalEpisodes: number): AuditItem {
  const episodes = [
    { ep: 2, data: aiResult.episodicHooks.ep2 },
    { ep: 4, data: aiResult.episodicHooks.ep4 },
    { ep: 8, data: aiResult.episodicHooks.ep8 },
    { ep: 10, data: aiResult.episodicHooks.ep10 },
  ]

  // 过滤出可用的抽查集（集号 <= totalEpisodes）
  const available = episodes.filter(e => e.ep <= totalEpisodes)
  const availableCount = available.length

  if (availableCount === 0) {
    return {
      id: 'pay.hooks.episodic',
      status: 'warn',
      score: 0,
      max: 7,
      reason: '无可用抽查集',
      evidence: [],
      confidenceFlag: 'low_sample',
    }
  }

  // 计算原始得分之和
  const rawSum = available.reduce((sum, e) => sum + e.data.score, 0)

  // 归一化公式：(raw_sum / available_count) * 4，上限 7
  const normalized = (rawSum / availableCount) * 4
  const finalScore = Math.min(normalized, 7)

  return {
    id: 'pay.hooks.episodic',
    status: finalScore >= 4 ? 'ok' : 'warn',
    score: finalScore,
    max: 7,
    reason: `抽查 ${availableCount} 集，原始得分 ${rawSum}，归一化后 ${finalScore.toFixed(2)}`,
    evidence: available.map(e => e.data.evidence).filter(Boolean) as string[],
    confidenceFlag: availableCount < 3 ? 'low_sample' : 'normal',
  }
}
```

---

### 4.5 L2_STORY: 剧作维度 (30分)

#### 输入结构

```typescript
interface StoryInput {
  // 2.1 核心推动力：L1 预计算的关键词统计
  relationshipKeywordCount: number
  subplotKeywordCount: number

  // 2.2 角色辨识度：全剧采样的角色描写片段
  characterSamples: string

  // 2.3 情绪浓度：L1 预计算
  emotionKeywordCount: number
  totalWords: number

  // 2.4 冲突/反转：L1 预计算
  conflictKeywordCount: number
  twistCount: number

  totalEpisodes: number
  language: 'en' | 'zh'
}
```

#### Prompt 模板

```
你是短剧剧本评估专家。请严格按照以下评分标准评估剧作维度。

## 一、核心推动力（满分 10 分）

评估剧情主线是否以"关系线"（男女主情感发展）为核心驱动。

L1 统计数据：
- 关系线关键词命中：${relationshipKeywordCount} 次
- 副线关键词命中：${subplotKeywordCount} 次
- 关系线占比：${Math.round((relationshipKeywordCount / Math.max(1, relationshipKeywordCount + subplotKeywordCount)) * 100)}%

关系线关键词：love/hate/marry/divorce/kiss/betray/miss/jealous/爱/恨/结婚/离婚/吻/背叛/想念/嫉妒
副线关键词：company/business/deal/investment/project/meeting/contract/work/公司/生意/投资/项目/会议/合同/工作

| 得分 | 条件 |
|------|------|
| 10分 | 关系线占比 >= 80% |
| 7分 | 关系线占比 >= 60% |
| 4分 | 关系线占比 >= 40% |
| 0分 | 关系线占比 < 40% |

## 二、角色辨识度（满分 10 分 = 男主 4 + 女主 6）

### 男主辨识度（满分 4 分）

标签类型：
- 职业：CEO/president/doctor/general/总裁/医生/将军/教授
- 外貌：handsome/abs/tall/strong/帅/腹肌/高大/肌肉
- 性格：cold/gentle/mature/devoted/冷酷/温柔/成熟/专情
- 行为：protect/dominate/spoil/保护/霸道/宠溺/占有
- 台词：my woman/stay with me/我的女人/跟我走/听我的

| 得分 | 条件 |
|------|------|
| 4分 | 标签 >= 4 个，覆盖 >= 3 个类型 |
| 2分 | 标签 >= 2 个 |
| 0分 | 标签 < 2 个 |

### 女主辨识度（满分 6 分）

标签类型：
- 身份：CEO/heiress/daughter of/总裁/千金/女儿
- 外貌：beautiful/innocent/elegant/美丽/清纯/优雅
- 性格：strong/smart/decisive/坚强/聪明/果断/独立
- 成长：revenge/rise/transform/复仇/崛起/蜕变
- 行动：fight back/take action/stand up/反击/行动/站起来/不再忍受

| 得分 | 条件 |
|------|------|
| 6分 | 标签 >= 5 个，覆盖 >= 4 个类型 |
| 4分 | 标签 >= 3 个，覆盖 >= 3 个类型 |
| 2分 | 标签 >= 2 个 |
| 0分 | 标签 < 2 个 |

### 角色描写采样文本
${characterSamples}

## 三、情绪浓度（满分 6 分）

L1 统计数据：
- 情绪关键词命中：${emotionKeywordCount} 次
- 全剧总词数：${totalWords}
- 情绪密度：${(emotionKeywordCount / Math.max(1, totalWords) * 100).toFixed(2)}%

情绪关键词：cry/tears/sob/weep/scream/shout/roar/furious/shocked/stunned/freeze/gasp/tremble/shiver/panic/terrified/heartbreak/pain/ache/suffer/哭/泪/抽泣/尖叫/怒吼/愤怒/震惊/呆住/倒吸/颤抖/恐慌/害怕/心碎/痛苦/折磨

| 得分 | 条件 |
|------|------|
| 6分 | 密度 >= 1.5% |
| 4分 | 密度 >= 1.0% |
| 2分 | 密度 >= 0.5% |
| 0分 | 密度 < 0.5% |

## 四、冲突/反转（满分 4 分 = 冲突 2.5 + 反转 1.5）

### 冲突密度（满分 2.5 分）

L1 统计数据：
- 冲突关键词命中：${conflictKeywordCount} 次
- 总集数：${totalEpisodes}
- 平均每集冲突：${(conflictKeywordCount / totalEpisodes).toFixed(2)}

冲突关键词：slap/punch/grab/push/kick/argue/fight/quarrel/confront/furious/snarl/glare/threaten/打/抓/推/踢/扇/争吵/吵架/对峙/争执/怒视/咆哮/瞪/威胁

| 得分 | 条件 |
|------|------|
| 2.5分 | 平均每集 >= 2 |
| 1.5分 | 平均每集 >= 1 |
| 0.5分 | 平均每集 < 1 |

### 反转密度（满分 1.5 分）

L1 统计数据：
- 重大反转次数：${twistCount}
- 总集数：${totalEpisodes}

反转关键词：actually/truth is/in fact/realize/turn out/reveal/expose/discover/原来/其实/竟然/真相/没想到/揭露/发现/揭穿
身份反转加权词：identity/truth/secret/身份/真相/秘密

| 得分 | 条件 |
|------|------|
| 1.5分 | 反转数 >= 总集数 / 4 |
| 1分 | 反转数 >= 总集数 / 6 |
| 0.5分 | 反转数 >= 总集数 / 8 |
| 0分 | 反转数 < 总集数 / 8 |

请输出结构化评分结果。
```

#### 输出 Schema

```typescript
const StoryAssessmentSchema = z.object({
  // 2.1 核心推动力 (10分)
  coreDriver: z.object({
    score: z.number().min(0).max(10),
    relationshipPercentage: z.number(),
    reasoning: z.string(),
  }),

  // 2.2 角色辨识度 (10分)
  characterRecognition: z.object({
    maleLead: z.object({
      score: z.number().min(0).max(4),
      tagsFound: z.array(z.string()),
      tagTypesCount: z.number(),
      reasoning: z.string(),
    }),
    femaleLead: z.object({
      score: z.number().min(0).max(6),
      tagsFound: z.array(z.string()),
      tagTypesCount: z.number(),
      reasoning: z.string(),
    }),
    totalScore: z.number().min(0).max(10),
  }),

  // 2.3 情绪浓度 (6分)
  emotionDensity: z.object({
    score: z.number().min(0).max(6),
    densityPercentage: z.number(),
    reasoning: z.string(),
  }),

  // 2.4 冲突/反转 (4分)
  conflictTwist: z.object({
    conflictScore: z.number().min(0).max(2.5),
    conflictAvgPerEp: z.number(),
    twistScore: z.number().min(0).max(1.5),
    majorTwistCount: z.number(),
    totalScore: z.number().min(0).max(4),
    reasoning: z.string(),
  }),
})
```

---

### 4.6 L2_MARKET: 市场维度 (20分)

#### 输入结构

```typescript
interface MarketInput {
  // 3.1 爆款对标：全剧采样片段（用于机制识别）
  mechanismSamples: string

  // 3.2 文化禁忌：L1 预计算
  vulgarCount: number
  redlineHit: boolean
  vulgarPenalty: number // L1 计算：Math.min(2, vulgarCount * 0.05)
  tabooScore: number // L1 计算：redlineHit ? 0 : Math.max(0, 5 - vulgarPenalty)

  // 3.3 本地化梗：L1 预计算
  localizationCount: number
  totalEpisodes: number

  // 3.4 受众匹配：全剧采样 + 题材标签
  audienceSamples: string
  detectedGenre: string // L1 检测的主题材，如 'revenge', 'ceo_romance', 'family_drama'

  language: 'en' | 'zh'
}
```

#### Prompt 模板

```
你是短剧剧本评估专家。请严格按照以下评分标准评估市场维度。

## 一、爆款对标（满分 5 分）

识别剧本中使用的爆款机制。无数据库模式，仅做机制自动识别。

### 机制类别

**身份类机制：**
- 隐藏身份：hidden identity/secret/pretend/隐藏身份/伪装
- 身份反转：daughter of/heiress/CEO/actually/其实是/真实身份
- 双重身份：both...and/secret life/白天...晚上/双重
- 重生穿越：reborn/time travel/previous life/重生/穿越

**关系类机制：**
- 契约关系：contract/fake/pretend/deal/契约/协议/假装
- 替身：substitute/replacement/替身/替嫁
- 闪婚：flash marriage/marry stranger/闪婚/陌生人结婚

**冲突类机制：**
- 复仇：revenge/betray/payback/复仇/报复/背叛
- 虐恋：misunderstand/sacrifice/pain/误会/牺牲/虐
- 打脸：slap face/expose/prove wrong/打脸/揭穿
- 逆袭：rise/transform/from zero to hero/逆袭/崛起

| 得分 | 条件 |
|------|------|
| 5分 | 机制数 >= 3 |
| 3分 | 机制数 = 2 |
| 1分 | 机制数 = 1 |
| 0分 | 机制数 = 0 |

### 待分析文本
${mechanismSamples}

## 二、文化禁忌（满分 5 分）

**注意：本项由 L1 单点裁决，L2 仅输出推理解释。**

L1 统计数据：
- 粗俗词命中：${vulgarCount} 次
- 红线词命中：${redlineHit ? '是' : '否'}
- 粗俗扣分：${vulgarPenalty.toFixed(2)}
- 最终得分：${tabooScore.toFixed(2)}

粗俗词：damn/hell/shit/fuck/bitch/bastard/ass/asshole/dick/cock/pussy/他妈的/操/贱人/混蛋/王八蛋/婊子/傻逼/草
红线词（命中即否决）：rape/incest/pedophile/child abuse/强奸/乱伦/恋童/虐童

请解释 L1 检测结果的合理性。

## 三、本地化梗（满分 5 分）

L1 统计数据：
- 本地化元素命中：${localizationCount} 次
- 总集数：${totalEpisodes}
- 平均每集：${(localizationCount / Math.max(1, totalEpisodes)).toFixed(2)}

本地化元素：Thanksgiving/Christmas/Halloween/Super Bowl/Prom/college/graduation/sorority/fraternity/road trip/barbecue/mall/感恩节/圣诞/万圣节/大学/毕业/兄弟会/姐妹会/公路旅行/烧烤/购物中心

| 得分 | 条件 |
|------|------|
| 5分 | 平均每集 >= 0.2 |
| 3分 | 平均每集 >= 0.1 |
| 1分 | 平均每集 >= 0.04 |
| 0分 | 平均每集 < 0.04 |

## 四、受众匹配（满分 5 分 = 题材匹配 3 + 纯度跨度 2）

### 题材受众匹配（满分 3 分）

检测是否存在与主题材不匹配的元素。

不匹配元素对照表：
- 复仇题材不宜出现：sorority/graduation/dorm/姐妹会/毕业舞会/宿舍
- 青春题材不宜出现：mortgage/mother-in-law/房贷/婆婆/二胎
- 总裁题材不宜出现：campus/school club/校园/学生社团
- 家庭题材不宜出现：campus/first love/校园/初恋

当前检测题材：${detectedGenre}

| 得分 | 条件 |
|------|------|
| 3分 | 不匹配元素 = 0 |
| 2分 | 不匹配元素 1-2 个 |
| 1分 | 不匹配元素 3-4 个 |
| 0分 | 不匹配元素 >= 5 个 |

### 受众纯度与跨度（满分 2 分）

评估核心受众占比和跨度吸引力。

| 得分 | 条件 |
|------|------|
| 2分 | 核心占比 >= 75% 且跨度 >= 10% |
| 1.5分 | 核心占比 >= 75% 但无跨度 |
| 1分 | 核心占比 >= 60% |
| 0分 | 核心占比 < 60% |

### 待分析文本
${audienceSamples}

请输出结构化评分结果。
```

#### 输出 Schema

```typescript
const MarketAssessmentSchema = z.object({
  // 3.1 爆款对标 (5分)
  benchmark: z.object({
    score: z.number().min(0).max(5),
    mechanisms: z.array(z.object({
      name: z.string(),
      category: z.enum(['identity', 'relationship', 'conflict', 'other']),
      evidence: z.string(),
    })),
    mechanismCount: z.number(),
    reasoning: z.string(),
  }),

  // 3.2 文化禁忌 (5分) - L1 单点裁决，L2 仅输出推理
  culturalTaboo: z.object({
    reasoning: z.string().describe('对文化禁忌检测结果的解释'),
  }),

  // 3.3 本地化梗 (5分)
  localization: z.object({
    score: z.number().min(0).max(5),
    elementsFound: z.array(z.string()),
    avgPerEpisode: z.number(),
    reasoning: z.string(),
  }),

  // 3.4 受众匹配 (5分)
  audienceMatch: z.object({
    genreAudienceScore: z.number().min(0).max(3),
    audiencePurityScore: z.number().min(0).max(2),
    totalScore: z.number().min(0).max(5),
    inappropriateElements: z.array(z.string()),
    reasoning: z.string(),
  }),
})
```

---

### 4.7 L2_POTENTIAL: 改造潜力 (10分)

#### 输入结构

```typescript
interface PotentialInput {
  // 前三维度评分结果（依赖 L2_OPENING/PAYWALL/HOOKS/STORY/MARKET 完成）
  payScore: number // /50
  storyScore: number // /30
  marketScore: number // /20
  total110: number

  // 各子项得分（用于识别可修复项）
  auditItems: AuditItem[]

  // 2.1 核心推动力得分
  coreDriverScore: number // /10

  // 2.2 角色辨识度得分
  characterScore: number // /10 (male 4 + female 6)

  // 问题清单（从 auditItems 中筛选 status !== 'ok' 的项）
  issueList: Array<{
    id: string
    score: number
    max: number
    reason: string
  }>
}
```

#### Prompt 模板

```
你是短剧剧本评估专家。请严格按照以下评分标准评估改造潜力。

**注意：本调用依赖前三维度（付费/剧作/市场）的评分结果。**

## 当前评分概览

| 维度 | 得分 | 满分 | 得分率 |
|------|------|------|--------|
| 付费维度 | ${payScore} | 50 | ${Math.round(payScore / 50 * 100)}% |
| 剧作维度 | ${storyScore} | 30 | ${Math.round(storyScore / 30 * 100)}% |
| 市场维度 | ${marketScore} | 20 | ${Math.round(marketScore / 20 * 100)}% |
| **总分** | ${total110} | 110 | ${Math.round(total110 / 110 * 100)}% |

## 问题清单

${issueList.map(item => `- [${item.id}] ${item.score}/${item.max} - ${item.reason}`).join('\n')}

## 一、修复成本（满分 3 分）

根据问题清单评估修复工作量。

问题类型分类：
- **language（语言润色）**：粗俗词过多、本地化不足 → 工时短
- **hook（卡点优化）**：付费点 Hook 弱、单集卡点不足 → 工时中等
- **structure（结构调整）**：付费点位置偏移、情节密度不足 → 工时较长
- **core（内核重写）**：核心推动力不足、角色辨识度低 → 工时很长

| 得分 | 条件 |
|------|------|
| 3分 | 预估工时 < 3h（仅 language 类问题）|
| 2分 | 预估工时 3-10h（language + hook 类问题）|
| 1分 | 预估工时 1-3d（涉及 structure 类问题）|
| 0分 | 预估工时 > 10d（涉及 core 类问题）|

## 二、修复后预期提升（满分 3 分）

评估修复后可恢复的分数。

计算方式：
- 统计所有 status !== 'ok' 的子项
- 计算 recoverable = Σ(max - score)，即理论可恢复分数

| 得分 | 条件 |
|------|------|
| 3分 | recoverable >= 15 |
| 2分 | recoverable >= 8 |
| 1分 | recoverable >= 5 |
| 0分 | recoverable < 5 |

当前 recoverable = ${issueList.reduce((sum, item) => sum + (item.max - item.score), 0)}

## 三、故事内核（满分 3 分）

评估剧本的核心故事是否值得投资修复。

L2_STORY 结果：
- 剧作维度得分率：${Math.round(storyScore / 30 * 100)}%
- 核心推动力得分：${coreDriverScore}/10
- 角色辨识度得分：${characterScore}/10

| 得分 | 条件 |
|------|------|
| 3分 | 剧作得分率 >= 90% 且 核心推动力 >= 8 且 角色辨识度 >= 8 |
| 2分 | 剧作得分率 >= 80% 且 核心推动力 >= 7 且 角色辨识度 >= 7 |
| 1分 | 剧作得分率 >= 70% 且 核心推动力 >= 6 且 角色辨识度 >= 6 |
| 0分 | 其他 |

## 四、市场稀缺性（满分 1 分）

**无数据库模式：固定 0.5 分，标记 N/A。**

请输出结构化评分结果。
```

#### 输出 Schema

```typescript
const PotentialAssessmentSchema = z.object({
  // 4.1 修复成本 (3分)
  repairCost: z.object({
    score: z.number().min(0).max(3),
    estimatedHours: z.enum(['<3h', '3-10h', '1-3d', '>10d']),
    primaryIssueType: z.enum(['language', 'hook', 'structure', 'core']),
    reasoning: z.string(),
  }),

  // 4.2 修复后预期提升 (3分)
  expectedGain: z.object({
    score: z.number().min(0).max(3),
    currentScore: z.number(),
    recoverablePoints: z.number(),
    projectedScore: z.number(),
    reasoning: z.string(),
  }),

  // 4.3 故事内核 (3分)
  storyCore: z.object({
    score: z.number().min(0).max(3),
    storyDimensionPercent: z.number(),
    coreDriverScore: z.number(),
    characterScore: z.number(),
    reasoning: z.string(),
  }),

  // 4.4 市场稀缺性 (1分) - 无数据库时固定值
  scarcity: z.object({
    score: z.literal(0.5).describe('无数据库模式固定 0.5'),
    reasoning: z.literal('N/A: no dataset'),
  }),
})
```

---

## 五、L1 关键词库完整定义

```typescript
// lib/analysis/l1-keywords-v2.ts

export const L1_KEYWORDS_V2 = {
  // ===== 1.1 开篇吸引力 =====
  maleVisual: {
    en: ['CEO', 'president', 'suit', 'abs', 'chest', 'handsome', 'muscular', 'tall', 'strong'],
    zh: ['总裁', '西装', '腹肌', '胸肌', '帅', '高大', '性感', '英俊', '肌肉'],
  },
  malePersona: {
    en: ['mature', 'composed', 'devoted', 'cold', 'gentle', 'dominate', 'protect', 'spoil'],
    zh: ['成熟', '沉稳', '深情', '冷酷', '温柔', '霸道', '保护', '宠溺', '占有欲'],
  },
  femaleConflict: {
    en: ['betray', 'trap', 'drug', 'scheme', 'plot', 'deceive', 'danger', 'ambush'],
    zh: ['背叛', '设计', '陷害', '下药', '欺骗', '危险', '埋伏'],
  },
  femaleMotivation: {
    en: ['because', 'for', 'want', 'need', 'plan', 'goal', 'must', 'in order to'],
    zh: ['因为', '为了', '想要', '需要', '计划', '目标', '必须'],
  },

  // ===== 1.2 付费点 =====
  plotDensity: {
    en: ['discover', 'reveal', 'expose', 'decide', 'confront', 'change', 'breakthrough'],
    zh: ['发现', '揭露', '揭穿', '决定', '对峙', '改变', '突破'],
  },
  emotionalPeak: {
    en: ['cry', 'scream', 'shocked', 'furious', 'breakdown', 'collapse', 'desperate'],
    zh: ['哭', '尖叫', '震惊', '愤怒', '崩溃', '绝望'],
  },
  foreshadow: {
    en: ['soon', 'tomorrow', 'will', 'plan', 'wonder', 'V.O.', 'thinking'],
    zh: ['即将', '明天', '将要', '计划', '好奇', '内心', '想到'],
  },
  hookDecision: {
    en: ['choose', 'decide', 'must', 'either', 'or'],
    zh: ['选择', '决定', '必须', '要么', '还是'],
  },
  hookCrisis: {
    en: ['danger', 'life or death', 'attack', 'threaten', 'knife', 'gun'],
    zh: ['危险', '生死', '攻击', '威胁', '刀', '枪'],
  },
  hookInformation: {
    en: ['who', 'what', 'secret', 'truth', 'identity', 'really'],
    zh: ['是谁', '真相', '秘密', '身份', '到底'],
  },
  hookEmotion: {
    en: ['will he', 'can she', 'would', 'could'],
    zh: ['会不会', '能否', '是否', '会吗'],
  },
  escalation: {
    en: ['life', 'everything', 'forever', 'lose all', 'no turning back', 'final', 'ultimate'],
    zh: ['生命', '一切', '永远', '失去所有', '没有退路', '最后', '终极'],
  },

  // ===== 1.3 单集卡点 =====
  suspense: {
    en: ['what', 'who', 'why', 'shocked', 'stunned', 'freeze'],
    zh: ['什么', '谁', '为什么', '震惊', '呆住', '怎么'],
  },
  predictable: {
    en: ['will', 'soon', 'next', 'tomorrow', 'plan to'],
    zh: ['将要', '即将', '明天', '下次', '打算'],
  },

  // ===== 1.4 看点密度 =====
  dramaEvents: {
    en: ['kill', 'death', 'die', 'betray', 'drug', 'poison', 'attack', 'kidnap', 'accident', 'miscarry', 'expose'],
    zh: ['杀', '死', '生死', '背叛', '下药', '中毒', '袭击', '绑架', '事故', '车祸', '流产', '揭露', '曝光'],
  },
  motivation: {
    en: ['because', 'for', 'want', 'need', 'goal', 'plan', 'must', 'revenge', 'protect', 'love'],
    zh: ['因为', '为了', '想要', '需要', '目标', '计划', '必须', '复仇', '保护', '爱'],
  },

  // ===== 1.5 视觉锤 =====
  visualHammer: {
    en: ['slap', 'hit face', 'kiss', 'passionate', 'punch', 'kick', 'fight', 'pour water', 'splash', 'kneel', 'kowtow', 'propose', 'marry me', 'reveal identity', 'expose', 'luxury car', 'convoy', 'bodyguard'],
    zh: ['巴掌', '打脸', '扇', '吻', '激吻', '亲', '打', '踢', '揍', '泼水', '泼酒', '泼', '下跪', '跪下', '跪地', '求婚', '嫁给我', '揭露身份', '曝光', '豪车', '车队', '保镖'],
  },

  // ===== 2.1 核心推动力 =====
  relationship: {
    en: ['love', 'hate', 'marry', 'divorce', 'kiss', 'betray', 'miss', 'jealous'],
    zh: ['爱', '恨', '结婚', '离婚', '吻', '背叛', '想念', '嫉妒'],
  },
  subplot: {
    en: ['company', 'business', 'deal', 'investment', 'project', 'meeting', 'contract', 'work'],
    zh: ['公司', '生意', '投资', '项目', '会议', '合同', '工作'],
  },

  // ===== 2.2 角色辨识度 =====
  maleTagsJob: {
    en: ['CEO', 'president', 'doctor', 'general'],
    zh: ['总裁', '医生', '将军', '教授'],
  },
  maleTagsLook: {
    en: ['handsome', 'abs', 'tall', 'strong'],
    zh: ['帅', '腹肌', '高大', '肌肉'],
  },
  maleTagsPersonality: {
    en: ['cold', 'gentle', 'mature', 'devoted'],
    zh: ['冷酷', '温柔', '成熟', '专情'],
  },
  maleTagsBehavior: {
    en: ['protect', 'dominate', 'spoil'],
    zh: ['保护', '霸道', '宠溺', '占有'],
  },
  maleTagsDialogue: {
    en: ['my woman', 'stay with me'],
    zh: ['我的女人', '跟我走', '听我的'],
  },
  femaleTagsIdentity: {
    en: ['CEO', 'heiress', 'daughter of'],
    zh: ['总裁', '千金', '女儿'],
  },
  femaleTagsLook: {
    en: ['beautiful', 'innocent', 'elegant'],
    zh: ['美丽', '清纯', '优雅'],
  },
  femaleTagsPersonality: {
    en: ['strong', 'smart', 'decisive'],
    zh: ['坚强', '聪明', '果断', '独立'],
  },
  femaleTagsGrowth: {
    en: ['revenge', 'rise', 'transform'],
    zh: ['复仇', '崛起', '蜕变'],
  },
  femaleTagsAction: {
    en: ['fight back', 'take action', 'stand up'],
    zh: ['反击', '行动', '站起来', '不再忍受'],
  },

  // ===== 2.3 情绪浓度 =====
  emotion: {
    en: ['cry', 'tears', 'sob', 'weep', 'scream', 'shout', 'roar', 'furious', 'shocked', 'stunned', 'freeze', 'gasp', 'tremble', 'shiver', 'panic', 'terrified', 'heartbreak', 'pain', 'ache', 'suffer'],
    zh: ['哭', '泪', '抽泣', '尖叫', '怒吼', '愤怒', '震惊', '呆住', '倒吸', '颤抖', '恐慌', '害怕', '心碎', '痛苦', '折磨'],
  },

  // ===== 2.4 冲突/反转 =====
  conflict: {
    en: ['slap', 'punch', 'grab', 'push', 'kick', 'argue', 'fight', 'quarrel', 'confront', 'furious', 'snarl', 'glare', 'threaten'],
    zh: ['打', '抓', '推', '踢', '扇', '争吵', '吵架', '对峙', '争执', '怒视', '咆哮', '瞪', '威胁'],
  },
  twist: {
    en: ['actually', 'truth is', 'in fact', 'realize', 'turn out', 'reveal', 'expose', 'discover'],
    zh: ['原来', '其实', '竟然', '真相', '没想到', '揭露', '发现', '揭穿'],
  },
  twistIdentity: {
    en: ['identity', 'truth', 'secret'],
    zh: ['身份', '真相', '秘密'],
  },

  // ===== 3.1 爆款对标 =====
  mechanismIdentity: {
    hiddenIdentity: { en: ['hidden identity', 'secret', 'pretend'], zh: ['隐藏身份', '伪装'] },
    identityReversal: { en: ['daughter of', 'heiress', 'CEO', 'actually'], zh: ['其实是', '真实身份'] },
    dualIdentity: { en: ['both...and', 'secret life'], zh: ['白天...晚上', '双重'] },
    reborn: { en: ['reborn', 'time travel', 'previous life'], zh: ['重生', '穿越'] },
  },
  mechanismRelationship: {
    contract: { en: ['contract', 'fake', 'pretend', 'deal'], zh: ['契约', '协议', '假装'] },
    substitute: { en: ['substitute', 'replacement'], zh: ['替身', '替嫁'] },
    flashMarriage: { en: ['flash marriage', 'marry stranger'], zh: ['闪婚', '陌生人结婚'] },
  },
  mechanismConflict: {
    revenge: { en: ['revenge', 'betray', 'payback'], zh: ['复仇', '报复', '背叛'] },
    angst: { en: ['misunderstand', 'sacrifice', 'pain'], zh: ['误会', '牺牲', '虐'] },
    faceSlap: { en: ['slap face', 'expose', 'prove wrong'], zh: ['打脸', '揭穿'] },
    riseUp: { en: ['rise', 'transform', 'from zero to hero'], zh: ['逆袭', '崛起'] },
  },

  // ===== 3.2 文化禁忌 =====
  vulgar: {
    en: ['damn', 'hell', 'shit', 'fuck', 'bitch', 'bastard', 'ass', 'asshole', 'dick', 'cock', 'pussy'],
    zh: ['他妈的', '操', '贱人', '混蛋', '王八蛋', '婊子', '傻逼', '草'],
  },
  redline: {
    en: ['rape', 'incest', 'pedophile', 'child abuse'],
    zh: ['强奸', '乱伦', '恋童', '虐童'],
  },

  // ===== 3.3 本地化梗 =====
  localization: {
    en: ['Thanksgiving', 'Christmas', 'Halloween', 'Super Bowl', 'Prom', 'college', 'graduation', 'sorority', 'fraternity', 'road trip', 'barbecue', 'mall'],
    zh: ['感恩节', '圣诞', '万圣节', '大学', '毕业', '兄弟会', '姐妹会', '公路旅行', '烧烤', '购物中心'],
  },

  // ===== 3.4 受众匹配 =====
  audienceMismatch: {
    revenge: { en: ['sorority', 'graduation', 'dorm'], zh: ['姐妹会', '毕业舞会', '宿舍'] },
    youngAdult: { en: ['mortgage', 'mother-in-law'], zh: ['房贷', '婆婆', '二胎'] },
    ceoRomance: { en: ['campus', 'school club'], zh: ['校园', '学生社团'] },
    familyDrama: { en: ['campus', 'first love'], zh: ['校园', '初恋'] },
  },
}
```

---

## 六、分数聚合与 Grade 映射

```typescript
// lib/analysis/score-aggregator.ts

interface AuditItem {
  id: string
  status: 'ok' | 'warn' | 'fail'
  score: number
  max: number
  reason: string
  evidence: string[]
  confidenceFlag?: 'low_sample' | 'normal' // 置信度标记，与 status 独立
}

interface ScoreBreakdown {
  pay: number // /50
  story: number // /30
  market: number // /20
  potential: number // /10
  total110: number
  overall100: number
  grade: 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C'
}

function aggregateScores(auditItems: AuditItem[]): ScoreBreakdown {
  const pay = sumByPrefix(auditItems, 'pay.')
  const story = sumByPrefix(auditItems, 'story.')
  const market = sumByPrefix(auditItems, 'market.')
  const potential = sumByPrefix(auditItems, 'potential.')

  const total110 = pay + story + market + potential
  const overall100 = Math.round(total110 / 110 * 100)
  const grade = mapGrade(total110)

  return { pay, story, market, potential, total110, overall100, grade }
}

function mapGrade(total110: number): ScoreBreakdown['grade'] {
  if (total110 >= 101)
    return 'S+'
  if (total110 >= 91)
    return 'S'
  if (total110 >= 86)
    return 'A+'
  if (total110 >= 81)
    return 'A'
  if (total110 >= 70)
    return 'B'
  return 'C'
}

function sumByPrefix(items: AuditItem[], prefix: string): number {
  return items
    .filter(item => item.id.startsWith(prefix))
    .reduce((sum, item) => sum + item.score, 0)
}
```

---

## 七、红线一票否决机制

```typescript
// lib/analysis/redline-check.ts

interface RedlineResult {
  hit: boolean
  evidence: string[]
  forcedGrade: 'C' | null
  forcedOverall100: number | null
}

function applyRedlineOverride(
  breakdown: ScoreBreakdown,
  redlineHit: boolean,
  redlineEvidence: string[]
): ScoreBreakdown {
  if (!redlineHit)
    return breakdown

  // V2 规则：命中红线，强制 Grade = C，overall100 ≤ 69
  return {
    ...breakdown,
    grade: 'C',
    overall100: Math.min(breakdown.overall100, 69),
  }
}
```

---

## 八、Result JSON 结构

> 输出契约详见 [`V2_RULESET_FREEZE.md`](./V2_RULESET_FREEZE.md) 第 11 节。

```typescript
interface ResultJSON {
  meta: {
    title: string
    evaluationVersion: string
    rulesetVersion: string // "v2.1.0-freeze-nodb"
    benchmarkMode: 'rule-only'
    noExternalDataset: true
    language: 'en' | 'zh'
    tokenizer: 'whitespace' | 'intl-segmenter' | 'char-fallback'
    declaredTotalEpisodes: number
    episodeCount: number
    warnings: string[]
  }

  score: {
    total_110: number
    overall_100: number
    grade: 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C'
    breakdown_110: {
      pay: number
      story: number
      market: number
      potential: number
    }
  }

  dashboard: {
    header: { kicker: string, subtitle: string }
    gradeCard: { title: string, text: string }
    dimensionBars: {
      monetization: { label: string, percent: number, text: string }
      story: { label: string, percent: number, text: string }
      market: { label: string, percent: number, text: string }
    }
    charts: {
      emotionalIntensity: Array<{ ep: number, value: number }>
      conflictFrequency: Array<{ phase: string, ext: number, int: number }>
    }
    episodeMatrix: Array<{ ep: number, status: 'optimal' | 'issue' | 'neutral', issues: string[] }>
    episodeTable: Array<{
      ep: number
      health: 'GOOD' | 'FAIR' | 'PEAK'
      primaryHookType: string
      aiHighlight: string
    }>
  }

  diagnosis: {
    selectedEpisode: number
    integrityChecks: Array<{ title: string, text: string }>
    issues: Array<{
      ep: number
      type: string
      severity: 'red' | 'yellow' | 'green'
      hookType: string
      hookLabel: string
      emotionLevel: 'Low' | 'Medium' | 'High'
      conflictDensity: 'LOW' | 'MEDIUM' | 'HIGH'
      pacingScore: number
      suggestion: string
    }>
  }

  audit: {
    items: AuditItem[]
  }
}
```

---

## 九、实施路线图

### Phase 1: L1 基础设施 (已完成)
- [x] Episode 解析与预检
- [x] 窗口构建 (head/tail/paywall_context)
- [x] 基础 tokenizer
- [x] 粗俗词/红线词检测

### Phase 2: L1 关键词库扩充
- [ ] 按冻结规格补全所有关键词类别
- [ ] 实现各类别的计数函数
- [ ] 输出 L1Stats 供 L2 使用

### Phase 3: L2 AI 评分
- [ ] 实现 7 个 AI 调用的 Schema 和 Prompt
- [ ] 集成 Vercel AI SDK 结构化输出
- [ ] 实现并行调用 + 依赖管理
- [ ] 实现 L2 容错（重试 2 次 + 确定性降级）
- [ ] 约束 `reason/evidence` 英文输出（检测到中文字符则重试，超限报错）

### Phase 4: 分数聚合与报告
- [ ] 实现 AuditItem 汇总
- [ ] 实现 Grade 映射和红线覆盖
- [ ] 生成 Result JSON

### Phase 5: UI 对接
- [ ] Dashboard 数据绑定
- [ ] Diagnosis 数据绑定
- [ ] Export PDF

### Phase 6: 验收测试
- [ ] 通过冻结规格的 7 条验收用例

---

## 十、验收用例

> 完整用例见 [`V2_RULESET_FREEZE.md`](./V2_RULESET_FREEZE.md) 第 13 节。

| # | 用例 | 预期 |
|---|------|------|
| 1 | `totalEpisodes < 30` | 第二付费点自动满分 10 |
| 2 | `totalEpisodes >= 30` 且无第二付费点 | 第二付费点得 0 |
| 3 | 第二付费点无 Escalation | Hook 不得超过 1 |
| 4 | Drama 事件 3/4/6 边界 | 分档正确 (1/1.5/2.5) |
| 5 | 视觉锤 `first12 = 0` | 不报错，占比按 0 处理 |
| 6 | 红线命中 | 总分保留，Grade 强制 C |
| 7 | 无数据库 | 3.1 纯规则，4.4 = 0.5 且标 N/A |

---

## 十一、子项 ID 清单

> 完整清单见 [`V2_RULESET_FREEZE.md`](./V2_RULESET_FREEZE.md) 第 14 节。

| ID | 子项 | 满分 |
|----|------|------|
| `pay.opening.male_lead` | 男主帅气出场 | 5 |
| `pay.opening.female_lead` | 女主带故事出场 | 5 |
| `pay.paywall.primary.position` | 第一付费点位置 | 2 |
| `pay.paywall.primary.previous` | 第一付费点前一集精彩度 | 4 |
| `pay.paywall.primary.hook` | 第一付费点 Hook 强度 | 5 |
| `pay.paywall.primary.next` | 第一付费点后一集吸引力 | 3 |
| `pay.paywall.secondary.position` | 第二付费点位置 | 2 |
| `pay.paywall.secondary.previous` | 第二付费点前一集精彩度 | 3 |
| `pay.paywall.secondary.hook` | 第二付费点 Hook 强度 | 3 |
| `pay.paywall.secondary.next` | 第二付费点后一集吸引力 | 2 |
| `pay.hooks.episodic` | 单集卡点 | 7 |
| `pay.density.drama` | Drama 事件频率 | 2.5 |
| `pay.density.motivation` | 动机清晰度 | 2 |
| `pay.density.foreshadow` | 伏笔紧张感 | 2.5 |
| `pay.visual_hammer` | 视觉锤 | 2 |
| `story.core_driver` | 核心推动力 | 10 |
| `story.character.male` | 男主辨识度 | 4 |
| `story.character.female` | 女主辨识度 | 6 |
| `story.emotion_density` | 情绪浓度 | 6 |
| `story.conflict` | 冲突密度 | 2.5 |
| `story.twist` | 反转密度 | 1.5 |
| `market.benchmark` | 爆款对标 | 5 |
| `market.taboo` | 文化禁忌 | 5 |
| `market.localization` | 本地化梗 | 5 |
| `market.audience.genre` | 题材受众匹配 | 3 |
| `market.audience.purity` | 受众纯度与跨度 | 2 |
| `potential.repair_cost` | 修复成本 | 3 |
| `potential.expected_gain` | 预期提升 | 3 |
| `potential.story_core` | 故事内核 | 3 |
| `potential.scarcity` | 市场稀缺性 | 1 |

**总计**: 30 个子项，满分 110 分。
