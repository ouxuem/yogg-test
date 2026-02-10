import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import { parseAndPreflight } from '@/lib/analysis/input-contract'
import { computeL1Stats } from '@/lib/analysis/l1-stats'
import { isRecord } from '@/lib/type-guards'

interface StartMessage {
  type: 'start'
  input: string
}

interface ScoreApiRequest {
  episodes: Array<{
    number: number
    text: string
    paywallCount: number
  }>
  ingest: {
    declaredTotalEpisodes?: number
    inferredTotalEpisodes: number
    totalEpisodesForScoring: number
    observedEpisodeCount: number
    completionState: 'completed' | 'incomplete' | 'unknown'
    coverageRatio: number
    mode: 'official' | 'provisional'
  }
  language: 'en' | 'zh'
  tokenizer: 'whitespace' | 'intl-segmenter' | 'char-fallback'
  totalWordsFromL1: number
}

type WorkerMessage
  = | { type: 'progress', progress: AnalysisProgress }
    | { type: 'preflight_error', errors: Array<{ code: string, message: string }> }
    | { type: 'preflight_ok', meta: ReturnType<typeof parseAndPreflight>['meta'] }
    | { type: 'prepared', payload: PreparedPayload }

interface PreparedPayload {
  meta: ReturnType<typeof parseAndPreflight>['meta']
  l1: ReturnType<typeof computeL1Stats>
  scoreRequest: ScoreApiRequest
}

function post(message: WorkerMessage) {
  // eslint-disable-next-line no-restricted-globals
  self.postMessage(message)
}

function isStartMessage(value: unknown): value is StartMessage {
  if (!isRecord(value))
    return false
  return value.type === 'start'
    && typeof value.input === 'string'
}

// eslint-disable-next-line no-restricted-globals
self.addEventListener('message', (event: MessageEvent) => {
  if (!isStartMessage(event.data))
    return
  void runAnalysis(event.data)
})

async function runAnalysis(startMessage: StartMessage) {
  const progress = (next: AnalysisProgress) => post({ type: 'progress', progress: next })

  progress({
    phase: 'validate_index',
    percent: 2,
    activity: 'Validating input format and completeness.',
  })

  const result = parseAndPreflight(startMessage.input)
  if (result.errors.length > 0) {
    post({ type: 'preflight_error', errors: result.errors })
    return
  }

  post({ type: 'preflight_ok', meta: result.meta })

  progress({
    phase: 'validate_index',
    percent: 14,
    activity: 'Indexing episodes and key markers.',
  })

  progress({
    phase: 'structure_story',
    percent: 22,
    activity: 'Preparing structured episode payload for AI scoring.',
  })

  progress({
    phase: 'structure_story',
    percent: 40,
    activity: 'Preparing story segments for fair comparison.',
  })

  progress({
    phase: 'map_characters',
    percent: 48,
    activity: 'Mapping key characters and recurring threads.',
  })

  progress({
    phase: 'map_characters',
    percent: 56,
    activity: 'Linking relationships and narrative anchors.',
  })

  progress({
    phase: 'evaluate_momentum',
    percent: 62,
    activity: 'Measuring tension, conflict, pacing, and episode endings.',
    batch: { current: 0, total: result.episodes.length },
  })

  const totalEpisodes = result.episodes.length
  const l1 = computeL1Stats(
    result.episodes.map(ep => ({ number: ep.number, text: ep.text })),
    result.meta.language,
    result.meta.tokenizer,
    {
      onEpisodeComputed(payload) {
        const current = payload.index + 1
        const shouldUpdate = current === totalEpisodes || current % 3 === 0
        if (!shouldUpdate)
          return
        const percent = 62 + Math.round((current / Math.max(1, totalEpisodes)) * 22)
        progress({
          phase: 'evaluate_momentum',
          percent,
          activity: 'Measuring tension, conflict, pacing, and episode endings.',
          batch: { current, total: totalEpisodes },
        })
      },
    },
  )

  progress({
    phase: 'evaluate_momentum',
    percent: 86,
    activity: 'Compiling episode-by-episode breakdown and key issues.',
    batch: { current: result.episodes.length, total: result.episodes.length },
  })

  progress({
    phase: 'assemble_report',
    percent: 90,
    activity: 'Preparing AI scoring tasks for all dimensions.',
  })

  post({
    type: 'prepared',
    payload: {
      meta: result.meta,
      l1,
      scoreRequest: {
        episodes: result.episodes.map(ep => ({
          number: ep.number,
          text: ep.text,
          paywallCount: ep.paywallCount,
        })),
        ingest: {
          declaredTotalEpisodes: result.ingest.declaredTotalEpisodes,
          inferredTotalEpisodes: result.ingest.inferredTotalEpisodes,
          totalEpisodesForScoring: result.ingest.totalEpisodesForScoring,
          observedEpisodeCount: result.ingest.observedEpisodeCount,
          completionState: result.ingest.completionState,
          coverageRatio: result.ingest.coverageRatio,
          mode: result.ingest.mode,
        },
        language: result.meta.language,
        tokenizer: result.meta.tokenizer,
        totalWordsFromL1: l1.totals.wordCount,
      },
    },
  })
}
