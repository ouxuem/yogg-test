# V2 评分规则冻结文档

> **版本号**: `v2.1.0-freeze-nodb`
> **适用范围**: `sdicap` 项目全部 V2 评分流程
> **目标**: 消除口径冲突，保证同输入同输出，可审计、可回归测试

---

## 1. 规则优先级（冲突裁决顺序）

| 优先级 | 内容 |
|--------|------|
| P0 | 总分结构、维度满分、Grade 阈值、红线否决 |
| P1 | 评分表中的分档规则 |
| P2 | 检测逻辑伪代码 |
| P3 | 示例文本 |

发生冲突时，高优先级覆盖低优先级。

---

## 2. 固定总盘（不可改）

```
总分 110 = 付费 50 + 剧作 30 + 市场 20 + 改造潜力 10
```

### Grade 映射（按 `total110`）

| Grade | 条件 |
|-------|------|
| S+ | >= 101 |
| S | >= 91 |
| A+ | >= 86 |
| A | >= 81 |
| B | >= 70 |
| C | < 70 |

```typescript
overall100 = Math.round(total110 / 110 * 100)
```

---

## 3. 关键冻结决议

| 决议 | 内容 |
|------|------|
| 1.1 开篇吸引力 | 固定 `10分 = 男主5 + 女主5` |
| 核心矛盾/风格 | 改为诊断项，不计入 110 分 |
| 3.1 爆款对标 | 无数据库时只走机制自动识别 |
| 4.4 市场稀缺性 | 无数据库时固定 `0.5/1`，标记 `N/A` |
| 第二付费点 Escalation | 无 Escalation 时 Hook 上限 `1分` |

---

## 4. 预检口径（L0）

1. 必须解析出集号序列
2. 必须检查缺集、重复集、集号乱序
3. 必须检查 `[PAYWALL]` 标记数量与位置
4. 必须检测语言 `en/zh`，仅允许单语输入；混合语料直接报错拦截（`[PAYWALL]` 不参与语言判定）
5. 预检失败时不出正式分，仅返回错误清单

---

## 5. 付费维度（50分）

### 5.1 开篇吸引力（10分）

#### 男主帅气出场（5分）

| 得分 | 条件 |
|------|------|
| 5 | Episode 2 开头 1000 字符内出现，视觉标签 ≥2 + 人设标签 ≥1 |
| 3 | Episode 2-3 出现，视觉或人设标签任一 |
| 1 | Episode 3 之后出现，仅有名字 |
| 0 | 前 3 集未出场 |

#### 女主带故事出场（5分）

| 得分 | 条件 |
|------|------|
| 5 | Episode 1 开场即 conflict + 动机清晰 |
| 3 | 有 conflict 但动机模糊 |
| 1 | 静态介绍式出场 |
| 0 | 无故事性 |

---

### 5.2 付费卡点精准度（24分）

#### 第一付费点（14分 = 2 + 4 + 5 + 3）

| 子项 | 满分 | 分档 |
|------|------|------|
| 位置 | 2 | 在合理区间内 `2`，否则 `0` |
| 前一集精彩度 | 4 | 三项全满 `4`，满足 2 项 `3`，满足 1 项 `2`，否则 `0` |
| Hook 强度 | 5 | 决策型 `5`，危机型 `4`，信息型 `3`，情感型 `2`，无 `0` |
| 后一集吸引力 | 3 | 三项全满 `3`，满足 2 项 `2`，满足 1 项 `1`，否则 `0` |

#### 第二付费点（10分 = 2 + 3 + 3 + 2）

| 条件 | 处理 |
|------|------|
| `totalEpisodes < 30` | 自动满分 `10` |
| `totalEpisodes >= 30` 且无第二付费点 | 记 `0` |
| 无 Escalation | Hook 分上限 `1` |

| 子项 | 满分 |
|------|------|
| 位置 | 2 |
| 前一集精彩度 | 3 |
| Hook 强度 | 3 |
| 后一集吸引力 | 2 |

---

### 5.3 单集卡点（7分）

抽查 `ep2/4/8/10`，每集最高 `1.75` 分。

| 得分 | 条件 |
|------|------|
| 1.75 | 有悬念 + 有可预测线索 |
| 1 | 仅悬念或仅线索 |
| 0 | 无卡点 |

#### 归一化逻辑

```typescript
available_count = 可用抽查集数量 // 1..4
raw_sum = 可用抽查集得分之和

if (available_count === 0) {
  final_score = 0
  confidenceFlag = 'low_sample'
}
else {
  score_1_3 = (raw_sum / available_count) * 4
  final_score = Math.min(score_1_3, 7)
  confidenceFlag = available_count < 3 ? 'low_sample' : 'normal'
}
```

---

### 5.4 看点密度（7分）

#### Drama 事件频率（2.5分）

| 得分 | 条件 |
|------|------|
| 2.5 | count >= 6 |
| 1.5 | count >= 4 |
| 1 | count >= 3 |
| 0 | count < 3 |

#### 动机清晰度（2分）

| 得分 | 条件 |
|------|------|
| 2 | 主角动机清晰 + 反派动机清晰 |
| 1 | 仅主角动机清晰 |
| 0 | 都不清晰 |

#### 伏笔紧张感（2.5分）

| 得分 | 条件 |
|------|------|
| 2.5 | avgPerEpisode >= 2 |
| 1.5 | avgPerEpisode >= 1 |
| 0 | avgPerEpisode < 1 |

---

### 5.5 视觉锤（2分）

| 得分 | 条件 |
|------|------|
| 2 | total >= 5 且 first3/first12 <= 0.5 |
| 1.5 | total >= 3 |
| 1 | total >= 1 |
| 0 | total = 0 |

**边界保护**: `first12 = 0` 时占比按 `0` 处理，禁止除零。

---

## 6. 剧作维度（30分）

### 6.1 核心推动力（10分）

| 得分 | 条件 |
|------|------|
| 10 | 关系线占比 >= 80% |
| 7 | 关系线占比 >= 60% |
| 4 | 关系线占比 >= 40% |
| 0 | 关系线占比 < 40% |

---

### 6.2 角色辨识度（10分 = 男主 4 + 女主 6）

#### 男主辨识度（4分）

| 得分 | 条件 |
|------|------|
| 4 | 标签 >= 4 个，覆盖 >= 3 个类型 |
| 2 | 标签 >= 2 个 |
| 0 | 标签 < 2 个 |

#### 女主辨识度（6分）

| 得分 | 条件 |
|------|------|
| 6 | 标签 >= 5 个，覆盖 >= 4 个类型 |
| 4 | 标签 >= 3 个，覆盖 >= 3 个类型 |
| 2 | 标签 >= 2 个 |
| 0 | 标签 < 2 个 |

---

### 6.3 情绪浓度（6分）

| 得分 | 条件 |
|------|------|
| 6 | 密度 >= 1.5% |
| 4 | 密度 >= 1.0% |
| 2 | 密度 >= 0.5% |
| 0 | 密度 < 0.5% |

---

### 6.4 冲突/反转（4分 = 冲突 2.5 + 反转 1.5）

#### 冲突密度（2.5分）

| 得分 | 条件 |
|------|------|
| 2.5 | avgPerEpisode >= 2 |
| 1.5 | avgPerEpisode >= 1 |
| 0.5 | avgPerEpisode < 1 |

#### 反转密度（1.5分）

| 得分 | 条件 |
|------|------|
| 1.5 | majorTwistCount >= totalEpisodes / 4 |
| 1 | majorTwistCount >= totalEpisodes / 6 |
| 0.5 | majorTwistCount >= totalEpisodes / 8 |
| 0 | majorTwistCount < totalEpisodes / 8 |

---

## 7. 市场维度（20分，无数据库版）

### 7.1 爆款对标（5分）

仅机制自动识别，不走数据库。

| 得分 | 条件 |
|------|------|
| 5 | 机制数 >= 3 |
| 3 | 机制数 = 2 |
| 1 | 机制数 = 1 |
| 0 | 机制数 = 0 |

---

### 7.2 文化禁忌（5分）

```typescript
vulgarPenalty = Math.min(2, vulgarCount * 0.05)
score = Math.max(0, 5 - vulgarPenalty)
```

**红线命中时**: 本项记 `0`，并触发全局否决。

---

### 7.3 本地化梗（5分）

| 得分 | 条件 |
|------|------|
| 5 | avgPerEpisode >= 0.2 |
| 3 | avgPerEpisode >= 0.1 |
| 1 | avgPerEpisode >= 0.04 |
| 0 | avgPerEpisode < 0.04 |

---

### 7.4 受众匹配（5分 = 题材匹配 3 + 纯度跨度 2）

#### 题材受众匹配（3分）

| 得分 | 条件 |
|------|------|
| 3 | 不匹配元素 = 0 |
| 2 | 不匹配元素 1-2 个 |
| 1 | 不匹配元素 3-4 个 |
| 0 | 不匹配元素 >= 5 个 |

#### 受众纯度与跨度（2分）

| 得分 | 条件 |
|------|------|
| 2 | 核心占比 >= 75% 且跨度 >= 10% |
| 1.5 | 核心占比 >= 75% 但无跨度 |
| 1 | 核心占比 >= 60% |
| 0 | 核心占比 < 60% |

---

## 8. 改造潜力（10分，无数据库版）

### 8.1 修复成本（3分）

| 得分 | 条件 |
|------|------|
| 3 | 预估工时 < 3h |
| 2 | 预估工时 3-10h |
| 1 | 预估工时 1-3d |
| 0 | 预估工时 > 10d |

---

### 8.2 预期提升（3分）

| 得分 | 条件 |
|------|------|
| 3 | recoverable >= 15 |
| 2 | recoverable >= 8 |
| 1 | recoverable >= 5 |
| 0 | recoverable < 5 |

---

### 8.3 故事内核（3分）

```typescript
const storyPercent = (storyScore / 30) * 100
const coreDriver = coreDriverScore // /10
const character = characterScore // /10

if (storyPercent >= 90 && coreDriver >= 8 && character >= 8)
  return 3
if (storyPercent >= 80 && coreDriver >= 7 && character >= 7)
  return 2
if (storyPercent >= 70 && coreDriver >= 6 && character >= 6)
  return 1
return 0
```

---

### 8.4 市场稀缺性（1分）

无数据库时固定 `0.5`，`reason = "N/A: no dataset"`。

---

## 9. 红线否决（全局强制）

1. 红线词命中即触发否决
2. 否决后强制：
   - `grade = 'C'`
   - `overall100 = Math.min(overall100, 69)`
3. `total110` 与各维度分保留原值用于诊断，不覆盖

---

## 10. AI 与确定性分工

| 层 | 职责 | 要求 |
|----|------|------|
| L1 | 全部关键词计数、位置检测、规则计算 | 必须可复现 |
| L2 | 语义判断与证据抽取 | 禁止自由加权 |

### L2 容错

- 输出必须严格 schema
- `reason/evidence` 输出默认英文；若检测到中文字符，判为非法输出并重试
- 非法输出最多重试 2 次
- 重试失败走确定性降级，不因系统故障给 0 分

---

## 11. 输出契约

### 每个评分项必须输出

```typescript
interface AuditItem {
  id: string
  score: number
  max: number
  reason: string
  evidence: string[]
  status: 'ok' | 'warn' | 'fail'
  confidenceFlag?: 'low_sample' | 'normal' // 置信度标记，与 status 独立
}
```

### 顶层 meta 必须包含

```typescript
{
  benchmarkMode: "rule-only",
  noExternalDataset: true,
  rulesetVersion: "v2.1.0-freeze-nodb"
}
```

---

## 12. 计算与边界规则

1. 子项允许小数（如 `1.75/2.5/1.5/0.5`）
2. 聚合时保留原始小数参与计算
3. Grade 判断基于 `total110` 原始值，不先四舍五入
4. 文本缺失、分母为 0、窗口不足必须有显式降级分支，禁止 `NaN/Infinity`

---

## 13. 验收用例（必须全过）

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

## 14. 子项 ID 清单

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
