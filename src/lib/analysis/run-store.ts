import type { AnalysisResult } from '@/lib/analysis/analysis-result'
import { isNumber, isRecord, isString } from '@/lib/type-guards'

export type StoredRun = Pick<AnalysisResult, 'l1' | 'meta' | 'previewScore' | 'score'>

export interface RunIndexEntry {
  rid: string
  createdAt: string
  lastAccessAt: string
  title?: string
  approxBytes: number
}

const INDEX_KEY = 'sdicap:runs:index'
const LAST_RID_KEY = 'sdicap:runs:last'

function runKey(rid: string) {
  return `sdicap:run:${rid}`
}

function runInputKey(rid: string) {
  return `sdicap:run:${rid}:input`
}

interface RunStoreCache {
  indexRaw: string | null
  indexValue: RunIndexEntry[] | null
  lastRidRaw: string | null
  lastRidValue: string | null
  runRawByRid: Map<string, string | null>
  inputRawByRid: Map<string, string | null>
}

const cache: RunStoreCache = {
  indexRaw: null,
  indexValue: null,
  lastRidRaw: null,
  lastRidValue: null,
  runRawByRid: new Map(),
  inputRawByRid: new Map(),
}

function invalidateCache() {
  cache.indexRaw = null
  cache.indexValue = null
  cache.lastRidRaw = null
  cache.lastRidValue = null
  cache.runRawByRid.clear()
  cache.inputRawByRid.clear()
}

function parseJson<T>(raw: string | null): T | null {
  if (raw == null || raw.length === 0)
    return null
  try {
    return JSON.parse(raw) as T
  }
  catch {
    return null
  }
}

function approxBytesUtf16(raw: string) {
  return raw.length * 2
}

function isQuotaExceeded(error: unknown) {
  if (!(error instanceof DOMException))
    return false
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

function uniqueIndex(entries: RunIndexEntry[]) {
  const seen = new Set<string>()
  const ordered: RunIndexEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.rid))
      continue
    seen.add(entry.rid)
    ordered.push(entry)
  }
  return ordered
}

function isMeta(value: unknown): value is StoredRun['meta'] {
  if (!isRecord(value))
    return false
  if (!isString(value.createdAt))
    return false
  if (!isString(value.language))
    return false
  if (!isString(value.tokenizer))
    return false
  if (value.title != null && !isString(value.title))
    return false
  if (value.totalEpisodes != null && !isNumber(value.totalEpisodes))
    return false
  if (value.isCompleted != null && typeof value.isCompleted !== 'boolean')
    return false
  return true
}

function isEpisode(value: unknown): value is StoredRun['l1']['episodes'][number] {
  if (!isRecord(value))
    return false
  return isNumber(value.episode)
    && isNumber(value.tokenCount)
    && isNumber(value.wordCount)
    && isNumber(value.emotionHits)
    && isNumber(value.conflictHits)
    && isNumber(value.conflictExtHits)
    && isNumber(value.conflictIntHits)
    && isNumber(value.vulgarHits)
    && isNumber(value.tabooHits)
}

function isTotals(value: unknown): value is StoredRun['l1']['totals'] {
  if (!isRecord(value))
    return false
  return isNumber(value.tokenCount)
    && isNumber(value.wordCount)
    && isNumber(value.emotionHits)
    && isNumber(value.conflictHits)
    && isNumber(value.conflictExtHits)
    && isNumber(value.conflictIntHits)
    && isNumber(value.vulgarHits)
    && isNumber(value.tabooHits)
}

function isL1(value: unknown): value is StoredRun['l1'] {
  if (!isRecord(value))
    return false
  if (!Array.isArray(value.episodes) || !value.episodes.every(isEpisode))
    return false
  return isTotals(value.totals)
}

function isPreviewScore(value: unknown): value is StoredRun['previewScore'] {
  if (!isRecord(value))
    return false
  if (!isNumber(value.overall100))
    return false
  if (!isString(value.grade))
    return false
  if (!isNumber(value.monetization))
    return false
  if (!isNumber(value.story))
    return false
  if (!isNumber(value.market))
    return false
  return true
}

function isScoreGrade(value: unknown): value is 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C' {
  return value === 'S+' || value === 'S' || value === 'A+' || value === 'A' || value === 'B' || value === 'C'
}

function isAuditItem(value: unknown) {
  if (!isRecord(value))
    return false
  if (!isString(value.id))
    return false
  if (!isString(value.reason))
    return false
  if (!Array.isArray(value.evidence) || !value.evidence.every(isString))
    return false
  if (!isString(value.status))
    return false
  if (!isNumber(value.score) || !isNumber(value.max))
    return false
  return true
}

function isAnalysisScoreResult(value: unknown): value is NonNullable<StoredRun['score']> {
  if (!isRecord(value))
    return false
  if (!isRecord(value.meta) || !isRecord(value.score) || !isRecord(value.audit))
    return false

  if (!isString(value.meta.rulesetVersion))
    return false
  if (value.meta.benchmarkMode !== 'rule-only')
    return false
  if (value.meta.noExternalDataset !== true)
    return false
  if (value.meta.redlineHit != null && typeof value.meta.redlineHit !== 'boolean')
    return false
  if (value.meta.redlineEvidence != null && (!Array.isArray(value.meta.redlineEvidence) || !value.meta.redlineEvidence.every(isString)))
    return false

  if (!isNumber(value.score.total_110))
    return false
  if (!isNumber(value.score.overall_100))
    return false
  if (!isScoreGrade(value.score.grade))
    return false
  if (!isRecord(value.score.breakdown_110))
    return false
  if (!isNumber(value.score.breakdown_110.pay))
    return false
  if (!isNumber(value.score.breakdown_110.story))
    return false
  if (!isNumber(value.score.breakdown_110.market))
    return false
  if (!isNumber(value.score.breakdown_110.potential))
    return false

  if (!Array.isArray(value.audit.items) || !value.audit.items.every(isAuditItem))
    return false
  return true
}

export function asStoredRun(value: unknown): StoredRun | null {
  if (!isRecord(value))
    return null
  if (!isMeta(value.meta))
    return null
  if (!isL1(value.l1))
    return null
  if (!isPreviewScore(value.previewScore))
    return null
  return {
    meta: value.meta,
    l1: value.l1,
    previewScore: value.previewScore,
    score: isAnalysisScoreResult(value.score) ? value.score : undefined,
  }
}

export function parseStoredRun(raw: string | null): StoredRun | null {
  return asStoredRun(parseJson<unknown>(raw))
}

function pruneOldest(entries: RunIndexEntry[]) {
  if (entries.length === 0)
    return { rid: null as string | null, next: entries }
  const sorted = [...entries].sort((a, b) => a.lastAccessAt.localeCompare(b.lastAccessAt))
  const oldest = sorted[0]?.rid ?? null
  const next = entries.filter(e => e.rid !== oldest)
  return { rid: oldest, next }
}

export function createRid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `${now}-${rand}`
}

export function readRunsIndex(): RunIndexEntry[] {
  if (typeof window === 'undefined')
    return []
  const raw = window.localStorage.getItem(INDEX_KEY)
  if (raw === cache.indexRaw && cache.indexValue)
    return cache.indexValue

  const parsed = parseJson<unknown>(raw)
  if (!Array.isArray(parsed))
    return []
  const entries = parsed.filter(isRecord).map((entry) => {
    return {
      rid: typeof entry.rid === 'string' ? entry.rid : '',
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      lastAccessAt: typeof entry.lastAccessAt === 'string' ? entry.lastAccessAt : '',
      title: typeof entry.title === 'string' ? entry.title : undefined,
      approxBytes: typeof entry.approxBytes === 'number' ? entry.approxBytes : 0,
    } satisfies RunIndexEntry
  }).filter(e => e.rid.length > 0)

  const unique = uniqueIndex(entries)
  cache.indexRaw = raw
  cache.indexValue = unique
  return unique
}

export function writeRunsIndex(entries: RunIndexEntry[]) {
  if (typeof window === 'undefined')
    return
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(uniqueIndex(entries)))
}

export function readLastRid(): string | null {
  if (typeof window === 'undefined')
    return null
  const raw = window.localStorage.getItem(LAST_RID_KEY)
  if (raw === cache.lastRidRaw)
    return cache.lastRidValue

  const value = raw == null || raw.length === 0 ? null : raw
  cache.lastRidRaw = raw
  cache.lastRidValue = value
  return value
}

export function writeLastRid(rid: string) {
  if (typeof window === 'undefined')
    return
  window.localStorage.setItem(LAST_RID_KEY, rid)
}

export function readRunRaw(rid: string): string | null {
  if (typeof window === 'undefined')
    return null
  if (rid.trim().length === 0)
    return null
  if (cache.runRawByRid.has(rid))
    return cache.runRawByRid.get(rid) ?? null
  const raw = window.localStorage.getItem(runKey(rid))
  cache.runRawByRid.set(rid, raw)
  return raw
}

export function readRun(rid: string): StoredRun | null {
  return parseStoredRun(readRunRaw(rid))
}

export function readRunInput(rid: string): string | null {
  if (typeof window === 'undefined')
    return null
  if (cache.inputRawByRid.has(rid))
    return cache.inputRawByRid.get(rid) ?? null
  const raw = window.localStorage.getItem(runInputKey(rid))
  cache.inputRawByRid.set(rid, raw)
  return raw
}

export function writeRunInput(rid: string, input: string) {
  if (typeof window === 'undefined')
    return
  window.localStorage.setItem(runInputKey(rid), input)
  broadcastStoreChange()
}

export function deleteRunInput(rid: string) {
  if (typeof window === 'undefined')
    return
  window.localStorage.removeItem(runInputKey(rid))
  broadcastStoreChange()
}

export function deleteRun(rid: string) {
  if (typeof window === 'undefined')
    return
  window.localStorage.removeItem(runKey(rid))
  const nextIndex = readRunsIndex().filter(entry => entry.rid !== rid)
  writeRunsIndex(nextIndex)
  broadcastStoreChange()
}

export function touchRun(rid: string) {
  if (typeof window === 'undefined')
    return
  // Access timestamp is bookkeeping only; avoid store-wide broadcasts.
  const now = new Date().toISOString()
  const index = readRunsIndex()
  const next = index.map((entry) => {
    if (entry.rid !== rid)
      return entry
    return { ...entry, lastAccessAt: now }
  })
  invalidateCache()
  writeRunsIndex(next)
}

export function writeRun(rid: string, run: StoredRun) {
  if (typeof window === 'undefined')
    return

  const raw = JSON.stringify(run)
  const now = new Date().toISOString()
  const entry: RunIndexEntry = {
    rid,
    createdAt: run.meta.createdAt || now,
    lastAccessAt: now,
    title: run.meta.title,
    approxBytes: approxBytesUtf16(raw),
  }

  let index = readRunsIndex().filter(e => e.rid !== rid)
  index.unshift(entry)

  let attempts = 0
  while (attempts < 32) {
    try {
      window.localStorage.setItem(runKey(rid), raw)
      writeRunsIndex(index)
      writeLastRid(rid)
      broadcastStoreChange()
      return
    }
    catch (error) {
      if (!isQuotaExceeded(error))
        throw error

      const pruned = pruneOldest(index)
      if (pruned.rid == null || pruned.rid.length === 0)
        throw error
      window.localStorage.removeItem(runKey(pruned.rid))
      window.localStorage.removeItem(runInputKey(pruned.rid))
      index = pruned.next
      attempts += 1
    }
  }

  throw new Error('Unable to persist run: storage quota exceeded.')
}

export function broadcastStoreChange() {
  if (typeof window === 'undefined')
    return
  invalidateCache()
  window.dispatchEvent(new Event('sdicap:store'))
}

export function subscribeRunStore(callback: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const storageHandler = () => {
    invalidateCache()
    callback()
  }
  const storeHandler = () => callback()
  window.addEventListener('storage', storageHandler, { passive: true })
  window.addEventListener('sdicap:store', storeHandler as EventListener, { passive: true })
  return () => {
    window.removeEventListener('storage', storageHandler)
    window.removeEventListener('sdicap:store', storeHandler as EventListener)
  }
}
