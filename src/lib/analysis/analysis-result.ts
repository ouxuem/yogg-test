import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import type { AnalysisScoreResult } from '@/lib/analysis/score-types'

export interface PreviewScore {
  overall100: number
  grade: 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C'
  monetization: number
  story: number
  market: number
}

export interface AnalysisResultMeta {
  title?: string
  totalEpisodes?: number
  isCompleted?: boolean
  language: 'en' | 'zh'
  tokenizer: 'whitespace' | 'intl-segmenter' | 'char-fallback'
  createdAt: string
}

export interface AnalysisResult {
  meta: AnalysisResultMeta
  l1: {
    episodes: Array<{
      episode: number
      tokenCount: number
      wordCount: number
      emotionHits: number
      conflictHits: number
      conflictExtHits: number
      conflictIntHits: number
      vulgarHits: number
      tabooHits: number
    }>
    totals: {
      tokenCount: number
      wordCount: number
      emotionHits: number
      conflictHits: number
      conflictExtHits: number
      conflictIntHits: number
      vulgarHits: number
      tabooHits: number
    }
  }
  windows: Array<{
    episode: number
    tokensTotal: number
    head_500w: string
    tail_350w: string
    next_head_100t: string
    hook_context: string
    paywall_context?: string
    paywall_pre_context_1000t?: string
    paywall_post_context_400t?: string
    hasPaywall: boolean
  }>
  previewScore: PreviewScore
  progress?: AnalysisProgress
  score?: AnalysisScoreResult
}
