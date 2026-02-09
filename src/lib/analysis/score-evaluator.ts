import type { AnalysisLanguage, AnalysisTokenizer } from '@/lib/analysis/detect-language'
import type { ParsedEpisode } from '@/lib/analysis/input-contract'
import type { AnalysisScoreResult, AuditItem } from '@/lib/analysis/score-types'
import type { EpisodeWindows } from '@/lib/analysis/window-builder'
import {
  booleanEvidence,
  collectMatchedTerms,
  countTerms,
  detectAudienceProfile,
  detectGenre,
  detectMechanisms,
  estimateTotalWords,
  evaluatePrimaryHook,
  evaluateRoleTagScore,
  evaluateSecondaryHook,
  evidenceFromCounts,
  inferPrimaryIssueType,
  makeAuditItem,
  repairCostReason,
  scoreOf,
  secondaryPaywallRange,
  sumByPrefix,
} from '@/lib/analysis/score-evaluator-helpers'
import { pickKeywords, SCORING_KEYWORDS } from '@/lib/analysis/score-keywords'
import { aggregateScores, applyRedlineOverride, toAnalysisScoreResult } from '@/lib/analysis/score-types'

interface EvaluateScoreInput {
  episodes: ParsedEpisode[]
  windows: EpisodeWindows[]
  language: AnalysisLanguage
  tokenizer: AnalysisTokenizer
  totalWordsFromL1: number
  declaredTotalEpisodes?: number
  inferredTotalEpisodes?: number
  totalEpisodesForScoring?: number
  observedEpisodeCount?: number
  completionState?: 'completed' | 'incomplete' | 'unknown'
}

interface MarketContext {
  localizationCount: number
  taboo: {
    vulgarCount: number
    vulgarPenalty: number
    redlineHit: boolean
    redlineEvidence: string[]
  }
}

/**
 * 主评分入口（确定性版本）
 * - 目标：先把冻结口径落到可运行代码，不依赖数据库与服务端
 * - 说明：后续可用 AI 结构化输出替换部分子项计算，但结果结构保持不变
 */
export function evaluateDeterministicScore(input: EvaluateScoreInput): AnalysisScoreResult {
  const { episodes, windows, language, tokenizer, totalWordsFromL1 } = input
  const episodeMap = new Map(episodes.map(ep => [ep.number, ep]))
  const windowMap = new Map(windows.map(window => [window.episode, window]))
  const fullScript = episodes.map(ep => ep.text).join('\n')
  const observedEpisodeCount = input.observedEpisodeCount ?? episodes.length
  const totalEpisodesForScoring
    = input.totalEpisodesForScoring
      ?? input.declaredTotalEpisodes
      ?? input.inferredTotalEpisodes
      ?? observedEpisodeCount
  const totalWords = Math.max(1, totalWordsFromL1 || estimateTotalWords(episodes, tokenizer))
  const paywallEpisodes = episodes.filter(ep => ep.paywallCount > 0).map(ep => ep.number).sort((a, b) => a - b)
  const firstPaywall = paywallEpisodes[0] ?? null
  const secondPaywall = paywallEpisodes[1] ?? null

  const auditItems: AuditItem[] = []

  // ===== 1.1 开篇吸引力 =====
  auditItems.push(...evaluateOpening(episodeMap, language))

  // ===== 1.2 付费卡点精准度 =====
  auditItems.push(...evaluatePrimaryPaywall(firstPaywall, episodeMap, windowMap, language))
  auditItems.push(
    ...evaluateSecondaryPaywall(
      secondPaywall,
      totalEpisodesForScoring,
      observedEpisodeCount,
      episodeMap,
      windowMap,
      language,
    ),
  )

  // ===== 1.3 / 1.4 / 1.5 =====
  auditItems.push(evaluateEpisodicHooks(observedEpisodeCount, episodeMap, language))
  auditItems.push(...evaluateDensityAndVisual(observedEpisodeCount, episodes, language))

  // ===== 2.1 ~ 2.4 剧作 =====
  auditItems.push(...evaluateStoryDimension(observedEpisodeCount, fullScript, language, totalWords))

  // ===== 3.1 ~ 3.4 市场 =====
  const marketResult = evaluateMarketDimension(observedEpisodeCount, fullScript, language)
  auditItems.push(...marketResult.items)

  // ===== 4.1 ~ 4.4 改造潜力 =====
  auditItems.push(...evaluatePotentialDimension(auditItems))

  // 先按正常规则聚合，再应用红线覆盖
  const breakdown = aggregateScores(auditItems)
  const finalBreakdown = applyRedlineOverride(breakdown, marketResult.context.taboo.redlineHit)

  return toAnalysisScoreResult(
    auditItems,
    finalBreakdown,
    marketResult.context.taboo.redlineHit,
    marketResult.context.taboo.redlineEvidence,
  )
}

/**
 * 1.1 开篇吸引力（10 = 男主5 + 女主5）
 */
function evaluateOpening(
  episodeMap: Map<number, ParsedEpisode>,
  language: AnalysisLanguage,
): AuditItem[] {
  const select = (dict: { en: string[], zh: string[] }) => pickKeywords(dict, language)
  const ep1Text = episodeMap.get(1)?.text ?? ''
  const ep2Text = episodeMap.get(2)?.text ?? ''
  const ep3Text = episodeMap.get(3)?.text ?? ''
  const ep4PlusText = Array.from(episodeMap.entries())
    .filter(([number]) => number >= 4)
    .map(([, episode]) => episode.text)
    .join('\n')

  const maleVisual = collectMatchedTerms(ep2Text.slice(0, 1000), select(SCORING_KEYWORDS.opening.maleVisual), language)
  const malePersona = collectMatchedTerms(ep2Text.slice(0, 1000), select(SCORING_KEYWORDS.opening.malePersona), language)
  const maleEp2Or3Hits = collectMatchedTerms(
    `${ep2Text.slice(0, 1000)}\n${ep3Text.slice(0, 1000)}`,
    [...select(SCORING_KEYWORDS.opening.maleVisual), ...select(SCORING_KEYWORDS.opening.malePersona)],
    language,
  )
  const maleAfterEp3Hits = collectMatchedTerms(
    ep4PlusText.slice(0, 3000),
    [...select(SCORING_KEYWORDS.opening.maleVisual), ...select(SCORING_KEYWORDS.opening.malePersona)],
    language,
  )

  let maleScore = 0
  let maleReason = 'No stable male-lead attractive-entry signal found in the first 3 episodes.'
  if (maleVisual.length >= 2 && malePersona.length >= 1) {
    maleScore = 5
    maleReason = 'Episode 2 opening (first 1000 chars) meets visual/persona tag thresholds.'
  }
  else if (maleEp2Or3Hits.length >= 1) {
    maleScore = 3
    maleReason = 'Partial male-lead visual/persona signals detected in Episodes 2-3.'
  }
  else if (maleAfterEp3Hits.length >= 1) {
    maleScore = 1
    maleReason = 'Male-lead signal appears after Episode 3, scored as late entry.'
  }

  const femaleConflict = collectMatchedTerms(ep1Text.slice(0, 1500), select(SCORING_KEYWORDS.opening.femaleConflict), language)
  const femaleMotivation = collectMatchedTerms(ep1Text.slice(0, 1500), select(SCORING_KEYWORDS.opening.femaleMotivation), language)
  const femalePresence = collectMatchedTerms(ep1Text.slice(0, 1200), select(SCORING_KEYWORDS.opening.femalePresence), language)

  let femaleScore = 0
  let femaleReason = 'No story-driven female-lead entry detected in Episode 1.'
  if (femaleConflict.length > 0 && femaleMotivation.length > 0) {
    femaleScore = 5
    femaleReason = 'Episode 1 contains both conflict and motivation evidence.'
  }
  else if (femaleConflict.length > 0) {
    femaleScore = 3
    femaleReason = 'Episode 1 has conflict but motivation is under-expressed.'
  }
  else if (femalePresence.length > 0) {
    femaleScore = 1
    femaleReason = 'Episode 1 has character presence only, with weak story propulsion.'
  }

  return [
    makeAuditItem('pay.opening.male_lead', maleScore, 5, maleReason, [...maleVisual, ...malePersona]),
    makeAuditItem('pay.opening.female_lead', femaleScore, 5, femaleReason, [...femaleConflict, ...femaleMotivation]),
  ]
}

/**
 * 1.2 第一付费点（14）
 */
function evaluatePrimaryPaywall(
  paywallEpisode: number | null,
  episodeMap: Map<number, ParsedEpisode>,
  windowMap: Map<number, EpisodeWindows>,
  language: AnalysisLanguage,
): AuditItem[] {
  const select = (dict: { en: string[], zh: string[] }) => pickKeywords(dict, language)
  if (paywallEpisode == null) {
    return [
      makeAuditItem('pay.paywall.primary.position', 0, 2, 'Primary paywall not detected.', []),
      makeAuditItem('pay.paywall.primary.previous', 0, 4, 'Primary paywall not detected.', []),
      makeAuditItem('pay.paywall.primary.hook', 0, 5, 'Primary paywall not detected.', []),
      makeAuditItem('pay.paywall.primary.next', 0, 3, 'Primary paywall not detected.', []),
    ]
  }

  // 位置规则：4-9 / 8-14 / 11-17 命中即 2 分
  const validRanges: Array<[number, number]> = [[4, 9], [8, 14], [11, 17]]
  const inRange = validRanges.some(([start, end]) => paywallEpisode >= start && paywallEpisode <= end)
  const positionReason = inRange
    ? `Episode ${paywallEpisode} falls within the valid primary-paywall range.`
    : `Episode ${paywallEpisode} is outside the valid primary-paywall range.`

  const previousText = episodeMap.get(paywallEpisode - 1)?.text ?? ''
  const previousPlot = countTerms(previousText, select(SCORING_KEYWORDS.paywall.plotDensity), language)
  const previousEmotion = countTerms(previousText, select(SCORING_KEYWORDS.paywall.emotionalPeak), language)
  const previousForeshadow = countTerms(previousText, select(SCORING_KEYWORDS.paywall.foreshadow), language)
  const previousSatisfied = Number(previousPlot >= 2) + Number(previousEmotion >= 2) + Number(previousForeshadow >= 2)
  const previousScore = previousSatisfied === 3 ? 4 : previousSatisfied === 2 ? 3 : previousSatisfied === 1 ? 2 : 0

  const paywallContext = windowMap.get(paywallEpisode)?.paywall_context ?? ''
  const primaryHook = evaluatePrimaryHook(paywallContext, language)

  const nextHead = episodeMap.get(paywallEpisode + 1)?.text.slice(0, 1800) ?? ''
  const hasImmediateAnswer = countTerms(nextHead, select(SCORING_KEYWORDS.paywall.nextAnswer), language) >= 1
  const hasNewPlot = countTerms(nextHead, select(SCORING_KEYWORDS.paywall.nextNewPlot), language) >= 1
  const hasNewHook = countTerms(nextHead, select(SCORING_KEYWORDS.paywall.nextNewHook), language) >= 1
  const nextSatisfied = Number(hasImmediateAnswer) + Number(hasNewPlot) + Number(hasNewHook)
  const nextScore = nextSatisfied === 3 ? 3 : nextSatisfied === 2 ? 2 : nextSatisfied === 1 ? 1 : 0

  return [
    makeAuditItem(
      'pay.paywall.primary.position',
      inRange ? 2 : 0,
      2,
      positionReason,
      [`Episode ${paywallEpisode}`],
    ),
    makeAuditItem(
      'pay.paywall.primary.previous',
      previousScore,
      4,
      `Previous episode satisfies ${previousSatisfied}/3 quality conditions.`,
      evidenceFromCounts({
        PlotDensity: previousPlot,
        EmotionalPeak: previousEmotion,
        Foreshadowing: previousForeshadow,
      }),
    ),
    makeAuditItem(
      'pay.paywall.primary.hook',
      primaryHook.score,
      5,
      `Hook type: ${primaryHook.type}`,
      primaryHook.evidence,
    ),
    makeAuditItem(
      'pay.paywall.primary.next',
      nextScore,
      3,
      `Next episode satisfies ${nextSatisfied}/3 pull-through conditions.`,
      booleanEvidence({
        ImmediateAnswer: hasImmediateAnswer,
        NewPlot: hasNewPlot,
        NewHook: hasNewHook,
      }),
    ),
  ]
}

/**
 * 1.2 第二付费点（10）
 * - <30 集自动满分
 * - >=30 集且无第二付费点时记 0
 * - 无 escalation 时 hook 上限 1
 */
function evaluateSecondaryPaywall(
  paywallEpisode: number | null,
  totalEpisodesForScoring: number,
  observedEpisodeCount: number,
  episodeMap: Map<number, ParsedEpisode>,
  windowMap: Map<number, EpisodeWindows>,
  language: AnalysisLanguage,
): AuditItem[] {
  const select = (dict: { en: string[], zh: string[] }) => pickKeywords(dict, language)
  if (totalEpisodesForScoring < 30) {
    return [
      makeAuditItem('pay.paywall.secondary.position', 2, 2, 'TOTAL_EPISODES < 30, auto full score.', []),
      makeAuditItem('pay.paywall.secondary.previous', 3, 3, 'TOTAL_EPISODES < 30, auto full score.', []),
      makeAuditItem('pay.paywall.secondary.hook', 3, 3, 'TOTAL_EPISODES < 30, auto full score.', []),
      makeAuditItem('pay.paywall.secondary.next', 2, 2, 'TOTAL_EPISODES < 30, auto full score.', []),
    ]
  }

  const range = secondaryPaywallRange(totalEpisodesForScoring)
  if (range == null) {
    return [
      makeAuditItem(
        'pay.paywall.secondary.position',
        0,
        2,
        `No secondary-paywall range is defined for TOTAL_EPISODES=${totalEpisodesForScoring}.`,
        [`TOTAL_EPISODES=${totalEpisodesForScoring}`],
      ),
      makeAuditItem(
        'pay.paywall.secondary.previous',
        0,
        3,
        `No secondary-paywall range is defined for TOTAL_EPISODES=${totalEpisodesForScoring}.`,
        [`TOTAL_EPISODES=${totalEpisodesForScoring}`],
      ),
      makeAuditItem(
        'pay.paywall.secondary.hook',
        0,
        3,
        `No secondary-paywall range is defined for TOTAL_EPISODES=${totalEpisodesForScoring}.`,
        [`TOTAL_EPISODES=${totalEpisodesForScoring}`],
      ),
      makeAuditItem(
        'pay.paywall.secondary.next',
        0,
        2,
        `No secondary-paywall range is defined for TOTAL_EPISODES=${totalEpisodesForScoring}.`,
        [`TOTAL_EPISODES=${totalEpisodesForScoring}`],
      ),
    ]
  }

  if (observedEpisodeCount < range[0]) {
    const reason = `Secondary paywall is pending evaluation: observed episodes ${observedEpisodeCount} do not reach range start ${range[0]} (declared/scoring total ${totalEpisodesForScoring}).`
    const evidence = [
      `observedEpisodes=${observedEpisodeCount}`,
      `rangeStart=${range[0]}`,
      `scoringTotal=${totalEpisodesForScoring}`,
    ]
    return [
      makeAuditItem('pay.paywall.secondary.position', 1, 2, reason, evidence, 'warn', 'low_sample'),
      makeAuditItem('pay.paywall.secondary.previous', 1, 3, reason, evidence, 'warn', 'low_sample'),
      makeAuditItem('pay.paywall.secondary.hook', 1, 3, reason, evidence, 'warn', 'low_sample'),
      makeAuditItem('pay.paywall.secondary.next', 1, 2, reason, evidence, 'warn', 'low_sample'),
    ]
  }

  if (paywallEpisode == null) {
    return [
      makeAuditItem('pay.paywall.secondary.position', 0, 2, 'TOTAL_EPISODES >= 30 but second paywall not detected.', []),
      makeAuditItem('pay.paywall.secondary.previous', 0, 3, 'TOTAL_EPISODES >= 30 but second paywall not detected.', []),
      makeAuditItem('pay.paywall.secondary.hook', 0, 3, 'TOTAL_EPISODES >= 30 but second paywall not detected.', []),
      makeAuditItem('pay.paywall.secondary.next', 0, 2, 'TOTAL_EPISODES >= 30 but second paywall not detected.', []),
    ]
  }

  const inRange = paywallEpisode >= range[0] && paywallEpisode <= range[1]

  const previousText = episodeMap.get(paywallEpisode - 1)?.text ?? ''
  const previousPlot = countTerms(previousText, select(SCORING_KEYWORDS.paywall.plotDensity), language)
  const previousEmotion = countTerms(previousText, select(SCORING_KEYWORDS.paywall.emotionalPeak), language)
  const previousForeshadow = countTerms(previousText, select(SCORING_KEYWORDS.paywall.foreshadow), language)
  const previousSatisfied = Number(previousPlot >= 2) + Number(previousEmotion >= 2) + Number(previousForeshadow >= 2)
  const previousScore = previousSatisfied >= 3 ? 3 : previousSatisfied === 2 ? 2 : previousSatisfied === 1 ? 1 : 0

  const paywallContext = windowMap.get(paywallEpisode)?.paywall_context ?? ''
  const secondaryHookRaw = evaluateSecondaryHook(paywallContext, language)
  const hasEscalation = countTerms(paywallContext, select(SCORING_KEYWORDS.paywall.escalation), language) > 0
  const secondaryHookScore = hasEscalation ? secondaryHookRaw.score : Math.min(secondaryHookRaw.score, 1)

  const nextHead = episodeMap.get(paywallEpisode + 1)?.text.slice(0, 1800) ?? ''
  const hasImmediateAnswer = countTerms(nextHead, select(SCORING_KEYWORDS.paywall.nextAnswer), language) >= 1
  const hasNewPlot = countTerms(nextHead, select(SCORING_KEYWORDS.paywall.nextNewPlot), language) >= 1
  const hasNewHook = countTerms(nextHead, select(SCORING_KEYWORDS.paywall.nextNewHook), language) >= 1
  const nextSatisfied = Number(hasImmediateAnswer) + Number(hasNewPlot) + Number(hasNewHook)
  const nextScore = nextSatisfied >= 2 ? 2 : nextSatisfied === 1 ? 1 : 0

  return [
    makeAuditItem(
      'pay.paywall.secondary.position',
      inRange ? 2 : 0,
      2,
      inRange
        ? `Episode ${paywallEpisode} falls within secondary-paywall range ${range?.[0]}-${range?.[1]}.`
        : `Episode ${paywallEpisode} is outside secondary-paywall range ${range?.[0]}-${range?.[1]}.`,
      [`Episode ${paywallEpisode}`],
    ),
    makeAuditItem(
      'pay.paywall.secondary.previous',
      previousScore,
      3,
      `Previous episode of secondary paywall satisfies ${previousSatisfied}/3 quality conditions.`,
      evidenceFromCounts({
        PlotDensity: previousPlot,
        EmotionalPeak: previousEmotion,
        Foreshadowing: previousForeshadow,
      }),
    ),
    makeAuditItem(
      'pay.paywall.secondary.hook',
      secondaryHookScore,
      3,
      hasEscalation
        ? `Hook type: ${secondaryHookRaw.type}, escalation signal detected.`
        : `Hook type: ${secondaryHookRaw.type}, no escalation signal, capped at 1 by rule.`,
      secondaryHookRaw.evidence,
    ),
    makeAuditItem(
      'pay.paywall.secondary.next',
      nextScore,
      2,
      `Next episode after secondary paywall satisfies ${nextSatisfied}/3 pull-through conditions.`,
      booleanEvidence({
        ImmediateAnswer: hasImmediateAnswer,
        NewPlot: hasNewPlot,
        NewHook: hasNewHook,
      }),
    ),
  ]
}

/**
 * 1.3 单集卡点（7）
 * 冻结公式：
 * - score_1_3 = (raw_sum / available_count) * 4
 * - final = min(score_1_3, 7)
 * - available_count < 3 时 confidence=low_sample
 */
function evaluateEpisodicHooks(
  totalEpisodes: number,
  episodeMap: Map<number, ParsedEpisode>,
  language: AnalysisLanguage,
): AuditItem {
  const targets = [2, 4, 8, 10]
  const suspenseWords = pickKeywords(SCORING_KEYWORDS.episodicHooks.suspense, language)
  const predictableWords = pickKeywords(SCORING_KEYWORDS.episodicHooks.predictable, language)

  const availableEpisodes = targets.filter(ep => ep <= totalEpisodes)
  if (availableEpisodes.length === 0) {
    return makeAuditItem(
      'pay.hooks.episodic',
      0,
      7,
      'No available sampled episodes.',
      [],
      'warn',
      'low_sample',
    )
  }

  let rawSum = 0
  const evidence: string[] = []

  for (const episodeNumber of availableEpisodes) {
    const tail = (episodeMap.get(episodeNumber)?.text ?? '').slice(-200)
    const hasSuspense = countTerms(tail, suspenseWords, language) > 0
    const hasPredictable = countTerms(tail, predictableWords, language) > 0
    const singleScore = hasSuspense && hasPredictable ? 1.75 : hasSuspense || hasPredictable ? 1 : 0
    rawSum += singleScore
    evidence.push(`Ep${episodeNumber}: ${singleScore}`)
  }

  const normalized = (rawSum / availableEpisodes.length) * 4
  const finalScore = Math.min(normalized, 7)

  return makeAuditItem(
    'pay.hooks.episodic',
    finalScore,
    7,
    `Sampled ${availableEpisodes.length} episodes. Raw sum ${rawSum.toFixed(2)}, normalized ${finalScore.toFixed(2)}.`,
    evidence,
    finalScore >= 4 ? 'ok' : 'warn',
    availableEpisodes.length < 3 ? 'low_sample' : 'normal',
  )
}

/**
 * 1.4 看点密度 + 1.5 视觉锤
 */
function evaluateDensityAndVisual(
  totalEpisodes: number,
  episodes: ParsedEpisode[],
  language: AnalysisLanguage,
): AuditItem[] {
  const select = (dict: { en: string[], zh: string[] }) => pickKeywords(dict, language)
  const first12 = episodes.filter(ep => ep.number <= 12).map(ep => ep.text).join('\n')
  const first5 = episodes.filter(ep => ep.number <= 5).map(ep => ep.text).join('\n')
  const first3 = episodes.filter(ep => ep.number <= 3).map(ep => ep.text).join('\n')
  const full = episodes.map(ep => ep.text).join('\n')

  const dramaCount = countTerms(first12, select(SCORING_KEYWORDS.density.dramaEvents), language)
  const dramaScore = dramaCount >= 6 ? 2.5 : dramaCount >= 4 ? 1.5 : dramaCount >= 3 ? 1 : 0

  const motivationCount = countTerms(first5, select(SCORING_KEYWORDS.density.motivation), language)
  const antagonistMarkerCount = countTerms(first5, select(SCORING_KEYWORDS.density.antagonistMarkers), language)
  const protagonistClear = motivationCount >= 2
  const antagonistClear = protagonistClear && antagonistMarkerCount >= 1
  const motivationScore = protagonistClear && antagonistClear ? 2 : protagonistClear ? 1 : 0

  const foreshadowCount = countTerms(full, select(SCORING_KEYWORDS.paywall.foreshadow), language)
  const foreshadowAvg = foreshadowCount / Math.max(1, totalEpisodes)
  const foreshadowScore = foreshadowAvg >= 2 ? 2.5 : foreshadowAvg >= 1 ? 1.5 : 0

  const visualTotal = countTerms(first12, select(SCORING_KEYWORDS.density.visualHammer), language)
  const visualFirst3 = countTerms(first3, select(SCORING_KEYWORDS.density.visualHammer), language)
  const visualRatio = visualTotal === 0 ? 0 : visualFirst3 / visualTotal
  const visualScore = visualTotal >= 5 && visualRatio <= 0.5 ? 2 : visualTotal >= 3 ? 1.5 : visualTotal >= 1 ? 1 : 0

  return [
    makeAuditItem('pay.density.drama', dramaScore, 2.5, `Drama event count ${dramaCount}`, [`count=${dramaCount}`]),
    makeAuditItem(
      'pay.density.motivation',
      motivationScore,
      2,
      `Protagonist motivation is ${protagonistClear ? 'clear' : 'unclear'}; antagonist motivation is ${antagonistClear ? 'clear' : 'unclear'}.`,
      evidenceFromCounts({ MotivationTerms: motivationCount, AntagonistMarkers: antagonistMarkerCount }),
    ),
    makeAuditItem(
      'pay.density.foreshadow',
      foreshadowScore,
      2.5,
      `Foreshadow density ${foreshadowAvg.toFixed(2)} per episode.`,
      [`total=${foreshadowCount}`, `episodes=${totalEpisodes}`],
    ),
    makeAuditItem(
      'pay.visual_hammer',
      visualScore,
      2,
      `Visual hammer total ${visualTotal}, first-3 ratio ${(visualRatio * 100).toFixed(1)}%.`,
      [`first12=${visualTotal}`, `first3=${visualFirst3}`],
    ),
  ]
}

/**
 * 2.1 ~ 2.4 剧作维度（30）
 */
function evaluateStoryDimension(
  totalEpisodes: number,
  fullScript: string,
  language: AnalysisLanguage,
  totalWords: number,
): AuditItem[] {
  const select = (dict: { en: string[], zh: string[] }) => pickKeywords(dict, language)
  const relationshipCount = countTerms(fullScript, select(SCORING_KEYWORDS.story.relationship), language)
  const subplotCount = countTerms(fullScript, select(SCORING_KEYWORDS.story.subplot), language)
  const relationshipRatio = relationshipCount / Math.max(1, relationshipCount + subplotCount)
  const coreDriverScore = relationshipRatio >= 0.8 ? 10 : relationshipRatio >= 0.6 ? 7 : relationshipRatio >= 0.4 ? 4 : 0

  const maleTag = evaluateRoleTagScore(fullScript, SCORING_KEYWORDS.story.maleTagGroups, language)
  const maleScore = maleTag.uniqueTagCount >= 4 && maleTag.typeCount >= 3
    ? 4
    : maleTag.uniqueTagCount >= 2 ? 2 : 0

  const femaleTag = evaluateRoleTagScore(fullScript, SCORING_KEYWORDS.story.femaleTagGroups, language)
  const femaleScore = femaleTag.uniqueTagCount >= 5 && femaleTag.typeCount >= 4
    ? 6
    : femaleTag.uniqueTagCount >= 3 && femaleTag.typeCount >= 3
      ? 4
      : femaleTag.uniqueTagCount >= 2 ? 2 : 0

  const emotionCount = countTerms(fullScript, select(SCORING_KEYWORDS.story.emotion), language)
  const emotionDensity = (emotionCount / Math.max(1, totalWords)) * 100
  const emotionScore = emotionDensity >= 1.5 ? 6 : emotionDensity >= 1.0 ? 4 : emotionDensity >= 0.5 ? 2 : 0

  const conflictCount = countTerms(fullScript, select(SCORING_KEYWORDS.story.conflict), language)
  const conflictAvg = conflictCount / Math.max(1, totalEpisodes)
  const conflictScore = conflictAvg >= 2 ? 2.5 : conflictAvg >= 1 ? 1.5 : 0.5

  const twistCount = countTerms(fullScript, select(SCORING_KEYWORDS.story.twist), language)
  const twistIdentity = countTerms(fullScript, select(SCORING_KEYWORDS.story.twistIdentity), language)
  const majorTwistCount = twistCount + Math.floor(twistIdentity * 0.5)
  const twistScore = majorTwistCount >= totalEpisodes / 4
    ? 1.5
    : majorTwistCount >= totalEpisodes / 6
      ? 1
      : majorTwistCount >= totalEpisodes / 8 ? 0.5 : 0

  return [
    makeAuditItem(
      'story.core_driver',
      coreDriverScore,
      10,
      `Relationship-line ratio ${(relationshipRatio * 100).toFixed(1)}%.`,
      evidenceFromCounts({ RelationshipTerms: relationshipCount, SubplotTerms: subplotCount }),
    ),
    makeAuditItem(
      'story.character.male',
      maleScore,
      4,
      `Male-lead tags: ${maleTag.uniqueTagCount}, type coverage: ${maleTag.typeCount}.`,
      maleTag.sampleTags,
    ),
    makeAuditItem(
      'story.character.female',
      femaleScore,
      6,
      `Female-lead tags: ${femaleTag.uniqueTagCount}, type coverage: ${femaleTag.typeCount}.`,
      femaleTag.sampleTags,
    ),
    makeAuditItem(
      'story.emotion_density',
      emotionScore,
      6,
      `Emotion density ${emotionDensity.toFixed(2)}%.`,
      evidenceFromCounts({ EmotionHits: emotionCount, TotalWords: totalWords }),
    ),
    makeAuditItem(
      'story.conflict',
      conflictScore,
      2.5,
      `Conflict density ${conflictAvg.toFixed(2)} per episode.`,
      [`count=${conflictCount}`, `episodes=${totalEpisodes}`],
    ),
    makeAuditItem(
      'story.twist',
      twistScore,
      1.5,
      `Twist strength ${majorTwistCount} (twist=${twistCount}, identity=${twistIdentity}).`,
      [`majorTwist=${majorTwistCount}`],
    ),
  ]
}

/**
 * 3.1 ~ 3.4 市场维度（20）
 */
function evaluateMarketDimension(
  totalEpisodes: number,
  fullScript: string,
  language: AnalysisLanguage,
): { items: AuditItem[], context: MarketContext } {
  const select = (dict: { en: string[], zh: string[] }) => pickKeywords(dict, language)
  const mechanismHits = detectMechanisms(fullScript, language)
  const mechanismScore = mechanismHits.length >= 3 ? 5 : mechanismHits.length === 2 ? 3 : mechanismHits.length === 1 ? 1 : 0

  const vulgarCount = countTerms(fullScript, select(SCORING_KEYWORDS.market.vulgar), language)
  const redlineEvidence = collectMatchedTerms(fullScript, select(SCORING_KEYWORDS.market.redline), language)
  const redlineHit = redlineEvidence.length > 0
  const vulgarPenalty = Math.min(2, vulgarCount * 0.05)
  const tabooScore = redlineHit ? 0 : Math.max(0, 5 - vulgarPenalty)

  const localizationCount = countTerms(fullScript, select(SCORING_KEYWORDS.market.localization), language)
  const localizationAvg = localizationCount / Math.max(1, totalEpisodes)
  const localizationScore = localizationAvg >= 0.2 ? 5 : localizationAvg >= 0.1 ? 3 : localizationAvg >= 0.04 ? 1 : 0

  const detectedGenre = detectGenre(fullScript, language)
  const mismatchTerms = pickKeywords(SCORING_KEYWORDS.market.audienceMismatch[detectedGenre], language)
  const mismatchCount = countTerms(fullScript, mismatchTerms, language)
  const genreAudienceScore = mismatchCount === 0 ? 3 : mismatchCount <= 2 ? 2 : mismatchCount <= 4 ? 1 : 0

  const audienceProfile = detectAudienceProfile(fullScript, language)
  const audiencePurityScore = audienceProfile.coreShare >= 75 && audienceProfile.spanShare >= 10
    ? 2
    : audienceProfile.coreShare >= 75
      ? 1.5
      : audienceProfile.coreShare >= 60 ? 1 : 0

  const items: AuditItem[] = [
    makeAuditItem(
      'market.benchmark',
      mechanismScore,
      5,
      `Detected mechanisms: ${mechanismHits.length}.`,
      mechanismHits.map(hit => `${hit.name}:${hit.hits}`),
    ),
    makeAuditItem(
      'market.taboo',
      tabooScore,
      5,
      redlineHit
        ? 'Redline term detected; cultural taboo score forced to 0.'
        : `Vulgar terms detected: ${vulgarCount}, penalty ${vulgarPenalty.toFixed(2)}.`,
      redlineHit ? redlineEvidence : [`vulgar=${vulgarCount}`],
      redlineHit ? 'fail' : undefined,
    ),
    makeAuditItem(
      'market.localization',
      localizationScore,
      5,
      `Localization density ${localizationAvg.toFixed(3)} per episode.`,
      [`count=${localizationCount}`, `episodes=${totalEpisodes}`],
    ),
    makeAuditItem(
      'market.audience.genre',
      genreAudienceScore,
      3,
      `Detected genre ${detectedGenre}; audience mismatch elements ${mismatchCount}.`,
      [`genre=${detectedGenre}`, `mismatch=${mismatchCount}`],
    ),
    makeAuditItem(
      'market.audience.purity',
      audiencePurityScore,
      2,
      `Core audience share ${audienceProfile.coreShare.toFixed(1)}%, span ${audienceProfile.spanShare.toFixed(1)}%.`,
      audienceProfile.breakdown,
    ),
  ]

  return {
    items,
    context: {
      localizationCount,
      taboo: {
        vulgarCount,
        vulgarPenalty,
        redlineHit,
        redlineEvidence,
      },
    },
  }
}

/**
 * 4.1 ~ 4.4 改造潜力（10）
 */
function evaluatePotentialDimension(itemsBeforePotential: AuditItem[]): AuditItem[] {
  const issueList = itemsBeforePotential.filter(item => item.status !== 'ok')
  const recoverable = issueList.reduce((sum, item) => sum + (item.max - item.score), 0)

  const primaryIssueType = inferPrimaryIssueType(issueList.map(item => item.id))
  const repairCostScore = primaryIssueType === 'language'
    ? 3
    : primaryIssueType === 'hook'
      ? 2
      : primaryIssueType === 'structure'
        ? 1
        : 0

  const expectedGainScore = recoverable >= 15 ? 3 : recoverable >= 8 ? 2 : recoverable >= 5 ? 1 : 0

  const storyScore = sumByPrefix(itemsBeforePotential, 'story.')
  const coreDriver = scoreOf(itemsBeforePotential, 'story.core_driver')
  const characterScore = scoreOf(itemsBeforePotential, 'story.character.male') + scoreOf(itemsBeforePotential, 'story.character.female')
  const storyPercent = (storyScore / 30) * 100
  const storyCoreScore = storyPercent >= 90 && coreDriver >= 8 && characterScore >= 8
    ? 3
    : storyPercent >= 80 && coreDriver >= 7 && characterScore >= 7
      ? 2
      : storyPercent >= 70 && coreDriver >= 6 && characterScore >= 6 ? 1 : 0

  return [
    makeAuditItem(
      'potential.repair_cost',
      repairCostScore,
      3,
      repairCostReason(primaryIssueType),
      [`issues=${issueList.length}`],
    ),
    makeAuditItem(
      'potential.expected_gain',
      expectedGainScore,
      3,
      `Estimated recoverable points ${recoverable.toFixed(2)}.`,
      [`recoverable=${recoverable.toFixed(2)}`],
    ),
    makeAuditItem(
      'potential.story_core',
      storyCoreScore,
      3,
      `Story ratio ${storyPercent.toFixed(1)}%, core driver ${coreDriver}, character recognizability ${characterScore}.`,
      [`story=${storyScore.toFixed(2)}/30`],
    ),
    makeAuditItem(
      'potential.scarcity',
      0.5,
      1,
      'N/A: no dataset',
      ['benchmarkMode=rule-only'],
    ),
  ]
}
