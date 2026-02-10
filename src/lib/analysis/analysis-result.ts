import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import type { AnalysisScoreResult } from '@/lib/analysis/score-types'

export interface PreviewScore {
  overall100: number
  grade: 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C'
  monetization: number
  story: number
  market: number
}

interface AnalysisResultMeta {
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
  previewScore: PreviewScore
  progress?: AnalysisProgress
  score: AnalysisScoreResult
}
