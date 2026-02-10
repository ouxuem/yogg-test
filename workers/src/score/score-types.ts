export type ScoreGrade = 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C'

export type AuditStatus = 'ok' | 'warn' | 'fail'
export type ConfidenceFlag = 'low_sample' | 'normal'

export interface AuditItem {
  id: string
  status: AuditStatus
  score: number
  max: number
  reason: string
  evidence: string[]
  confidenceFlag?: ConfidenceFlag
}

export type EpisodeHealth = 'GOOD' | 'FAIR' | 'PEAK'
export type EpisodeState = 'optimal' | 'issue' | 'neutral'
export type IssueCategory = 'structure' | 'pacing' | 'mixed'
export type EmotionLevel = 'Low' | 'Medium' | 'High'
export type ConflictDensity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ScoreBreakdown {
  pay: number
  story: number
  market: number
  potential: number
  total110: number
  overall100: number
  grade: ScoreGrade
}

export interface ScoreMeta {
  rulesetVersion: string
  redlineHit: boolean
  redlineEvidence: string[]
  generatedAt: string
}

export interface EmotionSeriesPoint {
  episode: number
  value: number
}

export interface EmotionAnchorPoint {
  slot: 'Start' | 'Mid' | 'End'
  episode: number
  value: number
}

export interface ConflictPhasePoint {
  phase: 'Start' | 'Inc.' | 'Rise' | 'Climax' | 'Fall' | 'Res.'
  ext: number
  int: number
}

export interface EpisodeRow {
  episode: number
  health: EpisodeHealth
  primaryHookType: string
  aiHighlight: string
}

export interface DiagnosisMatrixItem {
  episode: number
  state: EpisodeState
}

export interface DiagnosisDetail {
  episode: number
  issueCategory: IssueCategory
  issueLabel: string
  issueReason: string
  suggestion: string
  hookType: string
  emotionLevel: EmotionLevel
  conflictDensity: ConflictDensity
  pacingScore: number
  signalPercent: number
}

export interface PresentationPayload {
  commercialSummary: string
  dimensionNarratives: {
    monetization: string
    story: string
    market: string
  }
  charts: {
    emotion: {
      series: EmotionSeriesPoint[]
      anchors: EmotionAnchorPoint[]
      caption: string
    }
    conflict: {
      phases: ConflictPhasePoint[]
      caption: string
    }
  }
  episodeRows: EpisodeRow[]
  diagnosis: {
    matrix: DiagnosisMatrixItem[]
    details: DiagnosisDetail[]
    overview: {
      integritySummary: string
      pacingFocusEpisode: number
      pacingIssueLabel: string
      pacingIssueReason: string
    }
  }
}

export interface AnalysisScoreResult {
  meta: ScoreMeta
  score: {
    total_110: number
    overall_100: number
    grade: ScoreGrade
    breakdown_110: {
      pay: number
      story: number
      market: number
      potential: number
    }
  }
  presentation: PresentationPayload
}

export const RULESET_VERSION = 'v2.2.0-mvp-briefs' as const

export function aggregateScores(parts: Pick<ScoreBreakdown, 'pay' | 'story' | 'market' | 'potential'>): ScoreBreakdown {
  const pay = clampPart(parts.pay, 50)
  const story = clampPart(parts.story, 30)
  const market = clampPart(parts.market, 20)
  const potential = clampPart(parts.potential, 10)
  const total110 = round2(pay + story + market + potential)
  const overall100 = Math.round((total110 / 110) * 100)
  const grade = mapGrade(total110)
  return { pay, story, market, potential, total110, overall100, grade }
}

export function mapGrade(total110: number): ScoreGrade {
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

export function applyRedlineOverride(breakdown: ScoreBreakdown, redlineHit: boolean): ScoreBreakdown {
  if (!redlineHit)
    return breakdown
  return {
    ...breakdown,
    grade: 'C',
    overall100: Math.min(breakdown.overall100, 69),
  }
}

export function toAnalysisScoreResult(input: {
  breakdown: ScoreBreakdown
  redlineHit: boolean
  redlineEvidence: string[]
  presentation: PresentationPayload
  generatedAt?: string
}): AnalysisScoreResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  return {
    meta: {
      rulesetVersion: RULESET_VERSION,
      redlineHit: input.redlineHit,
      redlineEvidence: input.redlineEvidence,
      generatedAt,
    },
    score: {
      total_110: input.breakdown.total110,
      overall_100: input.breakdown.overall100,
      grade: input.breakdown.grade,
      breakdown_110: {
        pay: input.breakdown.pay,
        story: input.breakdown.story,
        market: input.breakdown.market,
        potential: input.breakdown.potential,
      },
    },
    presentation: input.presentation,
  }
}

function clampPart(value: number, max: number) {
  if (!Number.isFinite(value))
    return 0
  return round2(Math.max(0, Math.min(max, value)))
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}
