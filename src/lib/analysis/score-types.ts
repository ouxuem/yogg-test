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

export interface ScoreMeta {
  rulesetVersion: string
  redlineHit: boolean
  redlineEvidence: string[]
  generatedAt: string
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
  presentation: {
    totalEpisodes: number
    commercialSummary: string
    dimensionNarratives: {
      monetization: string
      story: string
      market: string
    }
    charts: {
      emotion: {
        series: Array<{ episode: number, value: number }>
        anchors: Array<{ slot: 'Start' | 'Mid' | 'End', episode: number, value: number }>
        caption: string
      }
      conflict: {
        phases: Array<{
          phase: 'Start' | 'Inc.' | 'Rise' | 'Climax' | 'Fall' | 'Res.'
          ext: number
          int: number
        }>
        caption: string
      }
    }
    episodeRows: Array<{
      episode: number
      health: EpisodeHealth
      primaryHookType: string
      aiHighlight: string
    }>
    diagnosis: {
      matrix: Array<{ episode: number, state: EpisodeState }>
      details: Array<{
        episode: number
        issueCategory: IssueCategory
        issueLabel: string
        issueReason: string
        suggestion: string
        emotionLevel: EmotionLevel
        conflictDensity: ConflictDensity
        pacingScore: number
        signalPercent: number
      }>
      overview: {
        integritySummary: string
        pacingFocusEpisode: number
        pacingIssueLabel: string
        pacingIssueReason: string
      }
    }
  }
}
