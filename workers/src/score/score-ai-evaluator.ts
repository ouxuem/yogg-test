import type { AnalysisLanguage, AnalysisTokenizer } from './detect-language'
import type { EpisodeBrief, ParseIngest } from './input-types'
import type { EpisodePassItem, GlobalSummary } from './score-ai-schemas'
import type { AnalysisScoreResult, PresentationPayload } from './score-types'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, Output } from 'ai'
import { assertEnglishStructuredOutput } from './ai-language-guard'
import { buildEpisodePassPrompt, buildGlobalPassPrompt } from './score-ai-prompts'
import { EpisodePassSchema, GlobalSummarySchema, PresentationSchema } from './score-ai-schemas'
import { aggregateScores, applyRedlineOverride, toAnalysisScoreResult } from './score-types'

interface EvaluateAiScoreInput {
  env: ScoreRuntimeEnv
  episodeBriefs: EpisodeBrief[]
  ingest: ParseIngest
  language: AnalysisLanguage
  tokenizer: AnalysisTokenizer
  onProgress?: (update: { completed: number, total: number, label: string }) => void
}

const DEFAULT_ENDPOINT = 'https://llm-api.dev.zenai.cc/v1'
const DEFAULT_MODEL = 'gemini-3-pro'
const MAX_EPISODES = 120

export interface ScoreRuntimeEnv {
  ZENAI_LLM_API_KEY?: string
  ZENAI_LLM_API_BASE_URL?: string
  ZENAI_LLM_MODEL?: string
}

/**
 * ============================================================================
 * 双阶段 AI 评分主入口
 * - Call 1: episode pass（逐集结构化）
 * - Call 2: global pass（全局文案）
 * - 数值评分: 后端确定性计算（防漂移）
 * ============================================================================
 */
export async function evaluateAiScore(input: EvaluateAiScoreInput): Promise<AnalysisScoreResult> {
  validateEpisodeBriefs(input.episodeBriefs)

  const client = createStructuredClient(input.env)

  let completed = 0
  const total = 2
  const updateProgress = (label: string) => {
    completed += 1
    input.onProgress?.({ completed, total, label })
  }

  const episodePassRaw = await runEpisodePassCall(input.episodeBriefs, client)
    .finally(() => updateProgress('L2_EPISODE_PASS'))

  const episodePass = normalizeEpisodePass(episodePassRaw.episodes, input.episodeBriefs)
  const baseBreakdown = computeDeterministicBreakdown(input.episodeBriefs, episodePass)

  const globalSummary = await runGlobalPassCall(
    episodePass,
    {
      pay: baseBreakdown.pay,
      story: baseBreakdown.story,
      market: baseBreakdown.market,
      potential: baseBreakdown.potential,
      overall100: baseBreakdown.overall100,
      grade: baseBreakdown.grade,
    },
    client,
  ).finally(() => updateProgress('L2_GLOBAL_PASS'))

  const redlineEvidence = detectRedlineEvidence(input.episodeBriefs)
  const redlineHit = redlineEvidence.length > 0
  const finalBreakdown = applyRedlineOverride(baseBreakdown, redlineHit)

  const presentation = buildPresentationPayload({
    episodeBriefs: input.episodeBriefs,
    episodePass,
    globalSummary,
  })

  // 强校验：MVP 不兼容旧数据，结构不合法直接失败。
  const parsedPresentation = PresentationSchema.safeParse(presentation)
  if (!parsedPresentation.success)
    throw new Error(`Invalid presentation payload: ${parsedPresentation.error.issues[0]?.message ?? 'unknown error'}`)

  return toAnalysisScoreResult({
    breakdown: finalBreakdown,
    redlineHit,
    redlineEvidence,
    presentation: parsedPresentation.data,
  })
}

function createStructuredClient(env: ScoreRuntimeEnv) {
  const apiKey = requiredEnv(env, 'ZENAI_LLM_API_KEY')
  const endpoint = normalizeOptional(env.ZENAI_LLM_API_BASE_URL) ?? DEFAULT_ENDPOINT
  const modelId = normalizeOptional(env.ZENAI_LLM_MODEL) ?? DEFAULT_MODEL

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

async function runEpisodePassCall(
  episodeBriefs: EpisodeBrief[],
  callObject: ReturnType<typeof createStructuredClient>,
) {
  return callObject('L2_EPISODE_PASS', EpisodePassSchema, buildEpisodePassPrompt(episodeBriefs))
}

async function runGlobalPassCall(
  episodePass: EpisodePassItem[],
  numericScoreParts: {
    pay: number
    story: number
    market: number
    potential: number
    overall100: number
    grade: string
  },
  callObject: ReturnType<typeof createStructuredClient>,
) {
  return callObject(
    'L2_GLOBAL_PASS',
    GlobalSummarySchema,
    buildGlobalPassPrompt({ episodePass, numericScoreParts }),
  )
}

function validateEpisodeBriefs(episodeBriefs: EpisodeBrief[]) {
  if (episodeBriefs.length === 0)
    throw new Error('episodeBriefs must contain at least 1 episode.')
  if (episodeBriefs.length > MAX_EPISODES)
    throw new Error(`episodeBriefs exceeds limit (${MAX_EPISODES}).`)

  const seen = new Set<number>()
  for (const brief of episodeBriefs) {
    if (seen.has(brief.episode))
      throw new Error(`episodeBriefs contains duplicate episode ${brief.episode}.`)
    seen.add(brief.episode)

    if (brief.episode < 1)
      throw new Error('episode number must be >= 1.')

    if (brief.opening.trim().length === 0 || brief.ending.trim().length === 0)
      throw new Error(`episode ${brief.episode} has empty opening or ending.`)

    if (brief.keyEvents.length < 3 || brief.keyEvents.length > 6)
      throw new Error(`episode ${brief.episode} keyEvents must contain 3-6 items.`)
  }

  const sorted = [...episodeBriefs].sort((a, b) => a.episode - b.episode)
  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1
    if (sorted[i]?.episode !== expected)
      throw new Error('episodeBriefs must be continuous from 1..N without gaps.')
  }
}

function normalizeEpisodePass(items: EpisodePassItem[], episodeBriefs: EpisodeBrief[]) {
  const byEpisode = new Map<number, EpisodePassItem>()
  for (const item of items) {
    if (!byEpisode.has(item.episode))
      byEpisode.set(item.episode, item)
  }

  const normalized: EpisodePassItem[] = []
  for (const brief of episodeBriefs) {
    const matched = byEpisode.get(brief.episode)
    if (matched == null)
      throw new Error(`Episode pass missing episode ${brief.episode}.`)

    normalized.push({
      ...matched,
      primaryHookType: sanitizeHookType(matched.primaryHookType),
      aiHighlight: compactText(matched.aiHighlight, 220),
      issueLabel: compactText(matched.issueLabel, 72),
      issueReason: compactText(matched.issueReason, 240),
      suggestion: compactText(matched.suggestion, 240),
      pacingScore: round1(clamp(matched.pacingScore, 0, 10)),
      signalPercent: Math.round(clamp(matched.signalPercent, 0, 100)),
    })
  }

  return normalized
}

function computeDeterministicBreakdown(episodeBriefs: EpisodeBrief[], episodePass: EpisodePassItem[]) {
  const count = episodeBriefs.length
  const avgEmotion = mean(episodeBriefs.map(item => item.emotionRaw))
  const avgConflictExt = mean(episodeBriefs.map(item => item.conflictExtRaw))
  const avgConflictInt = mean(episodeBriefs.map(item => item.conflictIntRaw))
  const avgConflict = avgConflictExt + avgConflictInt
  const paywallCount = episodeBriefs.filter(item => item.paywallFlag).length
  const eventDensity = mean(episodeBriefs.map(item => item.keyEvents.length))

  const hookCoverage = ratio(episodePass, item => sanitizeHookType(item.primaryHookType) !== 'None')
  const peakRatio = ratio(episodePass, item => item.health === 'PEAK')
  const issueRatio = ratio(episodePass, item => item.state === 'issue')
  const neutralRatio = ratio(episodePass, item => item.state === 'neutral')
  const avgSignalPercent = mean(episodePass.map(item => item.signalPercent))

  const conflictBalance = 1 - (Math.abs(avgConflictExt - avgConflictInt) / Math.max(1, avgConflict))
  const paywallScore = clamp(paywallCount / Math.max(1, Math.min(2, Math.ceil(count / 20))), 0, 1)

  const pay = 12
    + paywallScore * 12
    + normalizeRange(avgConflict, 0, 8) * 8
    + hookCoverage * 14
    + peakRatio * 4

  const story = 7
    + normalizeRange(avgEmotion, 0, 9) * 8
    + normalizeRange(avgSignalPercent, 0, 100) * 9
    + (1 - issueRatio) * 4
    + (1 - neutralRatio) * 2

  const market = 5
    + normalizeRange(eventDensity, 1, 6) * 6
    + conflictBalance * 5
    + (1 - issueRatio) * 4

  const potential = 2
    + (1 - issueRatio) * 3
    + hookCoverage * 2
    + (1 - normalizeRange(avgSignalPercent, 0, 100)) * 2
    + (paywallCount > 0 ? 1 : 0)

  return aggregateScores({ pay, story, market, potential })
}

function buildPresentationPayload(input: {
  episodeBriefs: EpisodeBrief[]
  episodePass: EpisodePassItem[]
  globalSummary: GlobalSummary
}): PresentationPayload {
  const emotionSeries = buildEmotionSeries(input.episodeBriefs)
  const conflictPhases = buildConflictPhases(input.episodeBriefs)

  const episodeRows = input.episodePass.map(item => ({
    episode: item.episode,
    health: item.health,
    primaryHookType: sanitizeHookType(item.primaryHookType),
    aiHighlight: compactText(item.aiHighlight, 240),
  }))

  const diagnosisMatrix = input.episodePass.map(item => ({
    episode: item.episode,
    state: item.state,
  }))

  const diagnosisDetails = input.episodePass
    .filter(item => item.state !== 'optimal')
    .map(item => ({
      episode: item.episode,
      issueCategory: item.issueCategory,
      issueLabel: compactText(item.issueLabel, 72),
      issueReason: compactText(item.issueReason, 240),
      suggestion: compactText(item.suggestion, 240),
      hookType: sanitizeHookType(item.primaryHookType),
      emotionLevel: item.emotionLevel,
      conflictDensity: item.conflictDensity,
      pacingScore: round1(clamp(item.pacingScore, 0, 10)),
      signalPercent: Math.round(clamp(item.signalPercent, 0, 100)),
    }))

  const pacingEpisode = clampEpisode(
    input.globalSummary.diagnosisOverview.pacingFocusEpisode,
    input.episodeBriefs.length,
  )

  return {
    commercialSummary: compactText(input.globalSummary.commercialSummary, 280),
    dimensionNarratives: {
      monetization: compactText(input.globalSummary.dimensionNarratives.monetization, 220),
      story: compactText(input.globalSummary.dimensionNarratives.story, 220),
      market: compactText(input.globalSummary.dimensionNarratives.market, 220),
    },
    charts: {
      emotion: {
        series: emotionSeries,
        anchors: buildEmotionAnchors(emotionSeries),
        caption: compactText(input.globalSummary.chartCaptions.emotion, 200),
      },
      conflict: {
        phases: conflictPhases,
        caption: compactText(input.globalSummary.chartCaptions.conflict, 200),
      },
    },
    episodeRows,
    diagnosis: {
      matrix: diagnosisMatrix,
      details: diagnosisDetails,
      overview: {
        integritySummary: compactText(input.globalSummary.diagnosisOverview.integritySummary, 260),
        pacingFocusEpisode: pacingEpisode,
        pacingIssueLabel: compactText(input.globalSummary.diagnosisOverview.pacingIssueLabel, 72),
        pacingIssueReason: compactText(input.globalSummary.diagnosisOverview.pacingIssueReason, 220),
      },
    },
  }
}

function buildEmotionSeries(episodeBriefs: EpisodeBrief[]) {
  const raw = episodeBriefs.map(item => Math.max(0, item.emotionRaw))
  const normalized = normalizeTo100(raw)
  const smoothed = normalized.map((value, index) => {
    const prev = normalized[index - 1] ?? value
    const next = normalized[index + 1] ?? value
    return Math.round((prev + value * 2 + next) / 4)
  })

  return episodeBriefs.map((item, index) => ({
    episode: item.episode,
    value: smoothed[index] ?? 0,
  }))
}

function buildEmotionAnchors(series: Array<{ episode: number, value: number }>) {
  const first = series[0]
  const mid = series[Math.floor(series.length / 2)]
  const last = series[series.length - 1]

  if (first == null || mid == null || last == null)
    throw new Error('Emotion chart requires non-empty series.')

  return [
    { slot: 'Start' as const, episode: first.episode, value: first.value },
    { slot: 'Mid' as const, episode: mid.episode, value: mid.value },
    { slot: 'End' as const, episode: last.episode, value: last.value },
  ]
}

function buildConflictPhases(episodeBriefs: EpisodeBrief[]) {
  const phases = [
    { phase: 'Start' as const, ext: 0, int: 0 },
    { phase: 'Inc.' as const, ext: 0, int: 0 },
    { phase: 'Rise' as const, ext: 0, int: 0 },
    { phase: 'Climax' as const, ext: 0, int: 0 },
    { phase: 'Fall' as const, ext: 0, int: 0 },
    { phase: 'Res.' as const, ext: 0, int: 0 },
  ]

  const denominator = Math.max(1, episodeBriefs.length - 1)

  for (let index = 0; index < episodeBriefs.length; index++) {
    const brief = episodeBriefs[index]
    const ratioValue = index / denominator
    const phaseIndex = Math.min(5, Math.floor(ratioValue * 6))
    const phase = phases[phaseIndex]
    if (phase == null)
      continue

    phase.ext += Math.max(0, brief.conflictExtRaw)
    phase.int += Math.max(0, brief.conflictIntRaw)
  }

  return phases
}

function detectRedlineEvidence(episodeBriefs: EpisodeBrief[]) {
  const terms = [
    'terrorism',
    'extremism',
    'racist',
    'genocide',
    'incest',
    'terror attack',
    '恐怖主义',
    '极端主义',
    '种族灭绝',
    '乱伦',
  ]

  const corpus = episodeBriefs
    .flatMap(item => [item.opening, item.ending, ...item.keyEvents])
    .join(' ')
    .toLowerCase()

  const evidence: string[] = []
  for (const term of terms) {
    if (corpus.includes(term.toLowerCase()))
      evidence.push(term)
  }

  return evidence
}

function sanitizeHookType(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length === 0)
    return 'None'
  const compact = text.length > 48 ? `${text.slice(0, 47)}…` : text
  return compact.toLowerCase() === 'none' ? 'None' : compact
}

function compactText(value: string, max: number) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}

function clampEpisode(episode: number, total: number) {
  return Math.max(1, Math.min(total, Math.round(episode)))
}

function normalizeTo100(values: number[]) {
  const max = Math.max(0, ...values)
  if (max <= 0)
    return values.map(() => 0)
  return values.map(value => Math.round((Math.max(0, value) / max) * 100))
}

function normalizeRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value))
    return 0
  if (max <= min)
    return 0
  return clamp((value - min) / (max - min), 0, 1)
}

function mean(values: number[]) {
  if (values.length === 0)
    return 0
  const sum = values.reduce((acc, item) => acc + item, 0)
  return sum / values.length
}

function ratio<T>(items: T[], predicate: (item: T) => boolean) {
  if (items.length === 0)
    return 0
  const matched = items.filter(predicate).length
  return matched / items.length
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value))
    return min
  return Math.max(min, Math.min(max, value))
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function requiredEnv(env: ScoreRuntimeEnv, name: keyof ScoreRuntimeEnv) {
  const value = normalizeOptional(env[name])
  if (value == null)
    throw new Error(`${String(name)} is required for server-side scoring.`)
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
