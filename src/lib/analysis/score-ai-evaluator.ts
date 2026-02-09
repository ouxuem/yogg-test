import type { AnalysisLanguage, AnalysisTokenizer } from '@/lib/analysis/detect-language'
import type { ParsedEpisode, ParseIngest } from '@/lib/analysis/input-contract'
import type { MarketPotentialPromptInput, OpeningPromptInputEnhanced, PaywallHooksPromptInput, StoryPromptInputEnhanced } from '@/lib/analysis/score-ai-prompts'
import type {
  MarketPotentialAssessment,
  OpeningAssessment,
  PaywallHooksAssessment,
  StoryAssessment,
} from '@/lib/analysis/score-ai-schemas'
import type { AnalysisScoreResult, AuditItem } from '@/lib/analysis/score-types'
import type { EpisodeWindows } from '@/lib/analysis/window-builder'
import process from 'node:process'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, Output } from 'ai'
import { assertEnglishStructuredOutput } from '@/lib/analysis/ai-language-guard'
import {
  buildMarketPotentialPrompt,
  buildOpeningPrompt,
  buildPaywallHooksPrompt,
  buildStoryPrompt,

} from '@/lib/analysis/score-ai-prompts'
import {
  MarketPotentialAssessmentSchema,
  OpeningAssessmentSchema,
  PaywallHooksAssessmentSchema,
  StoryAssessmentSchema,
} from '@/lib/analysis/score-ai-schemas'
import {
  collectMatchedTerms,
  countTerms,
  detectGenre,
  makeAuditItem,
  secondaryPaywallRange,
} from '@/lib/analysis/score-evaluator-helpers'
import { pickKeywords, SCORING_KEYWORDS } from '@/lib/analysis/score-keywords'
import {
  aggregateScores,
  applyRedlineOverride,
  toAnalysisScoreResult,
} from '@/lib/analysis/score-types'

interface EvaluateAiScoreInput {
  episodes: ParsedEpisode[]
  windows: EpisodeWindows[]
  language: AnalysisLanguage
  tokenizer: AnalysisTokenizer
  totalWordsFromL1: number
  ingest?: ParseIngest
  onProgress?: (update: { completed: number, total: number, label: string }) => void
}

interface AiCallContext {
  episodeMap: Map<number, ParsedEpisode>
  windowMap: Map<number, EpisodeWindows>
  language: AnalysisLanguage
  totalEpisodesForScoring: number
  observedEpisodeCount: number
  declaredTotalEpisodes?: number
  inferredTotalEpisodes: number
  completionState: 'completed' | 'incomplete' | 'unknown'
  fullScript: string
}

const DEFAULT_ENDPOINT = 'https://llm-api.dev.zenai.cc/v1'
const DEFAULT_MODEL = 'gemini-2.5-pro'

/**
 * AI 评分主入口 - AI-Centric版本
 * - 4个L2调用并行：OPENING, PAYWALL_HOOKS, STORY, MARKET_POTENTIAL
 * - 减少L1干预，让AI直接理解文本
 * - 单调用失败时抛出错误
 */
export async function evaluateAiScore(input: EvaluateAiScoreInput): Promise<AnalysisScoreResult> {
  const observedEpisodeCount = input.ingest?.observedEpisodeCount ?? input.episodes.length
  const inferredTotalEpisodes = input.ingest?.inferredTotalEpisodes ?? observedEpisodeCount
  const totalEpisodesForScoring
    = input.ingest?.totalEpisodesForScoring
      ?? input.ingest?.declaredTotalEpisodes
      ?? inferredTotalEpisodes
  const completionState = input.ingest?.completionState ?? 'unknown'

  const context: AiCallContext = {
    episodeMap: new Map(input.episodes.map(ep => [ep.number, ep])),
    windowMap: new Map(input.windows.map(window => [window.episode, window])),
    language: input.language,
    totalEpisodesForScoring,
    observedEpisodeCount,
    declaredTotalEpisodes: input.ingest?.declaredTotalEpisodes,
    inferredTotalEpisodes,
    completionState,
    fullScript: input.episodes.map(ep => ep.text).join('\n'),
  }

  const client = createStructuredClient()
  const marketSignals = buildDeterministicMarketSignals(context)

  let completed = 0
  const total = 4
  const updateProgress = (label: string) => {
    completed += 1
    input.onProgress?.({ completed, total, label })
  }

  const [openingResult, paywallHooksResult, storyResult, marketPotentialResult] = await Promise.all([
    runOpeningCall(context, client).finally(() => updateProgress('L2_OPENING')),
    runPaywallHooksCall(context, client).finally(() => updateProgress('L2_PAYWALL_HOOKS')),
    runStoryCall(context, client).finally(() => updateProgress('L2_STORY')),
    runMarketPotentialCall(context, marketSignals, client, input.totalWordsFromL1).finally(() => updateProgress('L2_MARKET_POTENTIAL')),
  ])

  const auditItems = [
    ...mapOpeningOutput(openingResult),
    ...mapPaywallHooksOutput(paywallHooksResult),
    ...mapStoryOutput(storyResult),
    ...mapMarketPotentialOutput(marketPotentialResult, marketSignals),
  ]

  const breakdown = aggregateScores(auditItems)
  const finalBreakdown = applyRedlineOverride(breakdown, marketSignals.redlineHit)

  return toAnalysisScoreResult(
    auditItems,
    finalBreakdown,
    marketSignals.redlineHit,
    marketSignals.redlineEvidence,
  )
}

function createStructuredClient() {
  const apiKey = requiredEnv('ZENAI_LLM_API_KEY')
  const endpoint = normalizeOptional(process.env.ZENAI_LLM_API_BASE_URL) ?? DEFAULT_ENDPOINT
  const modelId = normalizeOptional(process.env.ZENAI_LLM_MODEL) ?? DEFAULT_MODEL

  const provider = createOpenAICompatible({
    name: 'zenai',
    baseURL: endpoint,
    apiKey,
    supportsStructuredOutputs: true,
  })
  const model = provider.chatModel(modelId)

  return async function callObject<T>(label: string, schema: import('zod').ZodType<T>, prompt: string): Promise<T> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { output } = await generateText({
          model,
          output: Output.object({ schema }),
          prompt,
          temperature: 0.2,
          providerOptions: {
            zenai: { reasoningEffort: 'high' },
          },
        })
        if (output == null)
          throw new Error(`${label}: empty output`)
        assertEnglishStructuredOutput(output)
        return output
      }
      catch (error) {
        lastError = error
      }
    }
    throw new Error(`${label} failed after retries: ${toErrorMessage(lastError)}`)
  }
}

async function runOpeningCall(
  context: AiCallContext,
  callObject: ReturnType<typeof createStructuredClient>,
) {
  const promptInput: OpeningPromptInputEnhanced = {
    ep1Full: context.episodeMap.get(1)?.text ?? '',
    ep2Full: context.episodeMap.get(2)?.text ?? '',
    ep3Full: context.episodeMap.get(3)?.text ?? '',
    ep1Head: context.windowMap.get(1)?.head_500w ?? '',
    ep2Head: context.windowMap.get(2)?.head_500w ?? '',
    ep3Head: context.windowMap.get(3)?.head_500w ?? '',
  }

  const output = await callObject(
    'L2_OPENING',
    OpeningAssessmentSchema,
    buildOpeningPrompt(promptInput),
  )
  return output
}

async function runPaywallHooksCall(
  context: AiCallContext,
  callObject: ReturnType<typeof createStructuredClient>,
) {
  const detectedPaywall1 = findPaywallEpisodes(context.episodeMap)[0]
  const firstPaywall = detectedPaywall1 ?? inferPaywallEpisode(context.totalEpisodesForScoring)

  const hasSecondPaywall = context.totalEpisodesForScoring >= 30
  const range2 = secondaryPaywallRange(context.totalEpisodesForScoring)
  const detectedPaywall2 = findPaywallEpisodes(context.episodeMap)[1]
  const secondPaywall = hasSecondPaywall
    ? (detectedPaywall2 ?? (range2 ? inferSecondaryPaywall(range2) : undefined))
    : undefined

  const promptInput: PaywallHooksPromptInput = {
    firstPaywallEpisode: firstPaywall,
    totalEpisodes: context.totalEpisodesForScoring,
    previousEpisode1Text: context.episodeMap.get(firstPaywall - 1)?.text ?? '',
    paywall1Pre: context.windowMap.get(firstPaywall)?.paywall_pre_context_1000t ?? '',
    paywall1Post: context.windowMap.get(firstPaywall)?.paywall_post_context_400t ?? '',
    nextEpisode1Head: (context.episodeMap.get(firstPaywall + 1)?.text ?? '').slice(0, 1500),
    episodesForAnalysis1: buildEpisodesForPaywallAnalysis(context.episodeMap, 2, 17),
    detectedPaywall1: detectedPaywall1 ?? null,

    hasSecondPaywall: hasSecondPaywall && secondPaywall != null,
    secondPaywallEpisode: secondPaywall,
    validRange2: range2 ?? undefined,
    previousEpisode2Text: secondPaywall != null ? context.episodeMap.get(secondPaywall - 1)?.text : undefined,
    paywall2Pre: secondPaywall != null ? context.windowMap.get(secondPaywall)?.paywall_pre_context_1000t : undefined,
    paywall2Post: secondPaywall != null ? context.windowMap.get(secondPaywall)?.paywall_post_context_400t : undefined,
    nextEpisode2Head: secondPaywall != null ? (context.episodeMap.get(secondPaywall + 1)?.text ?? '').slice(0, 1400) : undefined,
    episodesForAnalysis2: hasSecondPaywall && range2
      ? buildEpisodesForPaywallAnalysis(context.episodeMap, range2[0], range2[1])
      : undefined,
    detectedPaywall2: detectedPaywall2 ?? null,

    ep2Tail: (context.episodeMap.get(2)?.text ?? '').slice(-220),
    ep4Tail: (context.episodeMap.get(4)?.text ?? '').slice(-220),
    ep8Tail: (context.episodeMap.get(8)?.text ?? '').slice(-220),
    ep10Tail: (context.episodeMap.get(10)?.text ?? '').slice(-220),

    first12Text: collectEpisodes(context.episodeMap, 1, 12),
    first5Text: collectEpisodes(context.episodeMap, 1, 5),
    first3Text: collectEpisodes(context.episodeMap, 1, 3),
  }

  const output = await callObject(
    'L2_PAYWALL_HOOKS',
    PaywallHooksAssessmentSchema,
    buildPaywallHooksPrompt(promptInput),
  )
  return output
}

async function runStoryCall(
  context: AiCallContext,
  callObject: ReturnType<typeof createStructuredClient>,
) {
  const midEpisode = Math.ceil(context.totalEpisodesForScoring / 2)

  const promptInput: StoryPromptInputEnhanced = {
    ep1Sample: context.episodeMap.get(1)?.text ?? '',
    epMidSample: context.episodeMap.get(midEpisode)?.text ?? '',
    epEndSample: context.episodeMap.get(context.totalEpisodesForScoring)?.text ?? '',
    protagonistDialogue: buildCharacterSamples(context.episodeMap, context.totalEpisodesForScoring),
    antagonistDialogue: buildAntagonistSamples(context.episodeMap, context.totalEpisodesForScoring),
    emotionScenes: buildEmotionSamples(context.episodeMap, context.totalEpisodesForScoring),
    conflictScenes: buildConflictSamples(context.episodeMap, context.totalEpisodesForScoring),
    totalEpisodes: context.totalEpisodesForScoring,
  }

  const output = await callObject(
    'L2_STORY',
    StoryAssessmentSchema,
    buildStoryPrompt(promptInput),
  )
  return output
}

async function runMarketPotentialCall(
  context: AiCallContext,
  signals: DeterministicMarketSignals,
  callObject: ReturnType<typeof createStructuredClient>,
  _totalWordsFromL1: number,
) {
  const payScore = 0
  const storyScore = 0
  const marketScore = 0
  const total110 = payScore + storyScore + marketScore

  const promptInput: MarketPotentialPromptInput = {
    mechanismSamples: buildMechanismSamples(context.episodeMap, context.totalEpisodesForScoring),
    audienceSamples: buildAudienceSamples(context.episodeMap, context.totalEpisodesForScoring),
    detectedGenre: detectGenre(context.fullScript, context.language),
    totalEpisodes: context.totalEpisodesForScoring,
    localizationCount: signals.localizationCount,

    payScore,
    storyScore,
    marketScore,
    total110,
    issueLines: '- none',
    recoverable: 0,
    coreDriverScore: 0,
    characterScore: 0,
  }

  const output = await callObject(
    'L2_MARKET_POTENTIAL',
    MarketPotentialAssessmentSchema,
    buildMarketPotentialPrompt(promptInput),
  )
  return output
}

function mapOpeningOutput(output: OpeningAssessment): AuditItem[] {
  return [
    makeAuditItem(
      'pay.opening.male_lead',
      output.maleLead.score,
      5,
      output.maleLead.reasoning,
      [...output.maleLead.visualTagsFound, ...output.maleLead.personaTagsFound],
    ),
    makeAuditItem(
      'pay.opening.female_lead',
      output.femaleLead.score,
      5,
      output.femaleLead.reasoning,
      [output.femaleLead.conflictEvidence, output.femaleLead.motivationEvidence].filter(Boolean) as string[],
    ),
  ]
}

function mapPaywallHooksOutput(output: PaywallHooksAssessment): AuditItem[] {
  const items: AuditItem[] = [
    makeAuditItem('pay.paywall.primary.position', output.firstPaywall.position.score, 2, output.firstPaywall.position.reasoning, [
      output.firstPaywall.position.validRange ?? 'N/A',
      `episode=${output.firstPaywall.position.episode}`,
    ]),
    makeAuditItem('pay.paywall.primary.previous', output.firstPaywall.previousEpisode.score, 4, output.firstPaywall.previousEpisode.reasoning, [
      ...output.firstPaywall.previousEpisode.plotEvidence,
      ...output.firstPaywall.previousEpisode.emotionEvidence,
      ...output.firstPaywall.previousEpisode.foreshadowEvidence,
    ]),
    makeAuditItem('pay.paywall.primary.hook', output.firstPaywall.hookStrength.score, 5, output.firstPaywall.hookStrength.reasoning, [output.firstPaywall.hookStrength.hookEvidence ?? '']),
    makeAuditItem('pay.paywall.primary.next', output.firstPaywall.nextEpisode.score, 3, output.firstPaywall.nextEpisode.reasoning, []),
  ]

  if (output.secondPaywall.isApplicable) {
    const hookScore = output.secondPaywall.hookStrength.hasEscalation
      ? output.secondPaywall.hookStrength.score
      : Math.min(output.secondPaywall.hookStrength.score, 1)

    items.push(
      makeAuditItem('pay.paywall.secondary.position', output.secondPaywall.position.score, 2, output.secondPaywall.position.reasoning, [
        output.secondPaywall.position.validRange ?? 'N/A',
        `episode=${output.secondPaywall.position.episode}`,
      ]),
      makeAuditItem('pay.paywall.secondary.previous', output.secondPaywall.previousEpisode.score, 3, output.secondPaywall.previousEpisode.reasoning, []),
      makeAuditItem('pay.paywall.secondary.hook', hookScore, 3, output.secondPaywall.hookStrength.reasoning, [output.secondPaywall.hookStrength.escalationEvidence ?? ''].filter(Boolean)),
      makeAuditItem('pay.paywall.secondary.next', output.secondPaywall.nextEpisode.score, 2, output.secondPaywall.nextEpisode.reasoning, []),
    )
  }

  const available = [2, 4, 8, 10].filter(ep => ep <= output.episodicHooks.ep10.score + 10)
  const rawSum = output.episodicHooks.ep2.score + output.episodicHooks.ep4.score
    + output.episodicHooks.ep8.score + output.episodicHooks.ep10.score
  const normalized = available.length === 0 ? 0 : (rawSum / available.length) * 4
  const episodicScore = Math.min(normalized, 7)

  items.push(
    makeAuditItem('pay.hooks.episodic', episodicScore, 7, output.episodicHooks.reasoning, [], episodicScore >= 4 ? 'ok' : 'warn', available.length < 3 ? 'low_sample' : 'normal'),
    makeAuditItem('pay.density.drama', output.density.dramaEvents.score, 2.5, output.density.dramaEvents.reasoning, output.density.dramaEvents.events),
    makeAuditItem('pay.density.motivation', output.density.motivationClarity.score, 2, output.density.motivationClarity.reasoning, []),
    makeAuditItem('pay.density.foreshadow', output.density.foreshadowing.score, 2.5, output.density.foreshadowing.reasoning, []),
    makeAuditItem('pay.visual_hammer', output.visualHammer.score, 2, output.visualHammer.reasoning, [`total=${output.visualHammer.totalScenes}`, `first3=${output.visualHammer.first3Scenes}`]),
  )

  return items
}

function mapStoryOutput(output: StoryAssessment): AuditItem[] {
  return [
    makeAuditItem('story.core_driver', output.coreDriver.score, 10, output.coreDriver.reasoning, [`relationship=${output.coreDriver.relationshipPercentage.toFixed(1)}%`]),
    makeAuditItem('story.character.male', output.characterRecognition.maleLead.score, 4, output.characterRecognition.maleLead.reasoning, output.characterRecognition.maleLead.tagsFound),
    makeAuditItem('story.character.female', output.characterRecognition.femaleLead.score, 6, output.characterRecognition.femaleLead.reasoning, output.characterRecognition.femaleLead.tagsFound),
    makeAuditItem('story.emotion_density', output.emotionDensity.score, 6, output.emotionDensity.reasoning, [`density=${output.emotionDensity.densityPercentage.toFixed(2)}%`]),
    makeAuditItem('story.conflict', output.conflictTwist.conflictScore, 2.5, output.conflictTwist.reasoning, []),
    makeAuditItem('story.twist', output.conflictTwist.twistScore, 1.5, output.conflictTwist.reasoning, [`majorTwists=${output.conflictTwist.majorTwistCount}`]),
  ]
}

function mapMarketPotentialOutput(
  output: MarketPotentialAssessment,
  signals: DeterministicMarketSignals,
): AuditItem[] {
  return [
    makeAuditItem('market.benchmark', output.market.benchmark.score, 5, output.market.benchmark.reasoning, output.market.benchmark.mechanisms.map(m => m.name)),
    makeAuditItem('market.taboo', signals.tabooItem.score, 5, signals.tabooItem.reason, signals.tabooItem.evidence, signals.redlineHit ? 'fail' : 'ok'),
    makeAuditItem('market.localization', output.market.localization.score, 5, output.market.localization.reasoning, output.market.localization.elementsFound),
    makeAuditItem('market.audience.genre', output.market.audienceMatch.genreAudienceScore, 3, output.market.audienceMatch.reasoning, output.market.audienceMatch.inappropriateElements),
    makeAuditItem('market.audience.purity', output.market.audienceMatch.audiencePurityScore, 2, output.market.audienceMatch.reasoning, []),
    makeAuditItem('potential.repair_cost', output.potential.repairCost.score, 3, output.potential.repairCost.reasoning, [output.potential.repairCost.estimatedHours, output.potential.repairCost.primaryIssueType]),
    makeAuditItem('potential.expected_gain', output.potential.expectedGain.score, 3, output.potential.expectedGain.reasoning, [`recoverable=${output.potential.expectedGain.recoverablePoints.toFixed(2)}`]),
    makeAuditItem('potential.story_core', output.potential.storyCore.score, 3, output.potential.storyCore.reasoning, [`storyPercent=${output.potential.storyCore.storyDimensionPercent.toFixed(2)}`]),
    makeAuditItem('potential.scarcity', output.potential.scarcity.score, 1, output.potential.scarcity.reasoning, ['benchmarkMode=rule-only']),
  ]
}

function buildDeterministicMarketSignals(context: AiCallContext) {
  const redlineEvidence = collectMatchedTerms(
    context.fullScript,
    pickKeywords(SCORING_KEYWORDS.market.redline, context.language),
    context.language,
  )
  const redlineHit = redlineEvidence.length > 0
  const vulgarCount = countTerms(
    context.fullScript,
    pickKeywords(SCORING_KEYWORDS.market.vulgar, context.language),
    context.language,
  )
  const vulgarPenalty = Math.min(2, vulgarCount * 0.05)

  const tabooItem = makeAuditItem(
    'market.taboo',
    redlineHit ? 0 : Math.max(0, 5 - vulgarPenalty),
    5,
    redlineHit ? 'Redline term detected.' : `Vulgar terms detected: ${vulgarCount}.`,
    redlineEvidence,
    redlineHit ? 'fail' : 'ok',
  )

  const localizationCount = countTerms(
    context.fullScript,
    pickKeywords(SCORING_KEYWORDS.market.localization, context.language),
    context.language,
  )

  return {
    tabooItem,
    redlineHit,
    redlineEvidence,
    vulgarCount,
    vulgarPenalty,
    localizationCount,
  }
}

function inferPaywallEpisode(totalEpisodes: number): number {
  if (totalEpisodes <= 15)
    return Math.min(7, totalEpisodes - 1)
  if (totalEpisodes <= 30)
    return Math.min(10, totalEpisodes - 1)
  if (totalEpisodes <= 50)
    return Math.min(12, totalEpisodes - 1)
  return Math.min(15, totalEpisodes - 1)
}

function inferSecondaryPaywall(range: [number, number]): number {
  return Math.floor((range[0] + range[1]) / 2)
}

function buildEpisodesForPaywallAnalysis(
  episodeMap: Map<number, ParsedEpisode>,
  start: number,
  end: number,
): Array<{ number: number, tail: string }> {
  const episodes: Array<{ number: number, tail: string }> = []

  for (let epNum = start; epNum <= end; epNum++) {
    const text = episodeMap.get(epNum)?.text ?? ''
    if (text.length > 0) {
      episodes.push({
        number: epNum,
        tail: text.slice(-500),
      })
    }
  }

  return episodes
}

function collectEpisodes(episodeMap: Map<number, ParsedEpisode>, from: number, to: number) {
  const chunks: string[] = []
  for (let episode = from; episode <= to; episode++) {
    const text = episodeMap.get(episode)?.text
    if (text == null || text.length === 0)
      continue
    chunks.push(`Episode ${episode}\n${text}`)
  }
  return chunks.join('\n\n')
}

function buildCharacterSamples(episodeMap: Map<number, ParsedEpisode>, totalEpisodes: number) {
  const picks = new Set<number>([1, 2, 3, Math.ceil(totalEpisodes / 3), Math.ceil((totalEpisodes * 2) / 3), totalEpisodes])
  return Array.from(picks)
    .filter(ep => ep >= 1 && ep <= totalEpisodes)
    .sort((a, b) => a - b)
    .map((episode) => {
      const text = (episodeMap.get(episode)?.text ?? '').slice(0, 900)
      return `Episode ${episode}\n${text}`
    })
    .join('\n\n')
}

function buildAntagonistSamples(episodeMap: Map<number, ParsedEpisode>, totalEpisodes: number) {
  const points = [1, Math.ceil(totalEpisodes / 4), Math.ceil(totalEpisodes / 2)]
  return points
    .filter(ep => ep >= 1 && ep <= totalEpisodes)
    .map(ep => `Episode ${ep}\n${(episodeMap.get(ep)?.text ?? '').slice(0, 800)}`)
    .join('\n\n')
}

function buildEmotionSamples(episodeMap: Map<number, ParsedEpisode>, totalEpisodes: number) {
  const points = [2, Math.ceil(totalEpisodes / 3), Math.ceil((totalEpisodes * 2) / 3)]
  return points
    .filter(ep => ep >= 1 && ep <= totalEpisodes)
    .map(ep => `Episode ${ep}\n${(episodeMap.get(ep)?.text ?? '').slice(-1000)}`)
    .join('\n\n')
}

function buildConflictSamples(episodeMap: Map<number, ParsedEpisode>, totalEpisodes: number) {
  const points = [3, Math.ceil(totalEpisodes / 2), totalEpisodes]
  return points
    .filter(ep => ep >= 1 && ep <= totalEpisodes)
    .map(ep => `Episode ${ep}\n${(episodeMap.get(ep)?.text ?? '').slice(-1200)}`)
    .join('\n\n')
}

function buildMechanismSamples(episodeMap: Map<number, ParsedEpisode>, totalEpisodes: number) {
  const points = [1, Math.ceil(totalEpisodes / 4), Math.ceil(totalEpisodes / 2), Math.ceil((totalEpisodes * 3) / 4), totalEpisodes]
  return points
    .filter((value, index, array) => value >= 1 && value <= totalEpisodes && array.indexOf(value) === index)
    .map(ep => `Episode ${ep}\n${(episodeMap.get(ep)?.text ?? '').slice(0, 1000)}`)
    .join('\n\n')
}

function buildAudienceSamples(episodeMap: Map<number, ParsedEpisode>, totalEpisodes: number) {
  return collectEpisodes(episodeMap, 1, Math.min(12, totalEpisodes)).slice(0, 5200)
}

function findPaywallEpisodes(episodeMap: Map<number, ParsedEpisode>) {
  return Array.from(episodeMap.values())
    .filter(ep => ep.paywallCount > 0)
    .map(ep => ep.number)
    .sort((a, b) => a - b)
}

function requiredEnv(name: string) {
  const value = normalizeOptional(process.env[name])
  if (value == null)
    throw new Error(`${name} is required for server-side scoring.`)
  return value
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim()
  if (trimmed == null || trimmed.length === 0)
    return null
  return trimmed
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error)
    return error.message
  return String(error)
}

type DeterministicMarketSignals = ReturnType<typeof buildDeterministicMarketSignals>
