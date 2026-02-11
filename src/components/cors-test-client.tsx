'use client'

import type { AnalysisScoreResult } from '@/lib/analysis/score-types'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const DEFAULT_WORKER_STREAM_ROUTE = '/api/score/stream'
const DEFAULT_MODEL = 'gemini-3-pro'
const ACCEPTED_FILE_TYPES = 'image/*,application/pdf,audio/*,video/*'
const THINKING_LEVEL = 'low'
const STRUCTURED_RESPONSE_MIME_TYPE = 'application/json'
const FLOAT_COMPARISON_EPSILON = 0.01
const MAX_EMOTION_SERIES_POINTS = 6

const SCORE_GRADE_VALUES = ['S+', 'S', 'A+', 'A', 'B', 'C'] as const
const EPISODE_HEALTH_VALUES = ['GOOD', 'FAIR', 'PEAK'] as const
const EPISODE_STATE_VALUES = ['optimal', 'issue', 'neutral'] as const
const ISSUE_CATEGORY_VALUES = ['structure', 'pacing', 'mixed'] as const
const EMOTION_LEVEL_VALUES = ['Low', 'Medium', 'High'] as const
const CONFLICT_DENSITY_VALUES = ['LOW', 'MEDIUM', 'HIGH'] as const
const EMOTION_SLOT_VALUES = ['Start', 'Mid', 'End'] as const
const CONFLICT_PHASE_VALUES = ['Start', 'Inc.', 'Rise', 'Climax', 'Fall', 'Res.'] as const
type StructuredScoreOutput = Pick<AnalysisScoreResult, 'score' | 'presentation'>

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
}

interface FileMeta {
  name: string
  size: number
  type: string
}

interface ParsedSummary {
  firstText?: string
  finishReason?: string
  usageMetadata?: unknown
  structuredOutput?: StructuredScoreOutput
  structuredOutputValid?: boolean
  structuredOutputError?: string
  streamEventCount?: number
}

interface TestResult {
  at: string
  durationMs: number
  request: {
    url: string
    model: string
    file: FileMeta
    mode: 'workerProxyStream'
    thinkingLevel: string
    responseMimeType: string
    structuredSchema: string
  }
  status?: number
  ok?: boolean
  parsed?: ParsedSummary
  rawResponse?: unknown
  rawText?: string
  error?: string
}

interface GenerateContentResponse {
  candidates?: Array<{
    finishReason?: unknown
    content?: {
      parts?: Array<{
        text?: unknown
      }>
    }
  }>
  usageMetadata?: unknown
}

interface SseReadResult {
  rawText: string
  events: unknown[]
  parseErrors: string[]
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeEndpointBase(endpoint: string) {
  return endpoint.trim().replace(/\/+$/, '')
}

function buildWorkerStreamUrl(endpoint: string) {
  const normalizedBase = normalizeEndpointBase(endpoint)
  if (normalizedBase.length === 0)
    return DEFAULT_WORKER_STREAM_ROUTE
  return `${normalizedBase}${DEFAULT_WORKER_STREAM_ROUTE}`
}

function formatBytes(bytes: number) {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function resolveMimeType(file: File) {
  const declaredType = file.type.trim()
  if (declaredType.length > 0)
    return declaredType

  const lowerName = file.name.toLowerCase()
  for (const [suffix, mimeType] of Object.entries(EXTENSION_MIME_MAP)) {
    if (lowerName.endsWith(suffix))
      return mimeType
  }

  return 'application/octet-stream'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOneOf(value: unknown, options: readonly string[]) {
  return typeof value === 'string' && options.includes(value)
}

function isInRange(value: number, min: number, max: number) {
  return value >= min && value <= max
}

function isStringLengthInRange(value: unknown, min: number, max: number) {
  return typeof value === 'string' && value.length >= min && value.length <= max
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) <= FLOAT_COMPARISON_EPSILON
}

function isScoreGrade(value: unknown): value is StructuredScoreOutput['score']['grade'] {
  return isOneOf(value, SCORE_GRADE_VALUES)
}

function isStructuredScoreOutput(value: unknown): value is StructuredScoreOutput {
  if (!isRecord(value) || !isRecord(value.score) || !isRecord(value.presentation))
    return false
  if ('meta' in value)
    return false

  if (!isNumber(value.score.total_110) || !isNumber(value.score.overall_100) || !isScoreGrade(value.score.grade))
    return false
  if (!isRecord(value.score.breakdown_110))
    return false
  const pay = value.score.breakdown_110.pay
  const story = value.score.breakdown_110.story
  const market = value.score.breakdown_110.market
  const potential = value.score.breakdown_110.potential
  const total110 = value.score.total_110
  const overall100 = value.score.overall_100

  if (!isNumber(pay) || !isNumber(story) || !isNumber(market) || !isNumber(potential))
    return false
  if (!isInRange(pay, 0, 50) || !isInRange(story, 0, 30) || !isInRange(market, 0, 20) || !isInRange(potential, 0, 10))
    return false
  if (!isInRange(total110, 0, 110))
    return false
  if (!isInRange(overall100, 0, 100))
    return false

  const expectedTotal110 = pay + story + market + potential
  if (!nearlyEqual(total110, expectedTotal110))
    return false

  const expectedOverall100 = Math.round((total110 / 110) * 100)
  if (overall100 !== expectedOverall100)
    return false

  if (!isStringLengthInRange(value.presentation.commercialSummary, 1, 280))
    return false
  if (!isRecord(value.presentation.dimensionNarratives))
    return false
  if (!isStringLengthInRange(value.presentation.dimensionNarratives.monetization, 1, 220)
    || !isStringLengthInRange(value.presentation.dimensionNarratives.story, 1, 220)
    || !isStringLengthInRange(value.presentation.dimensionNarratives.market, 1, 220)) {
    return false
  }

  if (!isRecord(value.presentation.charts)
    || !isRecord(value.presentation.charts.emotion)
    || !isRecord(value.presentation.charts.conflict)) {
    return false
  }

  if (!Array.isArray(value.presentation.charts.emotion.series)
    || !Array.isArray(value.presentation.charts.emotion.anchors)
    || !isStringLengthInRange(value.presentation.charts.emotion.caption, 1, 200)) {
    return false
  }

  if (!Array.isArray(value.presentation.charts.conflict.phases)
    || !isStringLengthInRange(value.presentation.charts.conflict.caption, 1, 200)) {
    return false
  }

  if (!Array.isArray(value.presentation.episodeRows))
    return false

  const emotionSeries = value.presentation.charts.emotion.series
  const totalEpisodes = value.presentation.totalEpisodes
  if (!isNumber(totalEpisodes) || totalEpisodes < 1)
    return false
  const expectedSeriesPoints = Math.min(MAX_EMOTION_SERIES_POINTS, totalEpisodes)
  if (emotionSeries.length !== expectedSeriesPoints)
    return false

  const seriesEpisodes: number[] = []
  let previousSeriesEpisode = 0
  for (const point of emotionSeries) {
    if (!isRecord(point)
      || !isNumber(point.episode)
      || point.episode < 1
      || point.episode > totalEpisodes
      || point.episode <= previousSeriesEpisode
      || !isNumber(point.value)
      || !isInRange(point.value, 0, 100)) {
      return false
    }
    previousSeriesEpisode = point.episode
    seriesEpisodes.push(point.episode)
  }
  const firstSeriesEpisode = seriesEpisodes[0]
  const lastSeriesEpisode = seriesEpisodes[seriesEpisodes.length - 1]
  if (totalEpisodes >= 2 && (firstSeriesEpisode !== 1 || lastSeriesEpisode !== totalEpisodes))
    return false
  const seriesEpisodeSet = new Set(seriesEpisodes)
  if (seriesEpisodeSet.size !== seriesEpisodes.length)
    return false

  const anchors = value.presentation.charts.emotion.anchors
  if (anchors.length !== 3)
    return false
  if (!anchors.every(anchor =>
    isRecord(anchor)
    && isOneOf(anchor.slot, EMOTION_SLOT_VALUES)
    && isNumber(anchor.episode)
    && anchor.episode >= 1
    && anchor.episode <= totalEpisodes
    && seriesEpisodeSet.has(anchor.episode)
    && isNumber(anchor.value)
    && isInRange(anchor.value, 0, 100),
  )) {
    return false
  }

  const phases = value.presentation.charts.conflict.phases
  if (phases.length !== 6)
    return false
  if (!phases.every(phase =>
    isRecord(phase)
    && isOneOf(phase.phase, CONFLICT_PHASE_VALUES)
    && isNumber(phase.ext)
    && phase.ext >= 0
    && isNumber(phase.int)
    && phase.int >= 0,
  )) {
    return false
  }

  if (!value.presentation.episodeRows.every(row =>
    isRecord(row)
    && isNumber(row.episode)
    && row.episode >= 1
    && isOneOf(row.health, EPISODE_HEALTH_VALUES)
    && isStringLengthInRange(row.primaryHookType, 1, 48)
    && isStringLengthInRange(row.aiHighlight, 8, 240),
  )) {
    return false
  }

  if (!isRecord(value.presentation.diagnosis)
    || !Array.isArray(value.presentation.diagnosis.matrix)
    || !Array.isArray(value.presentation.diagnosis.details)
    || !isRecord(value.presentation.diagnosis.overview)) {
    return false
  }

  if (!value.presentation.diagnosis.matrix.every(item =>
    isRecord(item)
    && isNumber(item.episode)
    && item.episode >= 1
    && isOneOf(item.state, EPISODE_STATE_VALUES),
  )) {
    return false
  }

  if (!value.presentation.diagnosis.details.every(detail =>
    isRecord(detail)
    && isNumber(detail.episode)
    && detail.episode >= 1
    && isOneOf(detail.issueCategory, ISSUE_CATEGORY_VALUES)
    && isStringLengthInRange(detail.issueLabel, 1, 72)
    && isStringLengthInRange(detail.issueReason, 1, 240)
    && isStringLengthInRange(detail.suggestion, 1, 240)
    && isOneOf(detail.emotionLevel, EMOTION_LEVEL_VALUES)
    && isOneOf(detail.conflictDensity, CONFLICT_DENSITY_VALUES)
    && isNumber(detail.pacingScore)
    && isInRange(detail.pacingScore, 0, 10)
    && isNumber(detail.signalPercent)
    && isInRange(detail.signalPercent, 0, 100),
  )) {
    return false
  }

  if (!isStringLengthInRange(value.presentation.diagnosis.overview.integritySummary, 1, 260)
    || !isNumber(value.presentation.diagnosis.overview.pacingFocusEpisode)
    || value.presentation.diagnosis.overview.pacingFocusEpisode < 1
    || !isStringLengthInRange(value.presentation.diagnosis.overview.pacingIssueLabel, 1, 72)
    || !isStringLengthInRange(value.presentation.diagnosis.overview.pacingIssueReason, 1, 220)) {
    return false
  }

  return true
}

function parseStructuredOutput(text: string | undefined) {
  if (text == null || text.trim().length === 0)
    return { value: undefined, error: 'No JSON text found in candidate.' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { value: undefined, error: 'Candidate text is not valid JSON.' }
  }

  let normalized: unknown = parsed
  if (isRecord(normalized) && 'meta' in normalized) {
    const { meta: _meta, ...rest } = normalized
    normalized = rest
  }

  if (!isStructuredScoreOutput(normalized))
    return { value: undefined, error: 'JSON parsed but does not match score+presentation shape.' }

  return { value: normalized, error: undefined }
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied)
    throw new Error('document.execCommand(copy) failed.')
}

function getCopyPayload(result: TestResult | null) {
  if (result == null)
    return null

  if (result.parsed?.structuredOutput != null)
    return JSON.stringify(result.parsed.structuredOutput, null, 2)

  const firstText = result.parsed?.firstText?.trim()
  if (firstText != null && firstText.length > 0)
    return firstText

  const rawText = result.rawText?.trim()
  if (rawText != null && rawText.length > 0)
    return rawText

  if (result.rawResponse != null)
    return JSON.stringify(result.rawResponse, null, 2)

  return null
}

function extractTextChunksFromPayload(payload: GenerateContentResponse) {
  const chunks: string[] = []

  for (const candidate of payload.candidates ?? []) {
    const parts = candidate.content?.parts
    if (!Array.isArray(parts))
      continue

    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text.length > 0)
        chunks.push(part.text)
    }
  }

  return chunks
}

function parseSseText(rawText: string): SseReadResult {
  const normalized = rawText.replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const events: unknown[] = []
  const parseErrors: string[] = []

  for (const block of blocks) {
    if (block.trim().length === 0)
      continue

    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('data:'))
        dataLines.push(line.slice(5).trimStart())
    }

    const dataPayload = dataLines.join('\n').trim()
    if (dataPayload.length === 0 || dataPayload === '[DONE]')
      continue

    try {
      events.push(JSON.parse(dataPayload))
    }
    catch {
      parseErrors.push(`Invalid SSE data JSON: ${dataPayload.slice(0, 160)}`)
    }
  }

  return { rawText, events, parseErrors }
}

async function readSseEvents(response: Response): Promise<SseReadResult> {
  const reader = response.body?.getReader()
  if (reader == null) {
    const rawText = await response.text()
    return parseSseText(rawText)
  }

  const decoder = new TextDecoder()
  let rawText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    rawText += decoder.decode(value, { stream: true })
  }
  rawText += decoder.decode()

  return parseSseText(rawText)
}

function extractParsedSummary(payload: unknown): ParsedSummary {
  if (payload == null || typeof payload !== 'object')
    return {}

  const response = payload as GenerateContentResponse
  const firstCandidate = response.candidates?.[0]
  const firstText = extractTextChunksFromPayload(response).join('')
  const { value, error } = parseStructuredOutput(firstText)

  return {
    firstText,
    finishReason: typeof firstCandidate?.finishReason === 'string' ? firstCandidate.finishReason : undefined,
    usageMetadata: response.usageMetadata,
    structuredOutput: value,
    structuredOutputValid: value != null,
    structuredOutputError: error,
  }
}

function extractParsedSummaryFromSseEvents(events: unknown[], parseErrors: string[]): ParsedSummary {
  let mergedText = ''
  let lastChunkText: string | undefined
  let finishReason: string | undefined
  let usageMetadata: unknown

  for (const event of events) {
    if (!isRecord(event))
      continue

    const payload = event as GenerateContentResponse
    const chunkText = extractTextChunksFromPayload(payload).join('')
    if (chunkText.length > 0) {
      mergedText += chunkText
      lastChunkText = chunkText
    }

    const candidate = payload.candidates?.[0]
    if (typeof candidate?.finishReason === 'string')
      finishReason = candidate.finishReason
    if (payload.usageMetadata !== undefined)
      usageMetadata = payload.usageMetadata
  }

  const primaryText = mergedText.trim().length > 0 ? mergedText : undefined
  let parsed = parseStructuredOutput(primaryText)

  if (parsed.value == null && lastChunkText != null && lastChunkText !== primaryText) {
    const fallback = parseStructuredOutput(lastChunkText)
    if (fallback.value != null) {
      parsed = fallback
    }
    else {
      parsed = {
        value: undefined,
        error: [parsed.error, fallback.error].filter(Boolean).join(' | '),
      }
    }
  }

  const streamParseError = parseErrors.length > 0 ? `SSE parse errors: ${parseErrors.length}` : undefined
  const structuredOutputError = [parsed.error, streamParseError].filter(Boolean).join(' | ') || undefined

  return {
    firstText: primaryText ?? lastChunkText,
    finishReason,
    usageMetadata,
    structuredOutput: parsed.value,
    structuredOutputValid: parsed.value != null,
    structuredOutputError,
    streamEventCount: events.length,
  }
}

function extractWorkerErrorMessage(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error))
    return undefined

  const details: string[] = []
  if (typeof payload.error.code === 'string')
    details.push(payload.error.code)
  if (typeof payload.error.message === 'string')
    details.push(payload.error.message)
  if (typeof payload.error.status === 'number')
    details.push(`upstreamStatus=${payload.error.status}`)
  if (typeof payload.error.upstreamBody === 'string' && payload.error.upstreamBody.trim().length > 0)
    details.push(`upstreamBody=${payload.error.upstreamBody}`)

  return details.length > 0 ? details.join(' | ') : undefined
}

export default function CorsTestClient({ endpoint }: { endpoint: string }) {
  const isReduced = useReducedMotion() === true
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<TestResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const requestUrlPreview = buildWorkerStreamUrl(endpoint)
  const resultState = isRunning ? 'running' : result?.error != null ? 'error' : result?.ok ? 'success' : 'idle'
  const resultStateLabel
    = resultState === 'running'
      ? 'Streaming'
      : resultState === 'success'
        ? 'Success'
        : resultState === 'error'
          ? 'Error'
          : 'Idle'

  async function run() {
    if (selectedFile == null || isRunning)
      return

    setIsRunning(true)
    setCopyFeedback(null)
    const startedAt = performance.now()
    const requestUrl = buildWorkerStreamUrl(endpoint)
    const mimeType = resolveMimeType(selectedFile)
    const fileMeta: FileMeta = {
      name: selectedFile.name,
      size: selectedFile.size,
      type: mimeType,
    }

    try {
      const formData = new FormData()
      formData.set('file', selectedFile)

      const response = await fetch(requestUrl, {
        method: 'POST',
        body: formData,
      })

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      const isSseResponse = contentType.includes('text/event-stream')
      let rawText = ''
      let rawResponse: unknown
      let parseError: string | undefined
      let parsed: ParsedSummary | undefined
      let workerErrorMessage: string | undefined

      if (isSseResponse) {
        const sseResult = await readSseEvents(response)
        rawText = sseResult.rawText
        rawResponse = { streamEvents: sseResult.events }
        parsed = extractParsedSummaryFromSseEvents(sseResult.events, sseResult.parseErrors)
      }
      else {
        rawText = await response.text()
        if (rawText.trim().length > 0) {
          try {
            rawResponse = JSON.parse(rawText)
            workerErrorMessage = extractWorkerErrorMessage(rawResponse)
          }
          catch {
            parseError = 'Response body is not valid JSON.'
          }
        }

        if (rawResponse != null && workerErrorMessage == null)
          parsed = extractParsedSummary(rawResponse)
      }

      const durationMs = Math.round(performance.now() - startedAt)
      const statusLabel
        = response.statusText.trim().length > 0
          ? `${response.status} ${response.statusText}`
          : String(response.status)
      const errors: string[] = []

      if (!response.ok) {
        if (workerErrorMessage != null)
          errors.push(workerErrorMessage)
        else
          errors.push(`HTTP ${statusLabel}`)
      }
      if (parseError != null)
        errors.push(parseError)
      if (parsed?.structuredOutputValid === false && parsed.structuredOutputError != null)
        errors.push(parsed.structuredOutputError)

      setResult({
        at: nowIso(),
        durationMs,
        request: {
          url: requestUrl,
          model: DEFAULT_MODEL,
          file: fileMeta,
          mode: 'workerProxyStream',
          thinkingLevel: THINKING_LEVEL,
          responseMimeType: STRUCTURED_RESPONSE_MIME_TYPE,
          structuredSchema: 'score+presentation(no meta)',
        },
        status: response.status,
        ok: response.ok,
        parsed,
        rawResponse,
        rawText: rawText.length > 0 ? rawText : undefined,
        error: errors.length > 0 ? errors.join(' | ') : undefined,
      })
    }
    catch (error) {
      const durationMs = Math.round(performance.now() - startedAt)
      const message = error instanceof Error ? error.message : String(error)

      setResult({
        at: nowIso(),
        durationMs,
        request: {
          url: requestUrl,
          model: DEFAULT_MODEL,
          file: fileMeta,
          mode: 'workerProxyStream',
          thinkingLevel: THINKING_LEVEL,
          responseMimeType: STRUCTURED_RESPONSE_MIME_TYPE,
          structuredSchema: 'score+presentation(no meta)',
        },
        error: message,
      })
    }
    finally {
      setIsRunning(false)
    }
  }

  async function copyAiOutput() {
    const payload = getCopyPayload(result)
    if (payload == null) {
      setCopyFeedback('No output available to copy')
      return
    }

    try {
      if (navigator.clipboard?.writeText != null)
        await navigator.clipboard.writeText(payload)
      else
        fallbackCopyText(payload)

      setCopyFeedback('AI output copied')
    }
    catch {
      try {
        fallbackCopyText(payload)
        setCopyFeedback('AI output copied')
      }
      catch {
        setCopyFeedback('Copy failed. Check browser clipboard permissions.')
      }
    }
  }

  return (
    <motion.section
      className="space-y-4"
      initial={{ opacity: 0, y: isReduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 32 }}
    >
      <div className="space-y-2">
        <div className="text-sm font-medium">Worker Endpoint Base</div>
        <div className="text-muted-foreground break-all text-sm">
          {endpoint.trim().length > 0 ? endpoint : '(same-origin)'}
        </div>
        <div className="text-sm font-medium">Request URL Preview</div>
        <div className="text-muted-foreground break-all text-sm">{requestUrlPreview}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-medium">Model (server-fixed)</div>
          <div className="text-muted-foreground text-sm">{DEFAULT_MODEL}</div>
          <p className="text-muted-foreground text-xs">
            The API key is read by the Worker from
            <code>ZENAI_LLM_API_KEY</code>
            . The browser never stores this secret.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Prompt Policy</div>
          <p className="text-muted-foreground text-xs">
            Prompt is fixed on server side. Frontend no longer sends prompt fields.
          </p>
          <p className="text-muted-foreground text-xs">
            This experiment uses a fixed setup: Worker proxy + streamGenerateContent + thinkingLevel=low + responseSchema=score+presentation (without meta).
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Media file (required)</div>
        <input
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            setSelectedFile(file)
          }}
          className="bg-background border-input file:text-foreground w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium"
        />
        <AnimatePresence mode="wait" initial={false}>
          {selectedFile == null
            ? (
                <motion.p
                  key="media-empty"
                  className="text-muted-foreground text-xs"
                  initial={{ opacity: 0, y: isReduced ? 0 : 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: isReduced ? 0 : -4, transition: { duration: 0.16 } }}
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                >
                  Supported: image / PDF / audio / video. The browser only uploads the file; base64 conversion and upstream calls happen in the Worker.
                </motion.p>
              )
            : (
                <motion.div
                  key={`media-selected-${selectedFile.name}`}
                  className="bg-muted/40 space-y-1 rounded-md border p-3 text-xs leading-relaxed"
                  initial={{ opacity: 0, y: isReduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: isReduced ? 0 : -4, transition: { duration: 0.16 } }}
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                >
                  <div>
                    <span className="font-medium">Name:</span>
                    {' '}
                    {selectedFile.name}
                  </div>
                  <div>
                    <span className="font-medium">Size:</span>
                    {' '}
                    {formatBytes(selectedFile.size)}
                  </div>
                  <div>
                    <span className="font-medium">MIME:</span>
                    {' '}
                    {resolveMimeType(selectedFile)}
                  </div>
                </motion.div>
              )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          motion="bouncy"
          disabled={isRunning || selectedFile == null}
          onClick={() => {
            void run()
          }}
        >
          {isRunning ? 'Streaming...' : 'Send Worker Stream Request'}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Result</div>
            <motion.span
              key={`result-state-${resultState}`}
              className={[
                'inline-flex h-6 items-center rounded-full border px-2.5 text-[10px] font-semibold tracking-[0.25px] uppercase',
                resultState === 'success'
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : resultState === 'error'
                    ? 'border-destructive/35 bg-destructive/10 text-destructive'
                    : 'border-border/80 bg-muted/45 text-muted-foreground',
              ].join(' ')}
              initial={{ opacity: 0, scale: isReduced ? 1 : 0.96, y: isReduced ? 0 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            >
              {resultStateLabel}
            </motion.span>
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait" initial={false}>
              {copyFeedback != null && (
                <motion.span
                  key={`copy-feedback-${copyFeedback}`}
                  className="text-muted-foreground text-xs"
                  initial={{ opacity: 0, y: isReduced ? 0 : 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: isReduced ? 0 : -3, transition: { duration: 0.14 } }}
                  transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                >
                  {copyFeedback}
                </motion.span>
              )}
            </AnimatePresence>
            <Button
              type="button"
              variant="outline"
              motion="bouncy"
              disabled={result == null}
              onClick={() => {
                void copyAiOutput()
              }}
            >
              Copy AI Output
            </Button>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.pre
            key={result == null ? 'result-empty' : `result-${result.at}`}
            className="bg-muted/40 overflow-auto rounded-md border p-3 text-xs leading-relaxed"
            initial={{ opacity: 0, y: isReduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isReduced ? 0 : -4, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            {result
              ? JSON.stringify(result, null, 2)
              : 'Select a media file and send the request. This panel will show request status, streamed parsing results, and the raw response.\n\nIf you see TypeError: Failed to fetch, first verify that /api/cors-test/stream reached the Worker, then inspect the returned status and error body.'}
          </motion.pre>
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
