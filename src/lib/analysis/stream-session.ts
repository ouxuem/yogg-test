import type { AnalysisScoreResult } from '@/lib/analysis/score-types'
import { asStoredRun, writeRun } from '@/lib/analysis/run-store'
import { toPreviewScoreFromScore } from '@/lib/analysis/score-preview'

export type StreamStatus = 'idle' | 'connecting' | 'done' | 'error'

export interface StreamStartInput {
  rid: string
  apiOrigin: string
  text?: string
  file?: File
  persistedMeta?: unknown
  persistedL1?: unknown
}

interface StreamInternalState {
  rid: string
  status: StreamStatus
  message: string
  score: AnalysisScoreResult | null
  error: string | null
  startedAt: number
  completedAt: number | null
  apiOrigin: string
  text: string
  file: File | null
  persistedMeta: unknown
  persistedL1: unknown
  abortController: AbortController | null
}

export interface StreamSessionSnapshot {
  rid: string
  status: StreamStatus
  message: string
  score: AnalysisScoreResult | null
  error: string | null
}

interface NetworkScorePayload {
  score: {
    total_110: number
    overall_100: number
    grade: 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C'
    breakdown_110: {
      pay: number
      story: number
      market: number
      potential: number
    }
  }
  presentation: AnalysisScoreResult['presentation']
}

interface StreamingAccumulator {
  buffer: string
  accumulatedText: string
  sawDoneToken: boolean
  upstreamError: string | null
}

interface NormalizedEpisodeRow {
  episode: number
  health: 'GOOD' | 'FAIR' | 'PEAK'
  primaryHookType: string
  aiHighlight: string
}

interface NormalizedDiagnosisMatrixItem {
  episode: number
  state: 'optimal' | 'issue' | 'neutral'
}

interface NormalizedEmotionSeriesPoint {
  episode: number
  value: number
}

const DEFAULT_AI_HIGHLIGHT = 'Episode summary unavailable. Added by client normalization.'
const MAX_NORMALIZED_EPISODES = 1000

const sessions = new Map<string, StreamInternalState>()
const listeners = new Map<string, Set<() => void>>()

function createInitialState(input: StreamStartInput): StreamInternalState {
  return {
    rid: input.rid,
    status: 'idle',
    message: '',
    score: null,
    error: null,
    startedAt: 0,
    completedAt: null,
    apiOrigin: input.apiOrigin,
    text: input.text?.trim() ?? '',
    file: input.file ?? null,
    persistedMeta: input.persistedMeta ?? null,
    persistedL1: input.persistedL1 ?? null,
    abortController: null,
  }
}

function emit(rid: string) {
  const set = listeners.get(rid)
  if (set == null)
    return
  for (const callback of set)
    callback()
}

function setState(rid: string, updater: (prev: StreamInternalState) => StreamInternalState) {
  const current = sessions.get(rid)
  if (current == null)
    return
  sessions.set(rid, updater(current))
  emit(rid)
}

function getOrCreateState(input: StreamStartInput) {
  const existing = sessions.get(input.rid)
  if (existing != null)
    return existing
  const created = createInitialState(input)
  sessions.set(input.rid, created)
  return created
}

export function getStreamSessionSnapshot(rid: string): StreamSessionSnapshot | null {
  const session = sessions.get(rid)
  if (session == null)
    return null
  return session
}

export function subscribeStreamSession(rid: string, callback: () => void) {
  let set = listeners.get(rid)
  if (set == null) {
    set = new Set()
    listeners.set(rid, set)
  }
  set.add(callback)

  return () => {
    const current = listeners.get(rid)
    if (current == null)
      return
    current.delete(callback)
    if (current.size === 0)
      listeners.delete(rid)
  }
}

export function startStreamSession(input: StreamStartInput) {
  const existing = getOrCreateState(input)
  if (existing.status === 'connecting')
    return

  const normalizedText = input.text?.trim() ?? existing.text
  const file = input.file ?? existing.file
  if ((normalizedText?.length ?? 0) === 0 && file == null)
    throw new Error('Either text or file is required to start stream session.')

  const controller = new AbortController()
  sessions.set(input.rid, {
    ...existing,
    status: 'connecting',
    message: 'Analyzing script...',
    error: null,
    score: null,
    startedAt: Date.now(),
    completedAt: null,
    apiOrigin: input.apiOrigin,
    text: normalizedText,
    file,
    persistedMeta: input.persistedMeta ?? existing.persistedMeta,
    persistedL1: input.persistedL1 ?? existing.persistedL1,
    abortController: controller,
  })
  emit(input.rid)

  void consumeStream(input.rid, controller)
}

export function retryStreamSession(rid: string) {
  const session = sessions.get(rid)
  if (session == null)
    return
  startStreamSession({
    rid,
    apiOrigin: session.apiOrigin,
    text: session.text,
    file: session.file ?? undefined,
    persistedMeta: session.persistedMeta,
    persistedL1: session.persistedL1,
  })
}

async function consumeStream(rid: string, controller: AbortController) {
  const current = sessions.get(rid)
  if (current == null)
    return

  try {
    const response = await fetch(toScoreStreamUrl(current.apiOrigin), {
      method: 'POST',
      body: toStreamFormData(current.text, current.file),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorBody}`)
    }

    const reader = response.body?.getReader()
    if (reader == null)
      throw new Error('Missing stream body.')

    const decoder = new TextDecoder('utf-8')
    const acc: StreamingAccumulator = {
      buffer: '',
      accumulatedText: '',
      sawDoneToken: false,
      upstreamError: null,
    }
    let hasReceivedText = false

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (value == null)
        continue

      const decoded = decoder.decode(value, { stream: true })
      const hadTextBefore = acc.accumulatedText.length > 0
      consumeSseChunk(acc, decoded, false)
      if (acc.upstreamError != null)
        throw new Error(String(acc.upstreamError))

      if (!hadTextBefore && acc.accumulatedText.length > 0 && !hasReceivedText) {
        hasReceivedText = true
        setState(rid, prev => ({
          ...prev,
          message: 'Receiving model output...',
        }))
      }
    }

    consumeSseChunk(acc, decoder.decode(), true)
    if (acc.upstreamError != null)
      throw new Error(String(acc.upstreamError))

    const parsed = parseStructuredPayload(acc.accumulatedText)
    if (!parsed.ok)
      throw new Error(String(parsed.error))

    const score = toStoredScore(parsed.value)
    persistRunFromStream(rid, score)

    setState(rid, prev => ({
      ...prev,
      status: 'done',
      score,
      message: 'Score stream completed.',
      error: null,
      completedAt: Date.now(),
    }))
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setState(rid, prev => ({
      ...prev,
      status: 'error',
      error: message,
      message,
      completedAt: Date.now(),
    }))
  }
}

function consumeSseChunk(acc: StreamingAccumulator, input: string, flush: boolean) {
  acc.buffer += normalizeSseChunk(input)

  while (true) {
    const separator = acc.buffer.indexOf('\n\n')
    if (separator < 0)
      break

    const block = acc.buffer.slice(0, separator)
    acc.buffer = acc.buffer.slice(separator + 2)
    consumeSseBlock(acc, block)
  }

  if (flush && acc.buffer.trim().length > 0)
    consumeSseBlock(acc, acc.buffer)

  if (flush)
    acc.buffer = ''
}

function normalizeSseChunk(input: string) {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function consumeSseBlock(acc: StreamingAccumulator, block: string) {
  const lines = block.split('\n')
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('data:'))
      dataLines.push(line.slice(5).trimStart())
  }

  const rawPayload = dataLines.join('\n').trim()
  if (rawPayload.length === 0)
    return
  if (rawPayload === '[DONE]') {
    acc.sawDoneToken = true
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawPayload)
  }
  catch {
    return
  }

  const upstreamError = readUpstreamErrorMessage(parsed)
  if (upstreamError != null) {
    acc.upstreamError = upstreamError
    return
  }

  const textChunk = extractTextChunkFromEvent(parsed)
  if (textChunk.length > 0)
    acc.accumulatedText += textChunk
}

function extractTextChunkFromEvent(event: unknown) {
  if (!isRecord(event))
    return ''

  const candidates = event.candidates
  if (!Array.isArray(candidates))
    return ''

  const chunks: string[] = []
  for (const candidate of candidates) {
    if (!isRecord(candidate))
      continue
    const content = candidate.content
    if (!isRecord(content))
      continue
    const parts = content.parts
    if (!Array.isArray(parts))
      continue
    for (const part of parts) {
      if (!isRecord(part))
        continue
      const text = part.text
      if (typeof text === 'string' && text.length > 0)
        chunks.push(text)
    }
  }

  return chunks.join('')
}

function readUpstreamErrorMessage(value: unknown) {
  if (!isRecord(value))
    return null
  const err = value.error
  if (!isRecord(err))
    return null
  const message = err.message
  return typeof message === 'string' ? message : 'Upstream SSE error.'
}

function parseStructuredPayload(text: string):
  | { ok: true, value: NetworkScorePayload }
  | { ok: false, error: string } {
  if (text.trim().length === 0)
    return { ok: false, error: 'Stream completed but produced empty text.' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { ok: false, error: 'Stream completed but structured output is not valid JSON.' }
  }

  let normalized = parsed
  if (isRecord(normalized) && 'meta' in normalized) {
    const { meta: _meta, ...rest } = normalized
    normalized = rest
  }
  normalized = normalizeNetworkScorePayload(normalized)

  const error = validateNetworkScorePayload(normalized)
  if (error != null)
    return { ok: false, error: `Stream completed but structured output is invalid: ${error}` }

  return { ok: true, value: normalized as NetworkScorePayload }
}

function normalizeNetworkScorePayload(value: unknown) {
  if (!isRecord(value) || !isRecord(value.presentation))
    return value

  const normalizedScore = normalizeScoreOverall(value.score)
  const presentation = value.presentation
  const charts = isRecord(presentation.charts) ? presentation.charts : null
  const emotion = charts != null && isRecord(charts.emotion) ? charts.emotion : null
  const diagnosis = isRecord(presentation.diagnosis) ? presentation.diagnosis : null

  const normalizedRows = normalizeEpisodeRows(presentation.episodeRows)
  const normalizedMatrix = normalizeDiagnosisMatrix(diagnosis?.matrix)
  const normalizedSeries = normalizeEmotionSeries(emotion?.series)

  const totalEpisodes = inferTotalEpisodes(normalizedRows, normalizedMatrix, normalizedSeries)
  if (totalEpisodes <= 0)
    return value

  const filledRows = fillEpisodeRows(normalizedRows, totalEpisodes)
  const detailEpisodes = collectDetailEpisodes(diagnosis?.details, totalEpisodes)
  const filledMatrix = fillDiagnosisMatrix(normalizedMatrix, detailEpisodes, totalEpisodes)
  const filledSeries = fillEmotionSeries(normalizedSeries, totalEpisodes)

  const nextPresentation = {
    ...presentation,
    episodeRows: filledRows,
    charts: charts == null || emotion == null
      ? presentation.charts
      : {
          ...charts,
          emotion: {
            ...emotion,
            series: filledSeries,
          },
        },
    diagnosis: diagnosis == null
      ? presentation.diagnosis
      : {
          ...diagnosis,
          matrix: filledMatrix,
        },
  }

  return {
    ...value,
    score: normalizedScore,
    presentation: nextPresentation,
  }
}

function normalizeScoreOverall(value: unknown) {
  if (!isRecord(value))
    return value
  if (!isFiniteNumber(value.total_110) || !isInRange(value.total_110, 0, 110))
    return value

  const expectedOverall = Math.round((value.total_110 / 110) * 100)
  if (value.overall_100 === expectedOverall)
    return value

  return {
    ...value,
    overall_100: expectedOverall,
  }
}

function inferTotalEpisodes(
  rows: NormalizedEpisodeRow[],
  matrix: NormalizedDiagnosisMatrixItem[],
  series: NormalizedEmotionSeriesPoint[],
) {
  const maxRow = rows.reduce((max, row) => Math.max(max, row.episode), 0)
  const maxMatrix = matrix.reduce((max, item) => Math.max(max, item.episode), 0)
  const maxSeries = series.reduce((max, item) => Math.max(max, item.episode), 0)
  const inferred = Math.max(maxRow, maxMatrix, maxSeries)
  if (inferred <= 0)
    return 0
  return Math.min(MAX_NORMALIZED_EPISODES, inferred)
}

function normalizeEpisodeRows(value: unknown): NormalizedEpisodeRow[] {
  if (!Array.isArray(value))
    return []

  const byEpisode = new Map<number, NormalizedEpisodeRow>()
  for (const rawRow of value) {
    if (!isRecord(rawRow) || !isPositiveInteger(rawRow.episode))
      continue
    if (byEpisode.has(rawRow.episode))
      continue

    const health: NormalizedEpisodeRow['health']
      = isOneOf(rawRow.health, ['GOOD', 'FAIR', 'PEAK']) ? rawRow.health as NormalizedEpisodeRow['health'] : 'FAIR'
    const primaryHookType = isNonEmptyString(rawRow.primaryHookType) ? rawRow.primaryHookType as string : 'None'
    const aiHighlight = isNonEmptyString(rawRow.aiHighlight) ? rawRow.aiHighlight as string : DEFAULT_AI_HIGHLIGHT

    byEpisode.set(rawRow.episode, {
      episode: rawRow.episode,
      health,
      primaryHookType,
      aiHighlight,
    })
  }

  return [...byEpisode.values()].sort((a, b) => a.episode - b.episode)
}

function fillEpisodeRows(rows: NormalizedEpisodeRow[], totalEpisodes: number): NormalizedEpisodeRow[] {
  const byEpisode = new Map(rows.map(row => [row.episode, row]))
  const filled: NormalizedEpisodeRow[] = []

  for (let episode = 1; episode <= totalEpisodes; episode++) {
    const existing = byEpisode.get(episode)
    if (existing != null) {
      filled.push(existing)
      continue
    }

    filled.push({
      episode,
      health: 'FAIR',
      primaryHookType: 'None',
      aiHighlight: DEFAULT_AI_HIGHLIGHT,
    })
  }

  return filled
}

function normalizeDiagnosisMatrix(value: unknown): NormalizedDiagnosisMatrixItem[] {
  if (!Array.isArray(value))
    return []

  const byEpisode = new Map<number, NormalizedDiagnosisMatrixItem>()
  for (const rawItem of value) {
    if (!isRecord(rawItem) || !isPositiveInteger(rawItem.episode))
      continue
    if (byEpisode.has(rawItem.episode))
      continue

    const state: NormalizedDiagnosisMatrixItem['state']
      = isOneOf(rawItem.state, ['optimal', 'issue', 'neutral']) ? rawItem.state as NormalizedDiagnosisMatrixItem['state'] : 'neutral'
    byEpisode.set(rawItem.episode, {
      episode: rawItem.episode,
      state,
    })
  }

  return [...byEpisode.values()].sort((a, b) => a.episode - b.episode)
}

function collectDetailEpisodes(value: unknown, totalEpisodes: number): Set<number> {
  if (!Array.isArray(value))
    return new Set<number>()

  const episodes = new Set<number>()
  for (const rawDetail of value) {
    if (!isRecord(rawDetail) || !isPositiveInteger(rawDetail.episode))
      continue
    if (rawDetail.episode > totalEpisodes)
      continue
    episodes.add(rawDetail.episode)
  }

  return episodes
}

function fillDiagnosisMatrix(
  matrix: NormalizedDiagnosisMatrixItem[],
  detailEpisodes: Set<number>,
  totalEpisodes: number,
): NormalizedDiagnosisMatrixItem[] {
  const byEpisode = new Map(matrix.map(item => [item.episode, item]))
  const filled: NormalizedDiagnosisMatrixItem[] = []

  for (let episode = 1; episode <= totalEpisodes; episode++) {
    const existing = byEpisode.get(episode)
    if (existing == null) {
      filled.push({ episode, state: 'neutral' })
      continue
    }

    if (existing.state === 'optimal' && detailEpisodes.has(episode)) {
      filled.push({ episode, state: 'neutral' })
      continue
    }
    filled.push(existing)
  }

  return filled
}

function normalizeEmotionSeries(value: unknown): NormalizedEmotionSeriesPoint[] {
  if (!Array.isArray(value))
    return []

  const byEpisode = new Map<number, NormalizedEmotionSeriesPoint>()
  for (const rawPoint of value) {
    if (!isRecord(rawPoint) || !isPositiveInteger(rawPoint.episode))
      continue
    if (byEpisode.has(rawPoint.episode))
      continue

    byEpisode.set(rawPoint.episode, {
      episode: rawPoint.episode,
      value: clampNumber(rawPoint.value, 0, 100, 0),
    })
  }

  return [...byEpisode.values()].sort((a, b) => a.episode - b.episode)
}

function fillEmotionSeries(series: NormalizedEmotionSeriesPoint[], totalEpisodes: number): NormalizedEmotionSeriesPoint[] {
  const byEpisode = new Map(series.map(point => [point.episode, point]))
  const filled: NormalizedEmotionSeriesPoint[] = []
  let lastValue = 0

  for (let episode = 1; episode <= totalEpisodes; episode++) {
    const existing = byEpisode.get(episode)
    if (existing != null) {
      lastValue = existing.value
      filled.push(existing)
      continue
    }
    filled.push({ episode, value: lastValue })
  }

  return filled
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (!isFiniteNumber(value))
    return fallback
  return Math.max(min, Math.min(max, value))
}

function validateNetworkScorePayload(value: unknown) {
  if (!isRecord(value))
    return 'payload must be an object.'
  if (!isRecord(value.score))
    return 'score is required.'
  if (!isRecord(value.presentation))
    return 'presentation is required.'

  const score = value.score
  if (!isFiniteNumber(score.total_110) || !isInRange(score.total_110, 0, 110))
    return 'score.total_110 out of range.'
  if (!isFiniteNumber(score.overall_100) || !isInRange(score.overall_100, 0, 100))
    return 'score.overall_100 out of range.'
  if (!isOneOf(score.grade, ['S+', 'S', 'A+', 'A', 'B', 'C']))
    return 'score.grade invalid.'
  if (!isRecord(score.breakdown_110))
    return 'score.breakdown_110 missing.'

  const breakdown = score.breakdown_110
  if (!isFiniteNumber(breakdown.pay) || !isInRange(breakdown.pay, 0, 50))
    return 'score.breakdown_110.pay invalid.'
  if (!isFiniteNumber(breakdown.story) || !isInRange(breakdown.story, 0, 30))
    return 'score.breakdown_110.story invalid.'
  if (!isFiniteNumber(breakdown.market) || !isInRange(breakdown.market, 0, 20))
    return 'score.breakdown_110.market invalid.'
  if (!isFiniteNumber(breakdown.potential) || !isInRange(breakdown.potential, 0, 10))
    return 'score.breakdown_110.potential invalid.'

  const expectedTotal = breakdown.pay + breakdown.story + breakdown.market + breakdown.potential
  if (Math.abs(expectedTotal - score.total_110) > 0.01)
    return 'score.total_110 inconsistent with breakdown_110.'
  const expectedOverall = Math.round((score.total_110 / 110) * 100)
  if (score.overall_100 !== expectedOverall)
    return 'score.overall_100 inconsistent with total_110.'

  const presentation = value.presentation
  if (!isNonEmptyString(presentation.commercialSummary))
    return 'presentation.commercialSummary invalid.'
  if (!isRecord(presentation.dimensionNarratives))
    return 'presentation.dimensionNarratives missing.'
  if (!isNonEmptyString(presentation.dimensionNarratives.monetization))
    return 'presentation.dimensionNarratives.monetization invalid.'
  if (!isNonEmptyString(presentation.dimensionNarratives.story))
    return 'presentation.dimensionNarratives.story invalid.'
  if (!isNonEmptyString(presentation.dimensionNarratives.market))
    return 'presentation.dimensionNarratives.market invalid.'

  if (!isRecord(presentation.charts) || !isRecord(presentation.charts.emotion) || !isRecord(presentation.charts.conflict))
    return 'presentation.charts invalid.'
  const emotion = presentation.charts.emotion
  const conflict = presentation.charts.conflict
  if (!Array.isArray(emotion.series) || emotion.series.length === 0)
    return 'presentation.charts.emotion.series invalid.'
  if (!Array.isArray(emotion.anchors) || emotion.anchors.length !== 3)
    return 'presentation.charts.emotion.anchors invalid.'
  if (!isNonEmptyString(emotion.caption))
    return 'presentation.charts.emotion.caption invalid.'
  if (!Array.isArray(conflict.phases) || conflict.phases.length !== 6)
    return 'presentation.charts.conflict.phases invalid.'
  if (!isNonEmptyString(conflict.caption))
    return 'presentation.charts.conflict.caption invalid.'

  if (!Array.isArray(presentation.episodeRows) || presentation.episodeRows.length === 0)
    return 'presentation.episodeRows invalid.'
  const rowEpisodes = new Set<number>()
  for (const row of presentation.episodeRows) {
    if (!isRecord(row))
      return 'episodeRows entry invalid.'
    if (!isPositiveInteger(row.episode))
      return 'episodeRows.episode invalid.'
    if (!isOneOf(row.health, ['GOOD', 'FAIR', 'PEAK']))
      return 'episodeRows.health invalid.'
    if (!isNonEmptyString(row.primaryHookType))
      return 'episodeRows.primaryHookType invalid.'
    if (!isNonEmptyString(row.aiHighlight))
      return 'episodeRows.aiHighlight invalid.'
    rowEpisodes.add(row.episode)
  }
  const totalEpisodes = presentation.episodeRows.length
  for (let episode = 1; episode <= totalEpisodes; episode++) {
    if (!rowEpisodes.has(episode))
      return 'episodeRows must be continuous from 1..N.'
  }

  for (const point of emotion.series) {
    if (!isRecord(point))
      return 'emotion.series point invalid.'
    if (!isPositiveInteger(point.episode))
      return 'emotion.series.episode invalid.'
    if (!isFiniteNumber(point.value) || !isInRange(point.value, 0, 100))
      return 'emotion.series.value invalid.'
  }

  const anchors = emotion.anchors as unknown[]
  const expectedAnchorSlots = ['Start', 'Mid', 'End']
  for (let index = 0; index < anchors.length; index++) {
    const anchor = anchors[index]
    if (!isRecord(anchor))
      return 'emotion.anchors entry invalid.'
    if (anchor.slot !== expectedAnchorSlots[index])
      return 'emotion.anchors slots must be Start, Mid, End.'
    if (!isPositiveInteger(anchor.episode))
      return 'emotion.anchors.episode invalid.'
    if (!isFiniteNumber(anchor.value) || !isInRange(anchor.value, 0, 100))
      return 'emotion.anchors.value invalid.'
  }

  const phases = conflict.phases as unknown[]
  const expectedPhases = ['Start', 'Inc.', 'Rise', 'Climax', 'Fall', 'Res.']
  for (let index = 0; index < phases.length; index++) {
    const phase = phases[index]
    if (!isRecord(phase))
      return 'conflict.phases entry invalid.'
    if (phase.phase !== expectedPhases[index])
      return 'conflict.phases order invalid.'
    if (!isFiniteNumber(phase.ext) || !isInRange(phase.ext, 0, 100))
      return 'conflict.phases.ext invalid.'
    if (!isFiniteNumber(phase.int) || !isInRange(phase.int, 0, 100))
      return 'conflict.phases.int invalid.'
  }

  if (!isRecord(presentation.diagnosis))
    return 'presentation.diagnosis invalid.'
  const diagnosis = presentation.diagnosis
  if (!Array.isArray(diagnosis.matrix) || diagnosis.matrix.length !== totalEpisodes)
    return 'diagnosis.matrix invalid.'
  if (!Array.isArray(diagnosis.details))
    return 'diagnosis.details invalid.'
  if (!isRecord(diagnosis.overview))
    return 'diagnosis.overview invalid.'
  if (!isNonEmptyString(diagnosis.overview.integritySummary))
    return 'diagnosis.overview.integritySummary invalid.'
  if (!isPositiveInteger(diagnosis.overview.pacingFocusEpisode))
    return 'diagnosis.overview.pacingFocusEpisode invalid.'
  if (!isNonEmptyString(diagnosis.overview.pacingIssueLabel))
    return 'diagnosis.overview.pacingIssueLabel invalid.'
  if (!isNonEmptyString(diagnosis.overview.pacingIssueReason))
    return 'diagnosis.overview.pacingIssueReason invalid.'

  const matrixStateByEpisode = new Map<number, string>()
  for (const item of diagnosis.matrix) {
    if (!isRecord(item))
      return 'diagnosis.matrix entry invalid.'
    if (!isPositiveInteger(item.episode))
      return 'diagnosis.matrix.episode invalid.'
    if (!isOneOf(item.state, ['optimal', 'issue', 'neutral']))
      return 'diagnosis.matrix.state invalid.'
    matrixStateByEpisode.set(item.episode, item.state as string)
  }
  for (let episode = 1; episode <= totalEpisodes; episode++) {
    if (!matrixStateByEpisode.has(episode))
      return 'diagnosis.matrix must cover 1..N.'
  }

  for (const detail of diagnosis.details) {
    if (!isRecord(detail))
      return 'diagnosis.details entry invalid.'
    if (!isPositiveInteger(detail.episode))
      return 'diagnosis.details.episode invalid.'
    if (!isOneOf(detail.issueCategory, ['structure', 'pacing', 'mixed']))
      return 'diagnosis.details.issueCategory invalid.'
    if (!isNonEmptyString(detail.issueLabel))
      return 'diagnosis.details.issueLabel invalid.'
    if (!isNonEmptyString(detail.issueReason))
      return 'diagnosis.details.issueReason invalid.'
    if (!isNonEmptyString(detail.suggestion))
      return 'diagnosis.details.suggestion invalid.'
    if (!isNonEmptyString(detail.hookType))
      return 'diagnosis.details.hookType invalid.'
    if (!isOneOf(detail.emotionLevel, ['Low', 'Medium', 'High']))
      return 'diagnosis.details.emotionLevel invalid.'
    if (!isOneOf(detail.conflictDensity, ['LOW', 'MEDIUM', 'HIGH']))
      return 'diagnosis.details.conflictDensity invalid.'
    if (!isFiniteNumber(detail.pacingScore) || !isInRange(detail.pacingScore, 0, 10))
      return 'diagnosis.details.pacingScore invalid.'
    if (!isFiniteNumber(detail.signalPercent) || !isInRange(detail.signalPercent, 0, 100))
      return 'diagnosis.details.signalPercent invalid.'

    const matrixState = matrixStateByEpisode.get(detail.episode)
    if (matrixState !== 'issue' && matrixState !== 'neutral')
      return 'diagnosis.details can only include issue/neutral episodes.'
  }

  return null
}

function persistRunFromStream(rid: string, score: AnalysisScoreResult) {
  const session = sessions.get(rid)
  if (session == null)
    return

  const fallbackEpisodeCount = score.presentation.episodeRows.length
  const fallbackMeta = {
    createdAt: new Date().toISOString(),
    language: 'en' as const,
    tokenizer: 'whitespace' as const,
    totalEpisodes: fallbackEpisodeCount,
    isCompleted: true,
  }

  const fallbackL1 = {
    episodes: Array.from({ length: fallbackEpisodeCount }).map((_, index) => ({
      episode: index + 1,
      tokenCount: 0,
      wordCount: 0,
      emotionHits: 0,
      conflictHits: 0,
      conflictExtHits: 0,
      conflictIntHits: 0,
      vulgarHits: 0,
      tabooHits: 0,
    })),
    totals: {
      tokenCount: 0,
      wordCount: 0,
      emotionHits: 0,
      conflictHits: 0,
      conflictExtHits: 0,
      conflictIntHits: 0,
      vulgarHits: 0,
      tabooHits: 0,
    },
  }

  const run = asStoredRun({
    meta: isRecord(session.persistedMeta) ? session.persistedMeta : fallbackMeta,
    l1: isRecord(session.persistedL1) ? session.persistedL1 : fallbackL1,
    previewScore: toPreviewScoreFromScore(score),
    score,
  })

  if (run == null)
    return

  writeRun(rid, run)
}

function toStoredScore(value: NetworkScorePayload): AnalysisScoreResult {
  return {
    meta: {
      rulesetVersion: 'stream-v2',
      redlineHit: false,
      redlineEvidence: [],
      generatedAt: new Date().toISOString(),
    },
    score: value.score,
    presentation: value.presentation,
  }
}

function toStreamFormData(text: string, file: File | null) {
  const formData = new FormData()
  if (file != null)
    formData.set('file', file, file.name)
  if (text.trim().length > 0)
    formData.set('text', text)
  return formData
}

function toScoreStreamUrl(apiOrigin: string) {
  const origin = apiOrigin.trim()
  if (origin.length === 0)
    throw new Error('Missing stream API origin.')
  return new URL('/api/score/stream', origin).toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1
}

function isInRange(value: number, min: number, max: number) {
  return value >= min && value <= max
}

function isOneOf(value: unknown, options: string[]) {
  return typeof value === 'string' && options.includes(value)
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}
