import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import { parseAndPreflight } from '@/lib/analysis/input-contract'
import { computeL1Stats } from '@/lib/analysis/l1-stats'
import { isRecord } from '@/lib/type-guards'

interface StartMessage {
  type: 'start'
  input: string
}

interface EpisodeBrief {
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

interface ScoreApiRequest {
  episodeBriefs: EpisodeBrief[]
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
    activity: 'Preparing compact episode briefs for AI scoring.',
  })

  progress({
    phase: 'structure_story',
    percent: 40,
    activity: 'Extracting opening, ending, and key event packets.',
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

  const l1ByEpisode = new Map(l1.episodes.map(item => [item.episode, item]))
  const sortedEpisodes = result.episodes
    .sort((a, b) => a.number - b.number)
  const episodeBriefs = sortedEpisodes
    .map((episode, index) => {
      const stats = l1ByEpisode.get(episode.number)
      return {
        // 归一化为连续 1..N，避免原始缺号导致后端拒绝。
        episode: index + 1,
        opening: extractOpening(episode.text),
        ending: extractEnding(episode.text),
        keyEvents: extractKeyEvents(episode.text),
        tokenCount: stats?.tokenCount ?? 1,
        wordCount: stats?.wordCount ?? 1,
        emotionRaw: stats?.emotionHits ?? 0,
        conflictExtRaw: stats?.conflictExtHits ?? 0,
        conflictIntRaw: stats?.conflictIntHits ?? 0,
        paywallFlag: episode.paywallCount > 0,
      } satisfies EpisodeBrief
    })

  post({
    type: 'prepared',
    payload: {
      meta: result.meta,
      l1,
      scoreRequest: {
        episodeBriefs,
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
      },
    },
  })
}

function extractOpening(text: string) {
  return compact(text.slice(0, 360), 320)
}

function extractEnding(text: string) {
  const sliceStart = Math.max(0, text.length - 360)
  return compact(text.slice(sliceStart), 320)
}

function extractKeyEvents(text: string) {
  const candidates = splitSentences(text)
  if (candidates.length === 0) {
    const opening = extractOpening(text)
    const ending = extractEnding(text)
    return [
      opening.length > 0 ? opening : 'Opening setup is present.',
      'A narrative transition is detected in this episode.',
      ending.length > 0 ? ending : 'Ending beat is present.',
    ].map(item => compact(item, 120))
  }

  const selected = new Set<string>()
  const weighted = candidates
    .map(sentence => ({ sentence, score: eventScore(sentence) }))
    .sort((a, b) => b.score - a.score)

  for (const item of weighted) {
    if (selected.size >= 6)
      break
    selected.add(item.sentence)
  }

  // 保底 3 条，避免摘要过于稀疏。
  const first = candidates[0]
  const mid = candidates[Math.floor(candidates.length / 2)]
  const last = candidates[candidates.length - 1]
  for (const sentence of [first, mid, last]) {
    if (sentence != null && selected.size < 3)
      selected.add(sentence)
  }

  while (selected.size < 3) {
    selected.add('Narrative beat requires closer review for this episode.')
  }

  return Array.from(selected).slice(0, 6)
}

function splitSentences(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/[\n.!?。！？；;]+/)
    .map(sentence => compact(sentence, 120))
    .filter(sentence => sentence.length >= 12)
}

function eventScore(sentence: string) {
  const lower = sentence.toLowerCase()
  let score = 0
  if (/[!?！？]/.test(sentence))
    score += 2
  if (/reveal|betray|decide|choose|attack|rescue|truth|secret|conflict|kiss|death|plan|threat/.test(lower))
    score += 3
  if (/揭露|背叛|决定|选择|攻击|拯救|真相|秘密|冲突|亲吻|死亡|计划|威胁/.test(sentence))
    score += 3
  score += Math.min(3, Math.floor(sentence.length / 28))
  return score
}

function compact(value: string, max = 320) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}
