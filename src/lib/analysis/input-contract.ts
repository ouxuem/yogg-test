import type { AnalysisLanguage, AnalysisTokenizer } from '@/lib/analysis/detect-language'
import { detectLanguage, detectLanguageMode, detectTokenizer } from '@/lib/analysis/detect-language'

type PreflightErrorCode
  = | 'ERR_TOO_SHORT'
    | 'ERR_NO_EPISODE_HEADERS'
    | 'ERR_INVALID_TOTAL_EPISODES'
    | 'ERR_MIXED_LANGUAGE'
    | 'ERR_MISSING_EPISODE'
    | 'ERR_DUPLICATE_EPISODE'
    | 'ERR_OUT_OF_ORDER_EPISODE'
    | 'ERR_TOO_MANY_PAYWALLS'
    | 'ERR_MULTI_PAYWALL_IN_EPISODE'
    | 'ERR_PAYWALL_OUT_OF_RANGE'

type PreflightSeverity = 'fatal' | 'warn'

interface PreflightIssue {
  code: PreflightErrorCode
  message: string
  severity: PreflightSeverity
}

interface ParsedMeta {
  title?: string
  totalEpisodes?: number
  isCompleted?: boolean
  language: AnalysisLanguage
  tokenizer: AnalysisTokenizer
}

interface ParsedEpisode {
  number: number
  text: string
  paywallCount: number
}

type CompletionState = 'completed' | 'incomplete' | 'unknown'
type IngestMode = 'official' | 'provisional'

interface ParseIngest {
  declaredTotalEpisodes?: number
  inferredTotalEpisodes: number
  totalEpisodesForScoring: number
  observedEpisodeCount: number
  completionState: CompletionState
  coverageRatio: number
  mode: IngestMode
}

interface ParseResult {
  meta: ParsedMeta
  ingest: ParseIngest
  episodes: ParsedEpisode[]
  errors: PreflightIssue[]
  warnings: PreflightIssue[]
}

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, '\n')
}

function parseBooleanWord(value: string | undefined) {
  if (value == null)
    return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true')
    return true
  if (normalized === 'false')
    return false
  return undefined
}

function isEpisodeHeaderCandidate(text: string) {
  const trimmed = text.trim()
  if (trimmed.length === 0)
    return false

  const upper = trimmed.toUpperCase()
  if (upper.startsWith('EPISODE'))
    return true
  if (upper.startsWith('EP#'))
    return true
  if (upper.startsWith('EP '))
    return true
  if (/^EP\d+/.test(upper))
    return true
  if (/^第\s*\d+\s*集/.test(trimmed))
    return true
  return false
}

function inferFallbackTitle(sample: string) {
  const lines = sample.split('\n').slice(0, 24)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.length === 0)
      continue

    const upper = line.toUpperCase()
    if (upper.startsWith('TITLE:') || upper.startsWith('TOTAL_EPISODES:') || upper.startsWith('IS_COMPLETED:'))
      continue

    let hashIndex = 0
    while (hashIndex < line.length && line[hashIndex] === '#' && hashIndex < 6)
      hashIndex += 1
    if (hashIndex > 0 && hashIndex < line.length && isAsciiWhitespace(line[hashIndex])) {
      const candidate = line.slice(hashIndex).trim()
      if (candidate.length > 0 && !isEpisodeHeaderCandidate(candidate))
        return candidate
      continue
    }

    if (line.startsWith('《') && line.endsWith('》') && line.length > 2) {
      const candidate = line.slice(1, -1).trim()
      if (candidate.length > 0 && !isEpisodeHeaderCandidate(candidate))
        return candidate
    }
  }
  return undefined
}

function parseMeta(input: string) {
  let title: string | undefined
  let totalEpisodes: number | undefined
  let isCompleted: boolean | undefined

  const sample = input.slice(0, 6000)

  // 允许 TITLE / TOTAL_EPISODES / IS_COMPLETED 写在同一行，避免模板过于僵硬。
  const titleHeader = /TITLE\s*:/i.exec(sample)
  let titleValue: string | undefined
  if (titleHeader != null) {
    const tail = sample.slice(titleHeader.index + titleHeader[0].length)
    const totalOffset = tail.search(/\bTOTAL_EPISODES\s*:/i)
    const completedOffset = tail.search(/\bIS_COMPLETED\s*:/i)
    const lineOffset = tail.indexOf('\n')
    const endOffsets = [totalOffset, completedOffset, lineOffset].filter(offset => offset >= 0)
    const end = endOffsets.length > 0 ? Math.min(...endOffsets) : tail.length
    titleValue = tail.slice(0, end).trim()
  }

  if (titleValue != null && titleValue.length > 0)
    title = titleValue

  const totalEpisodesMatch = sample.match(/TOTAL_EPISODES\s*:\s*(\d+)/i)
  if (totalEpisodesMatch?.[1] != null)
    totalEpisodes = Number.parseInt(totalEpisodesMatch[1], 10)

  const completedMatch = sample.match(/IS_COMPLETED\s*:\s*(true|false)/i)
  if (completedMatch?.[1] != null)
    isCompleted = parseBooleanWord(completedMatch[1])

  if (title == null)
    title = inferFallbackTitle(sample)

  return { title, totalEpisodes, isCompleted }
}

function isAsciiWhitespace(char: string | undefined) {
  return char != null && /\s/.test(char)
}

function skipWhitespace(input: string, start: number) {
  let index = start
  while (isAsciiWhitespace(input[index]))
    index += 1
  return index
}

function parseUnsignedInt(input: string, start: number) {
  let index = start
  while (index < input.length && input[index] != null && /\d/.test(input[index]))
    index += 1
  if (index === start)
    return null
  return {
    value: Number.parseInt(input.slice(start, index), 10),
    next: index,
  }
}

function skipMarkdownHeadingPrefix(input: string, start: number) {
  let index = start
  if (input[index] !== '#')
    return index

  while (input[index] === '#')
    index += 1

  return skipWhitespace(input, index)
}

function skipEpisodeDecorators(input: string, start: number) {
  let index = start
  while (index < input.length) {
    const char = input[index]
    if (char == null)
      break
    if (isAsciiWhitespace(char) || char === '*' || char === '-' || char === '_' || char === '~' || char === '`' || char === '•' || char === '|') {
      index += 1
      continue
    }
    break
  }
  return index
}

function hasShotStyleSuffix(input: string, numberEnd: number) {
  const next = skipWhitespace(input, numberEnd)
  const mark = input[next]
  if (mark !== '-' && mark !== '–')
    return false
  const afterDash = skipWhitespace(input, next + 1)
  return /\d/.test(input[afterDash] ?? '')
}

function normalizeEpisodeHeaderCandidates(input: string) {
  // 把行内的分集标识强制切到新行，避免 PDF 抽取把多集压成一行导致漏解析。
  return input
    .replace(/([^\n])\s+(?=(?:\*+\s*)?(?:EPISODE|EP)\s*(?:#\s*)?\d+(?!\s*[-–]\s*\d)\b)/gi, '$1\n')
    .replace(/([^\n])\s+(?=(?:\*+\s*)?第\s*\d+(?!\s*[-–]\s*\d)\s*集\b)/g, '$1\n')
}

function parseEpisodeHeader(line: string) {
  const leadingSpaces = line.length - line.trimStart().length
  let index = skipEpisodeDecorators(line, skipMarkdownHeadingPrefix(line, leadingSpaces))

  const remainingUpper = line.slice(index).toUpperCase()
  if (remainingUpper.startsWith('EPISODE')) {
    index += 'EPISODE'.length
    index = skipWhitespace(line, index)
    if (line[index] === '#') {
      index += 1
      index = skipWhitespace(line, index)
    }

    const parsedNumber = parseUnsignedInt(line, index)
    if (parsedNumber == null)
      return null
    if (hasShotStyleSuffix(line, parsedNumber.next))
      return null

    return {
      number: parsedNumber.value,
      headerLength: parsedNumber.next,
    }
  }

  if (remainingUpper.startsWith('EP')) {
    index += 'EP'.length
    index = skipWhitespace(line, index)
    if (line[index] === '#') {
      index += 1
      index = skipWhitespace(line, index)
    }

    const parsedNumber = parseUnsignedInt(line, index)
    if (parsedNumber == null)
      return null
    if (hasShotStyleSuffix(line, parsedNumber.next))
      return null

    return {
      number: parsedNumber.value,
      headerLength: parsedNumber.next,
    }
  }

  if (line[index] === '第') {
    index += 1
    index = skipWhitespace(line, index)
    const parsedNumber = parseUnsignedInt(line, index)
    if (parsedNumber == null)
      return null
    if (hasShotStyleSuffix(line, parsedNumber.next))
      return null

    index = skipWhitespace(line, parsedNumber.next)
    if (line[index] !== '集')
      return null

    return {
      number: parsedNumber.value,
      headerLength: index + 1,
    }
  }

  return null
}

function parseEpisodes(input: string): ParsedEpisode[] {
  const text = normalizeEpisodeHeaderCandidates(normalizeNewlines(input))
  const lines = text.split('\n')
  const hits: Array<{ number: number, index: number, contentStart: number, inlineText: string }> = []

  let offset = 0
  for (const line of lines) {
    const header = parseEpisodeHeader(line)
    if (header != null) {
      const headerTail = line.slice(header.headerLength)
        .replace(/^[-:：*|#\s]+/, '')
        .replace(/[*|#\s]+$/, '')
        .trim()
      const lineEnd = offset + line.length
      const contentStart = lineEnd < text.length && text[lineEnd] === '\n' ? lineEnd + 1 : lineEnd
      hits.push({
        number: header.number,
        index: offset,
        contentStart,
        inlineText: headerTail,
      })
    }
    offset += line.length + 1
  }

  return hits.map((hit, idx) => {
    const nextIndex = hits[idx + 1]?.index ?? text.length
    const body = text.slice(hit.contentStart, nextIndex).trim()
    const content = [hit.inlineText, body].filter(Boolean).join('\n').trim()
    const paywallCount = (content.match(/\[PAYWALL\]/gi) ?? []).length
    return { number: hit.number, text: content, paywallCount }
  })
}

function countPaywalls(text: string) {
  return (text.match(/\[PAYWALL\]/gi) ?? []).length
}

function looksLikeTocOrPageHeader(text: string) {
  const trimmed = text.trim()
  if (trimmed.length === 0)
    return true

  // 常见目录关键词（中/英），通常位于开头且内容较短。
  // 用非捕获组，避免 unused capturing group lint；“目录”是“目\s*录”的子集，去掉冗余分支。
  if (/^(?:目\s*录|contents)\b/i.test(trimmed))
    return true

  // 目录条目常见形态：标题 + 引导点/省略号 + 页码（末尾数字）。
  // e.g. "第12集 反转…… 37" / "EP 3 ... 8"
  if (/[.·…]{3,}\s*\d{1,4}\s*$/.test(trimmed))
    return true

  // 页面页眉/页脚常见：极短、主要是数字/符号（例如页码行）。
  if (/^\d{1,4}$/.test(trimmed))
    return true

  return false
}

function episodeQuality(text: string) {
  const trimmed = text.trim()
  if (trimmed.length === 0)
    return -10_000

  const lines = trimmed.split('\n')
  const shortBlock = trimmed.length < 140 && lines.length <= 3
  const tocish = looksLikeTocOrPageHeader(trimmed)

  // 以内容长度为主，叠加启发式惩罚，优先保留“像正文”的分集块。
  let score = trimmed.length
  if (shortBlock)
    score -= 2_000
  if (tocish)
    score -= 6_000
  return score
}

function repairEpisodes(rawEpisodes: ParsedEpisode[]): ParsedEpisode[] {
  if (rawEpisodes.length <= 1) {
    const only = rawEpisodes.at(0)
    if (only == null)
      return rawEpisodes
    const text = only.text.trim()
    return [{ number: only.number, text, paywallCount: countPaywalls(text) }]
  }

  // 1) 合并相邻的同集号块：PDF 页眉/页脚常会重复打印“第X集”，会把正文切碎。
  const merged: Array<{ number: number, text: string }> = []
  for (const episode of rawEpisodes) {
    const text = episode.text.trim()
    if (text.length === 0)
      continue

    const last = merged.at(-1)
    if (last && last.number === episode.number) {
      last.text = `${last.text}\n${text}`.trim()
      continue
    }
    merged.push({ number: episode.number, text })
  }

  // 2) 对重复集号去重：目录(TOC)/页眉页脚往往会生成“短而像目录”的块；
  //    这里保留质量最高（通常也是最长、最像正文）的那一块。
  const groups = new Map<number, Array<{ number: number, text: string, order: number }>>()
  merged.forEach((ep, order) => {
    const arr = groups.get(ep.number) ?? []
    arr.push({ number: ep.number, text: ep.text, order })
    groups.set(ep.number, arr)
  })

  const deduped: ParsedEpisode[] = []
  for (const [number, items] of groups) {
    let best = items[0]
    for (const item of items.slice(1)) {
      if (episodeQuality(item.text) > episodeQuality(best.text))
        best = item
    }
    const bestText = best.text.trim()
    if (bestText.length === 0)
      continue
    deduped.push({ number, text: bestText, paywallCount: countPaywalls(bestText) })
  }

  // 3) 强制按集号排序，修复 PDF 抽取导致的乱序（多栏/目录/浮动文本常见）。
  deduped.sort((a, b) => a.number - b.number)
  return deduped
}

function missingEpisodes(episodes: number[], total: number) {
  const present = new Set(episodes)
  const missing: number[] = []
  for (let i = 1; i <= total; i++) {
    if (!present.has(i))
      missing.push(i)
  }
  return missing
}

export function parseAndPreflight(rawInput: string): ParseResult {
  const input = normalizeNewlines(rawInput)
  const episodes = repairEpisodes(parseEpisodes(input))
  const episodeCorpus = episodes.map(ep => ep.text).join('\n')
  const corpus = episodeCorpus.length > 0 ? episodeCorpus : input
  const languageMode = detectLanguageMode(corpus)
  const language = detectLanguage(corpus)
  const tokenizer = detectTokenizer(language)

  const metaParsed = parseMeta(input)
  const declaredTotalEpisodes = metaParsed.totalEpisodes
  const isCompleted = metaParsed.isCompleted
  const inferredTotalEpisodes = episodes.length > 0
    ? Math.max(...episodes.map(ep => ep.number))
    : 0
  const totalEpisodesForScoring = declaredTotalEpisodes ?? inferredTotalEpisodes
  const observedEpisodeCount = episodes.length
  const completionState: CompletionState = isCompleted === true
    ? 'completed'
    : isCompleted === false
      ? 'incomplete'
      : 'unknown'
  const coverageRatio = totalEpisodesForScoring > 0
    ? Math.min(1, observedEpisodeCount / totalEpisodesForScoring)
    : 0

  const meta: ParsedMeta = {
    title: metaParsed.title,
    totalEpisodes: totalEpisodesForScoring > 0 ? totalEpisodesForScoring : undefined,
    isCompleted,
    language,
    tokenizer,
  }

  const errors: PreflightIssue[] = []
  const warnings: PreflightIssue[] = []

  const pushIssue = (severity: PreflightSeverity, code: PreflightErrorCode, message: string) => {
    const issue: PreflightIssue = { code, message, severity }
    if (severity === 'fatal')
      errors.push(issue)
    else
      warnings.push(issue)
  }

  if (episodes.length === 0) {
    pushIssue(
      'fatal',
      'ERR_NO_EPISODE_HEADERS',
      'No episode headers found. Please format input with EP/EPISODE/EP <N>.',
    )
  }

  if (declaredTotalEpisodes != null && declaredTotalEpisodes < 1) {
    pushIssue('fatal', 'ERR_INVALID_TOTAL_EPISODES', 'TOTAL_EPISODES must be at least 1.')
  }

  if (languageMode === 'mixed') {
    pushIssue('fatal', 'ERR_MIXED_LANGUAGE', 'Input must be single-language only (pure Chinese or pure English).')
  }

  const seen = new Set<number>()
  const duplicates: number[] = []
  for (const episode of episodes) {
    if (seen.has(episode.number))
      duplicates.push(episode.number)
    seen.add(episode.number)
  }

  if (duplicates.length > 0) {
    pushIssue(
      'fatal',
      'ERR_DUPLICATE_EPISODE',
      `Duplicate episode numbers found: ${Array.from(new Set(duplicates)).sort((a, b) => a - b).join(', ')}.`,
    )
  }

  const disorder: Array<[number, number]> = []
  for (let i = 1; i < episodes.length; i++) {
    const prev = episodes[i - 1]?.number
    const current = episodes[i]?.number
    if (prev == null || current == null)
      continue
    if (current < prev)
      disorder.push([prev, current])
  }
  if (disorder.length > 0) {
    const preview = disorder.slice(0, 5).map(([from, to]) => `${from}->${to}`).join(', ')
    pushIssue(
      'fatal',
      'ERR_OUT_OF_ORDER_EPISODE',
      `Episode headers are out of order: ${preview}${disorder.length > 5 ? '…' : ''}.`,
    )
  }

  if (declaredTotalEpisodes != null) {
    const missing = missingEpisodes(episodes.map(e => e.number), declaredTotalEpisodes)
    if (missing.length > 0) {
      const preview = missing.slice(0, 10)
      pushIssue(
        'warn',
        'ERR_MISSING_EPISODE',
        `Missing episode numbers: ${preview.join(', ')}${missing.length > preview.length ? '…' : ''}.`,
      )
    }
  }

  let totalPaywalls = 0
  const paywallEpisodes: number[] = []
  for (const episode of episodes) {
    if (episode.paywallCount > 1) {
      pushIssue('fatal', 'ERR_MULTI_PAYWALL_IN_EPISODE', `Multiple [PAYWALL] markers found in EP ${episode.number}.`)
    }
    if (episode.paywallCount > 0)
      paywallEpisodes.push(episode.number)
    totalPaywalls += episode.paywallCount
  }

  if (totalPaywalls > 2) {
    pushIssue('fatal', 'ERR_TOO_MANY_PAYWALLS', 'At most 2 [PAYWALL] markers are allowed in MVP.')
  }

  if (totalEpisodesForScoring > 0) {
    const maxEpisode = totalEpisodesForScoring
    const outOfRange = paywallEpisodes.filter(ep => ep < 2 || ep > maxEpisode - 1)
    if (outOfRange.length > 0) {
      pushIssue('warn', 'ERR_PAYWALL_OUT_OF_RANGE', '[PAYWALL] must appear between EP 2 and the second-to-last EP.')
    }
  }

  const ingest: ParseIngest = {
    declaredTotalEpisodes,
    inferredTotalEpisodes,
    totalEpisodesForScoring,
    observedEpisodeCount,
    completionState,
    coverageRatio,
    mode: errors.length === 0 && warnings.length === 0 ? 'official' : 'provisional',
  }

  return { meta, ingest, episodes, errors, warnings }
}
