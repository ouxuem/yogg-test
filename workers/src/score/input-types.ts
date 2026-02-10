export interface ParsedEpisode {
  number: number
  text: string
  paywallCount: number
}

export interface EpisodeBrief {
  episode: number
  opening: string
  ending: string
  keyEvents: string[]
  tokenCount: number
  wordCount: number
  emotionRaw: number
  conflictExtRaw: number
  conflictIntRaw: number
  paywallFlag: boolean
}

export type CompletionState = 'completed' | 'incomplete' | 'unknown'
export type IngestMode = 'official' | 'provisional'

export interface ParseIngest {
  declaredTotalEpisodes?: number
  inferredTotalEpisodes: number
  totalEpisodesForScoring: number
  observedEpisodeCount: number
  completionState: CompletionState
  coverageRatio: number
  mode: IngestMode
}
