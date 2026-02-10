/**
 * L2 prompt builders - AI-Centric版本
 * 减少L1关键词计数干预，让AI直接理解文本
 */

const ENGLISH_OUTPUT_POLICY = `
Hard output rules:
1) Return all reasoning and evidence in English.
2) Do not output Chinese characters.
3) If the source is Chinese, paraphrase evidence in English.
4) Follow the schema exactly and do not add extra fields.
`.trim()

// ==================== L2_OPENING: 开篇吸引力 (增强版) ====================

export interface OpeningPromptInputEnhanced {
  ep1Full: string
  ep2Full: string
  ep3Full: string
  ep1Head: string
  ep2Head: string
  ep3Head: string
}

export function buildOpeningPrompt(input: OpeningPromptInputEnhanced) {
  return `
You are a short-drama script evaluator. Read and understand the script deeply, then score based on your analysis.

## Evaluation Task

### 1) Male Lead Attractive Entry (0/1/3/5 points)
Evaluate the male lead's first appearance in Episodes 1-3:
- 5 points: Appears in Ep2 with strong visual tags (CEO/suit/abs/handsome/etc.) AND personality tags (mature/cold/devoted/etc.)
- 3 points: Appears in Ep2-3 with either visual or personality presence
- 1 point: Appears but only name mentioned, no distinctive traits
- 0 points: Not in first 3 episodes

Visual tags: CEO, president, suit, abs, chest, handsome, muscular, tall, strong, 总裁, 西装, 腹肌, 帅, 高大
Personality tags: mature, composed, devoted, cold, gentle, dominate, protect, spoil, 成熟, 沉稳, 深情, 霸道, 温柔

### 2) Female Lead Story-Driven Entry (0/1/3/5 points)
Evaluate the female lead's first appearance in Episode 1:
- 5 points: Immediate conflict + clear motivation
- 3 points: Has conflict but motivation unclear
- 1 point: Static introduction only (name, age, job)
- 0 points: No story presence

Conflict indicators: betray, trap, drug, scheme, danger, 背叛, 设计, 陷害, 下药, 危险
Motivation indicators: because, for, want, need, goal, plan, must, 因为, 为了, 想要, 计划, 必须

### 3) Core Conflict Establishment (Diagnostic only, not scored)
Does Episode 1 establish an irreconcilable conflict?
Look for: betrayal, life/death stakes, revenge setup, high-stakes situations

### 4) Genre Clarity (Diagnostic only, not scored)
Do Episodes 1-3 establish a clear genre/style?
Look for: consistent tone (satisfying, angst, revenge)

${ENGLISH_OUTPUT_POLICY}

## Script Content

### Episode 1 Full Text
${clip(input.ep1Full, 2500)}

### Episode 2 Full Text
${clip(input.ep2Full, 2500)}

### Episode 3 Full Text
${clip(input.ep3Full, 2500)}

### Episode 1 Opening (first 500 words)
${clip(input.ep1Head, 1200)}

### Episode 2 Opening (first 500 words)
${clip(input.ep2Head, 1200)}

### Episode 3 Opening (first 500 words)
${clip(input.ep3Head, 1200)}
`.trim()
}

// ==================== L2_PAYWALL_HOOKS: 付费点+卡点+密度+视觉锤 (合并版) ====================

export interface PaywallHooksPromptInput {
  // 第一付费点
  firstPaywallEpisode: number
  totalEpisodes: number
  previousEpisode1Text: string
  paywall1Pre: string
  paywall1Post: string
  nextEpisode1Head: string
  episodesForAnalysis1: Array<{ number: number, tail: string }>
  detectedPaywall1: number | null

  // 第二付费点 (长剧)
  secondPaywallEpisode?: number
  validRange2?: [number, number]
  previousEpisode2Text?: string
  paywall2Pre?: string
  paywall2Post?: string
  nextEpisode2Head?: string
  episodesForAnalysis2?: Array<{ number: number, tail: string }>
  detectedPaywall2?: number | null
  hasSecondPaywall: boolean

  // 单集卡点
  ep2Tail: string
  ep4Tail: string
  ep8Tail: string
  ep10Tail: string

  // 看点密度和视觉锤
  first12Text: string
  first5Text: string
  first3Text: string
}

export function buildPaywallHooksPrompt(input: PaywallHooksPromptInput) {
  const detectionNote1 = input.detectedPaywall1 != null
    ? `First paywall detected at Episode ${input.detectedPaywall1}.`
    : 'No [PAYWALL] marker detected for first paywall. You MUST analyze episodes 2-17 endings and identify the best paywall location.'

  const secondPaywallSection = input.hasSecondPaywall
    ? `
## Second Paywall Evaluation (10 points)

${input.detectedPaywall2 != null
  ? `Second paywall detected at Episode ${input.detectedPaywall2}.`
  : `No second [PAYWALL] marker detected. Analyze episodes in range ${input.validRange2?.[0]}-${input.validRange2?.[1]} and identify the best second paywall location.`}

Valid range: ${input.validRange2?.[0]}-${input.validRange2?.[1]}

### Position (0/2 points)
- 2 points: Within valid range
- 0 points: Outside range

### Previous Episode Quality (0/1/2/3 points)
- 3 points: Plot density + Emotional peak + Foreshadowing (3/3)
- 2 points: 2/3 conditions met
- 1 point: 1/3 conditions met
- 0 points: None met

### Hook Strength (0/1/2/3 points)
- 3 points: Decision or Crisis type with escalation
- 2 points: Information type with escalation
- 1 point: Emotion type or no escalation
- 0 points: No hook

Escalation means higher stakes than first paywall (life, everything, forever, no turning back, 生命, 一切, 永远)

### Next Episode Pull (0/1/2 points)
- 2 points: Immediate answer + New plot + New hook (3/3)
- 1 point: 1-2 conditions met
- 0 points: None met

### Second Paywall Context
[Previous episode - Ep ${input.secondPaywallEpisode != null ? input.secondPaywallEpisode - 1 : 'N/A'}]
${clip(input.previousEpisode2Text ?? '', 1800)}

[Paywall episode ending - Ep ${input.secondPaywallEpisode ?? 'N/A'}]
${clip(input.paywall2Pre ?? '', 1500)}

[Paywall post-context]
${clip(input.paywall2Post ?? '', 1200)}

[Next episode opening]
${clip(input.nextEpisode2Head ?? '', 1000)}

${(input.episodesForAnalysis2?.length ?? 0) > 0
  ? `[Episodes for Analysis (range ${input.validRange2?.[0]}-${input.validRange2?.[1]})]\n${input.episodesForAnalysis2!.map(ep => `[Episode ${ep.number} ending]\n${clip(ep.tail, 350)}`).join('\n\n')}`
  : ''}
`
    : ''

  return `
You are a short-drama script evaluator. Analyze the script deeply for monetization potential.

## First Paywall Evaluation (14 points)

${detectionNote1}
Total episodes: ${input.totalEpisodes}
Valid range for first paywall: Episodes 4-17

### Position (0/2 points)
Score based on whether paywall is in valid range (4-17):
- 2 points: Within range
- 0 points: Outside range

### Previous Episode Quality (0/2/3/4 points)
Evaluate the episode BEFORE the paywall:
- 4 points: High plot density + Emotional peak + Foreshadowing (3/3)
- 3 points: 2/3 conditions met
- 2 points: 1/3 conditions met
- 0 points: None met

Plot density indicators: discover, reveal, expose, decide, confront, change, 发现, 揭露, 决定, 对峙, 改变
Emotional peak indicators: cry, scream, shocked, furious, breakdown, 哭, 尖叫, 震惊, 愤怒, 崩溃
Foreshadowing indicators: soon, tomorrow, will, plan, V.O., 即将, 明天, 将要, 计划, 内心

### Hook Strength (0/2/3/4/5 points)
Evaluate the paywall ending:
- 5 points: Decision type (A or B? Major choice affecting main plot)
- 4 points: Crisis type (Life or death, physical danger)
- 3 points: Information type (Truth reveal, identity mystery)
- 2 points: Emotion type (Relationship suspense)
- 0 points: No hook, flat ending

Decision keywords: choose, decide, must, either, or, 选择, 决定, 必须, 要么, 还是
Crisis keywords: danger, life or death, attack, threaten, knife, gun, 危险, 生死, 攻击, 威胁, 刀, 枪
Information keywords: who, what, secret, truth, identity, 是谁, 真相, 秘密, 身份
Emotion keywords: will he, can she, would, could, 会不会, 能否, 是否, 会吗

### Next Episode Pull (0/1/2/3 points)
Evaluate the episode AFTER the paywall opening:
- 3 points: Immediate answer + New plot + New hook (3/3)
- 2 points: 2/3 conditions met
- 1 point: 1/3 conditions met
- 0 points: None met

Immediate answer: reveal, announce, finally, truth is, 揭露, 公开, 终于, 真相是, 原来
New plot: shocked, unexpected, suddenly, then, 震惊, 没想到, 突然, 接着
New hook: but, however, what if, now, 但是, 然而, 如果, 现在

${ENGLISH_OUTPUT_POLICY}

### First Paywall Context
[Previous episode full text - Ep ${input.firstPaywallEpisode - 1}]
${clip(input.previousEpisode1Text, 2000)}

[Paywall episode ending - Ep ${input.firstPaywallEpisode}]
${clip(input.paywall1Pre, 1500)}

[Paywall post-context]
${clip(input.paywall1Post, 1200)}

[Next episode opening - Ep ${input.firstPaywallEpisode + 1}]
${clip(input.nextEpisode1Head, 1000)}

${input.episodesForAnalysis1.length
  ? `[Episodes for Analysis (range 2-17)]\n${input.episodesForAnalysis1.map(ep => `[Episode ${ep.number} ending]\n${clip(ep.tail, 350)}`).join('\n\n')}`
  : ''}

${secondPaywallSection}

## Episodic Hooks Evaluation (7 points)

Evaluate endings of Episodes 2, 4, 8, 10 for hook quality.
Each episode scored 0/1/1.75 points:
- 1.75 points: Has suspense + has predictable线索
- 1 point: Only suspense or only线索
- 0 points: No hook

Suspense indicators: what, who, why, shocked, stunned, freeze, 什么, 谁, 震惊, 呆住, 怎么
Predictable线索 indicators: will, soon, next, tomorrow, plan to, 将要, 即将, 明天, 下次, 打算

### Episode 2 Ending
${clip(input.ep2Tail, 500)}

### Episode 4 Ending
${clip(input.ep4Tail, 500)}

### Episode 8 Ending
${clip(input.ep8Tail, 500)}

### Episode 10 Ending
${clip(input.ep10Tail, 500)}

## Content Density Evaluation (7 points)

### Drama Events Frequency (0/1/1.5/2.5 points) - First 12 episodes
- 2.5 points: >=6 life-or-death level events
- 1.5 points: >=4 events
- 1 point: >=3 events
- 0 points: <3 events

Drama events: kill, death, betray, drug, poison, attack, kidnap, accident, miscarry, expose, 杀, 死, 背叛, 下药, 中毒, 袭击, 绑架, 事故, 流产, 揭露, 曝光

### Motivation Clarity (0/1/2 points) - First 5 episodes
- 2 points: Protagonist motivation clear AND antagonist motivation clear
- 1 point: Only protagonist clear
- 0 points: Neither clear

### Foreshadowing Tension (0/1.5/2.5 points) - Full script
- 2.5 points: Average >=2 per episode
- 1.5 points: Average >=1 per episode
- 0 points: Average <1 per episode

[First 12 episodes sample]
${clip(input.first12Text, 2500)}

[First 5 episodes sample]
${clip(input.first5Text, 2000)}

## Visual Hammer Evaluation (2 points)

Evaluate visual impact scenes in first 12 episodes:
- 2 points: >=5 scenes AND first 3 episodes <=50% of total (well distributed)
- 1.5 points: >=3 scenes
- 1 point: >=1 scene
- 0 points: None

Visual hammer scenes: slap, hit face, kiss, punch, kick, pour water, kneel, propose, reveal identity, luxury car, 巴掌, 打脸, 吻, 打, 踢, 泼水, 下跪, 求婚, 揭露身份, 豪车

[First 3 episodes sample]
${clip(input.first3Text, 1500)}
`.trim()
}

// ==================== L2_STORY: 剧作维度 (增强版，不给统计) ====================

export interface StoryPromptInputEnhanced {
  ep1Sample: string
  epMidSample: string
  epEndSample: string
  protagonistDialogue: string
  antagonistDialogue: string
  emotionScenes: string
  conflictScenes: string
  totalEpisodes: number
}

export function buildStoryPrompt(input: StoryPromptInputEnhanced) {
  return `
You are a short-drama script evaluator. Read and understand the story deeply, then evaluate its craftsmanship.

DO NOT rely on keyword counting. Read the actual text and make qualitative judgments.

## 1) Core Driver Focus (0/4/7/10 points)

Evaluate whether the story's main drive is the relationship line (男女主情感发展):

- 10 points: Relationship line dominates (>=80% of plot focuses on main couple's emotional development)
- 7 points: Relationship line is main but subplot takes 20-40%
- 4 points: Relationship and subplot are balanced (40-60% each)
- 0 points: Subplot dominates or unclear main drive

Read these samples and judge:
[Episode 1 sample]
${clip(input.ep1Sample, 1500)}

[Middle episode sample]
${clip(input.epMidSample, 1500)}

[Final episode sample]
${clip(input.epEndSample, 1500)}

## 2) Character Recognizability (0/2/4 points male + 0/2/4/6 points female = 10 points)

### Male Lead (4 points)
Evaluate distinctiveness based on:
- Job: CEO, president, doctor, general, 总裁, 医生, 将军
- Look: handsome, abs, tall, strong, 帅, 腹肌, 高大
- Personality: cold, gentle, mature, devoted, 冷酷, 温柔, 成熟, 专情
- Behavior: protect, dominate, spoil, 保护, 霸道, 宠溺
- Dialogue style: my woman, stay with me, 我的女人, 跟我走

- 4 points: >=4 tags covering >=3 types
- 2 points: >=2 tags
- 0 points: <2 tags or generic

[Protagonist dialogue sample]
${clip(input.protagonistDialogue, 1200)}

### Female Lead (6 points)
Evaluate distinctiveness based on:
- Identity: CEO, heiress, daughter of, 总裁, 千金
- Look: beautiful, innocent, elegant, 美丽, 清纯, 优雅
- Personality: strong, smart, decisive, 坚强, 聪明, 果断, 独立
- Growth arc: revenge, rise, transform, 复仇, 崛起, 蜕变
- Action ability: fight back, take action, stand up, 反击, 行动, 站起来

- 6 points: >=5 tags covering >=4 types
- 4 points: >=3 tags covering >=3 types
- 2 points: >=2 tags
- 0 points: <2 tags or generic

[Antagonist dialogue sample]
${clip(input.antagonistDialogue, 1200)}

## 3) Emotion Density (0/2/4/6 points)

Evaluate emotional intensity throughout the script:

Read these emotion scenes and assess density:
[Emotion scenes sample]
${clip(input.emotionScenes, 2000)}

- 6 points: High emotional density (>=1.5% emotion words), very moving
- 4 points: Moderate density (>=1.0%), engaging
- 2 points: Low density (>=0.5%), somewhat flat
- 0 points: Very low density (<0.5%), emotionally detached

Emotion indicators: cry, tears, scream, furious, shocked, panic, heartbreak, pain, 哭, 泪, 尖叫, 愤怒, 震惊, 恐慌, 心碎, 痛苦

## 4) Conflict/Twist Density (0.5-2.5 points conflict + 0-1.5 points twist = 4 points)

### Conflict Density (2.5 points)
[Conflict scenes sample]
${clip(input.conflictScenes, 2000)}

- 2.5 points: High conflict density (>=2 conflicts per episode on average), intense
- 1.5 points: Moderate (>=1 per episode)
- 0.5 points: Low (<1 per episode)

Conflict indicators: slap, punch, grab, push, kick, argue, fight, confront, furious, threaten, 打, 抓, 推, 踢, 争吵, 吵架, 对峙, 威胁

### Twist Density (1.5 points)
Evaluate major plot twists (especially identity/truth reveals):

- 1.5 points: Major twist every ~4 episodes, well-paced surprises
- 1 point: Twist every ~6 episodes
- 0.5 points: Twist every ~8 episodes
- 0 points: Few twists, predictable plot

Twist indicators: actually, truth is, reveal, expose, discover, 原来, 真相, 揭露, 发现
Major twists involve: identity, truth, secret, 身份, 真相, 秘密

${ENGLISH_OUTPUT_POLICY}

Total episodes: ${input.totalEpisodes}
`.trim()
}

// ==================== L2_MARKET_POTENTIAL: 市场维度+改造潜力 (合并版) ====================

export interface MarketPotentialPromptInput {
  // 市场维度输入
  mechanismSamples: string
  audienceSamples: string
  detectedGenre: string
  totalEpisodes: number
  localizationCount: number

  // 改造潜力输入
  payScore: number
  storyScore: number
  marketScore: number
  total110: number
  issueLines: string
  recoverable: number
  coreDriverScore: number
  characterScore: number
}

export function buildMarketPotentialPrompt(input: MarketPotentialPromptInput) {
  return `
You are a short-drama script evaluator. Evaluate market fit and adaptation potential.

## PART 1: Market Dimension (20 points)

### 1) Hit Mechanism Recognition (0/1/3/5 points)

Identify story mechanisms by reading the text, not keyword counting:

**Identity Mechanisms:**
- Hidden identity: character hiding true identity
- Identity reversal: revealed to be someone important
- Dual identity: leading double life
- Reborn/Time travel: second chance storyline

**Relationship Mechanisms:**
- Contract relationship: fake/pretend arrangement
- Substitute: replacing someone else
- Flash marriage: marrying quickly

**Conflict Mechanisms:**
- Revenge: getting back at betrayal
- Angst: misunderstandings, sacrifices
- Face-slapping: proving doubters wrong
- Rise up: transformation, zero to hero

- 5 points: >=3 distinct mechanisms combined creatively
- 3 points: 2 mechanisms
- 1 point: 1 mechanism
- 0 points: No clear mechanism

[Mechanism sample text - read and identify]
${clip(input.mechanismSamples, 3000)}

### 2) Cultural Taboo (0/5 points)

**WARNING: Red line content = automatic 0 points**
Red line: rape, incest, pedophile, child abuse, 强奸, 乱伦, 恋童, 虐童

Language issues (deduct from 5):
- Each vulgar word: -0.05 points
- Vulgar words: damn, hell, shit, fuck, bitch, bastard, ass, 他妈的, 操, 贱人, 混蛋

Current localization count detected: ${input.localizationCount}

### 3) Localization Density (0/1/3/5 points)

Evaluate local cultural references:
- 5 points: Strong local flavor (>=0.2 per episode average)
- 3 points: Moderate (>=0.1 per episode)
- 1 point: Some references (>=0.04 per episode)
- 0 points: Generic, no local flavor

Localization elements: Thanksgiving, Christmas, Halloween, Super Bowl, Prom, college, graduation, 感恩节, 圣诞, 万圣节, 大学, 毕业

### 4) Audience Match (0/2/3/5 points)

#### Genre-Audience Fit (3 points)
Current genre detected: ${input.detectedGenre}

Check for mismatched elements:
- Revenge drama shouldn't have: sorority, graduation, dorm, 姐妹会, 毕业舞会, 宿舍
- YA drama shouldn't have: mortgage, mother-in-law, 房贷, 婆婆, 二胎
- CEO romance shouldn't have: campus, school club, 校园, 学生社团
- Family drama shouldn't have: campus, first love, 校园, 初恋

- 3 points: 0 mismatched elements
- 2 points: 1-2 mismatches
- 1 point: 3-4 mismatches
- 0 points: >=5 mismatches

#### Audience Purity & Span (2 points)
- 2 points: Core audience >=75% AND span >=10%
- 1.5 points: Core >=75% but no span
- 1 point: Core >=60%
- 0 points: Core <60%

[Audience sample text]
${clip(input.audienceSamples, 2500)}

## PART 2: Adaptation Potential (10 points)

Current scores:
- Monetization: ${input.payScore.toFixed(2)}/50
- Story: ${input.storyScore.toFixed(2)}/30
- Market: ${input.marketScore.toFixed(2)}/20
- Total: ${input.total110.toFixed(2)}/110

Issues identified:
${input.issueLines}

### 1) Repair Cost (0/1/2/3 points)

Classify primary issue type and estimate effort:
- **Language**: Vulgar words, localization issues -> <3 hours
- **Hook**: Paywall hooks weak, episodic hooks poor -> 3-10 hours
- **Structure**: Paywall position wrong, density issues -> 1-3 days
- **Core**: Story mechanism unclear, characters flat -> >10 days

- 3 points: <3h (language only)
- 2 points: 3-10h (language + hook)
- 1 point: 1-3d (structure issues)
- 0 points: >10d (core issues)

### 2) Expected Gain (0/1/2/3 points)

Calculate recoverable points: ${input.recoverable.toFixed(2)}

- 3 points: Recoverable >=15 points
- 2 points: Recoverable >=8 points
- 1 point: Recoverable >=5 points
- 0 points: Recoverable <5 points

### 3) Story Core Quality (0/1/2/3 points)

Based on:
- Story dimension score rate: ${(input.storyScore / 30 * 100).toFixed(1)}%
- Core driver score: ${input.coreDriverScore}/10
- Character score: ${input.characterScore}/10

- 3 points: Story >=90% AND Driver >=8 AND Character >=8
- 2 points: Story >=80% AND Driver >=7 AND Character >=7
- 1 point: Story >=70% AND Driver >=6 AND Character >=6
- 0 points: Below thresholds

### 4) Market Scarcity (0.5 points fixed)

No database available -> Fixed 0.5 points with reason "N/A: no dataset"

${ENGLISH_OUTPUT_POLICY}

Total episodes: ${input.totalEpisodes}
`.trim()
}

function clip(text: string, limit: number) {
  const value = text.trim()
  if (value.length <= limit)
    return value
  return `${value.slice(0, limit)}\n...[truncated]`
}
