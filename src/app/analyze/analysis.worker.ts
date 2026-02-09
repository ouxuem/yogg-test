import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import type { AnalysisScoreResult } from '@/lib/analysis/score-types'
import { parseAndPreflight } from '@/lib/analysis/input-contract'
import { computeL1Stats } from '@/lib/analysis/l1-stats'
import { toPreviewScoreFromScore } from '@/lib/analysis/score-preview'
import { buildEpisodeWindows } from '@/lib/analysis/window-builder'
import { isRecord } from '@/lib/type-guards'

interface StartMessage {
  type: 'start'
  input: string
  apiOrigin: string
}

type WorkerMessage
  = | { type: 'progress', progress: AnalysisProgress }
    | { type: 'preflight_error', errors: Array<{ code: string, message: string }> }
    | { type: 'preflight_ok', meta: ReturnType<typeof parseAndPreflight>['meta'] }
    | {
      type: 'done'
      result: {
        meta: ReturnType<typeof parseAndPreflight>['meta'] & { createdAt: string }
        l1: ReturnType<typeof computeL1Stats>
        windows: ReturnType<typeof buildEpisodeWindows>
        previewScore: ReturnType<typeof toPreviewScoreFromScore>
        score: AnalysisScoreResult
      }
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
    && typeof value.apiOrigin === 'string'
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
    activity: 'Building consistent story windows for analysis.',
  })

  const windows = buildEpisodeWindows(
    result.episodes.map(ep => ({ number: ep.number, text: ep.text, paywallCount: ep.paywallCount })),
    result.meta.tokenizer,
  )

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

  try {
    const score = await requestScoreFromApi({
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
      apiOrigin: startMessage.apiOrigin,
      language: result.meta.language,
      tokenizer: result.meta.tokenizer,
      totalWordsFromL1: l1.totals.wordCount,
    })

    const createdAt = new Date().toISOString()
    const previewScore = toPreviewScoreFromScore(score)
    progress({
      phase: 'assemble_report',
      percent: 100,
      activity: 'Finalizing export-ready layout.',
    })
    post({
      type: 'done',
      result: {
        meta: { ...result.meta, createdAt },
        l1,
        windows,
        previewScore,
        score,
      },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    post({
      type: 'preflight_error',
      errors: [{ code: 'ERR_AI_EVAL', message: `AI scoring failed: ${message}` }],
    })
  }
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
  apiOrigin: string
  language: 'en' | 'zh'
  tokenizer: 'whitespace' | 'intl-segmenter' | 'char-fallback'
  totalWordsFromL1: number
}

async function requestScoreFromApi(payload: ScoreApiRequest): Promise<AnalysisScoreResult> {
  const apiUrl = toApiUrl(payload.apiOrigin)
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()
  let json: unknown = null
  if (raw.length > 0) {
    try {
      json = JSON.parse(raw)
    }
    catch {
      json = null
    }
  }

  if (!response.ok) {
    const message = extractErrorMessage(json) ?? `HTTP ${response.status}`
    throw new Error(message)
  }

  if (!isRecord(json) || !isRecord(json.score)) {
    throw new Error('Invalid API response: missing score payload.')
  }

  if (!isAnalysisScoreResult(json.score))
    throw new Error('Invalid API response: malformed score payload.')

  return json.score
}

function toApiUrl(apiOrigin: string) {
  const origin = apiOrigin.trim()
  if (origin.length === 0)
    throw new Error('Missing api origin for worker request.')
  return new URL('/api/score', origin).toString()
}

function extractErrorMessage(payload: unknown) {
  if (!isRecord(payload))
    return null
  const error = payload.error
  if (!isRecord(error))
    return null
  const message = error.message
  return typeof message === 'string' ? message : null
}

function isAnalysisScoreResult(value: unknown): value is AnalysisScoreResult {
  if (!isRecord(value))
    return false
  if (!isRecord(value.meta))
    return false
  if (!isRecord(value.score))
    return false
  if (!isRecord(value.audit))
    return false
  if (!Array.isArray(value.audit.items))
    return false
  return true
}
