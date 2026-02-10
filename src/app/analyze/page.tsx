'use client'

import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import type { AnalysisScoreResult } from '@/lib/analysis/score-types'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import AnalysisLoading from '@/components/analysis/analysis-loading'
import Waves from '@/components/ui/waves'
import { asStoredRun, deleteRunInput, readRunInput, subscribeRunStore, writeRun } from '@/lib/analysis/run-store'
import { toPreviewScoreFromScore } from '@/lib/analysis/score-preview'
import { useResolvedRid } from '@/lib/analysis/use-resolved-rid'
import { isRecord } from '@/lib/type-guards'

const PREFLIGHT_ERRORS_KEY = 'sdicap:preflight_errors'
const DEFAULT_SCORE_API_ORIGIN = 'https://worker.1143434456qq.workers.dev'

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

interface PreparedPayload {
  meta: unknown
  l1: unknown
  windows: unknown
  scoreRequest: ScoreApiRequest
}

export default function AnalyzePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [progressOverride, setProgressOverride] = useState<AnalysisProgress | undefined>(undefined)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const rid = useResolvedRid({ fallbackToLast: false })
  const hasRid = rid != null && rid.length > 0
  const queryRid = searchParams.get('rid')

  const input = useSyncExternalStore(
    subscribeRunStore,
    () => (hasRid ? readRunInput(rid) ?? '' : ''),
    () => '',
  )

  useEffect(() => {
    if (!isFinalizing && (rid == null || rid.length === 0 || input.trim().length === 0))
      router.replace('/')
  }, [input, isFinalizing, rid, router])

  useEffect(() => {
    if (rid == null || rid.length === 0 || input.trim().length === 0)
      return
    const ridValue = rid
    let disposed = false

    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })

    const toPreflightError = (message: string) => {
      if (disposed)
        return
      setIsFinalizing(true)
      window.sessionStorage.setItem(
        PREFLIGHT_ERRORS_KEY,
        JSON.stringify([{ code: 'ERR_AI_EVAL', message }]),
      )
      deleteRunInput(ridValue)
      router.replace('/')
    }

    const completeRun = async (payload: PreparedPayload) => {
      setProgressOverride({
        phase: 'assemble_report',
        percent: 93,
        activity: 'Scoring with AI model.',
      })

      try {
        const score = await requestScoreFromApi(payload.scoreRequest, DEFAULT_SCORE_API_ORIGIN)
        if (disposed)
          return

        if (!isRecord(payload.meta)) {
          toPreflightError('AI scoring failed: invalid prepared meta payload.')
          return
        }

        const previewScore = toPreviewScoreFromScore(score)
        const createdAt = new Date().toISOString()
        const run = asStoredRun({
          meta: { ...payload.meta, createdAt },
          l1: payload.l1,
          windows: payload.windows,
          previewScore,
          score,
        })

        if (!run) {
          toPreflightError('AI scoring failed: malformed prepared payload.')
          return
        }

        setProgressOverride({
          phase: 'assemble_report',
          percent: 100,
          activity: 'Finalizing export-ready layout.',
        })
        setIsFinalizing(true)
        writeRun(ridValue, run)
        deleteRunInput(ridValue)
        router.replace(`/result?rid=${encodeURIComponent(ridValue)}`)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toPreflightError(`AI scoring failed: ${message}`)
      }
    }

    const onMessage = (event: MessageEvent<unknown>) => {
      const data: unknown = event.data
      if (!isRecord(data) || typeof data.type !== 'string')
        return

      if (data.type === 'progress') {
        if (!isRecord(data.progress))
          return
        const phase = typeof data.progress.phase === 'string' ? data.progress.phase : 'validate_index'
        const percentRaw = typeof data.progress.percent === 'number' ? data.progress.percent : 0
        const activity = typeof data.progress.activity === 'string' ? data.progress.activity : ''
        const batch = isRecord(data.progress.batch)
          ? {
              current: typeof data.progress.batch.current === 'number' ? data.progress.batch.current : 0,
              total: typeof data.progress.batch.total === 'number' ? data.progress.batch.total : 0,
            }
          : undefined
        setProgressOverride({
          phase: phase as AnalysisProgress['phase'],
          percent: percentRaw,
          activity,
          batch,
        })
      }

      if (data.type === 'preflight_error') {
        setIsFinalizing(true)
        const errors = Array.isArray(data.errors) ? data.errors : []
        window.sessionStorage.setItem(PREFLIGHT_ERRORS_KEY, JSON.stringify(errors))
        deleteRunInput(ridValue)
        router.replace('/')
      }

      if (data.type === 'prepared') {
        if (!isPreparedPayload(data.payload)) {
          toPreflightError('AI scoring failed: invalid prepared payload.')
          return
        }
        void completeRun(data.payload)
      }
    }

    worker.addEventListener('message', onMessage)

    worker.postMessage({ type: 'start', input })

    return () => {
      disposed = true
      worker.removeEventListener('message', onMessage)
      worker.terminate()
    }
  }, [input, rid, router])

  if (queryRid == null || rid == null || rid.length === 0 || input.trim().length === 0)
    return null

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-8">
      <Waves
        lineColor="var(--muted-foreground)"
        lineOpacity={0.2}
        cursorInfluence={0.72}
        cursorRadius={220}
        cursorStrength={1.05}
        maxCursorMove={40}
      />
      <div className="relative z-10 w-full max-w-5xl">
        <AnalysisLoading testId="analysis-loading" progress={progressOverride} />
      </div>
    </main>
  )
}

function isPreparedPayload(value: unknown): value is PreparedPayload {
  if (!isRecord(value))
    return false
  if (!isScoreApiRequest(value.scoreRequest))
    return false
  return true
}

function isScoreApiRequest(value: unknown): value is ScoreApiRequest {
  if (!isRecord(value))
    return false
  if (!Array.isArray(value.episodes))
    return false
  if (!isRecord(value.ingest))
    return false
  if (value.language !== 'en' && value.language !== 'zh')
    return false
  if (value.tokenizer !== 'whitespace' && value.tokenizer !== 'intl-segmenter' && value.tokenizer !== 'char-fallback')
    return false
  if (typeof value.totalWordsFromL1 !== 'number')
    return false
  return true
}

async function requestScoreFromApi(payload: ScoreApiRequest, apiOrigin: string): Promise<AnalysisScoreResult> {
  const apiUrl = toApiUrl(apiOrigin)
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
