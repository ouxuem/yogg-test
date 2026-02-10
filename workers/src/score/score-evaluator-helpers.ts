import type { AnalysisLanguage, AnalysisTokenizer } from './detect-language'
import type { ParsedEpisode } from './input-types'
import type { GenreKey } from './score-keywords'
import type { AuditItem, AuditStatus } from './score-types'
import { pickKeywords, SCORING_KEYWORDS } from './score-keywords'

export interface HookEval {
  score: number
  type: 'decision' | 'crisis' | 'information' | 'emotion' | 'none'
  evidence: string[]
}

export type RepairIssueType = 'language' | 'hook' | 'structure' | 'core'

export function evaluatePrimaryHook(
  context: string,
  language: AnalysisLanguage,
): HookEval {
  const decision = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookDecision, language),
    language,
  )
  if (decision.length > 0)
    return { score: 5, type: 'decision', evidence: decision }
  const crisis = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookCrisis, language),
    language,
  )
  if (crisis.length > 0)
    return { score: 4, type: 'crisis', evidence: crisis }
  const info = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookInformation, language),
    language,
  )
  if (info.length > 0)
    return { score: 3, type: 'information', evidence: info }
  const emotion = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookEmotion, language),
    language,
  )
  if (emotion.length > 0)
    return { score: 2, type: 'emotion', evidence: emotion }
  return { score: 0, type: 'none', evidence: [] }
}

export function evaluateSecondaryHook(
  context: string,
  language: AnalysisLanguage,
): HookEval {
  const decision = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookDecision, language),
    language,
  )
  if (decision.length > 0)
    return { score: 3, type: 'decision', evidence: decision }
  const crisis = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookCrisis, language),
    language,
  )
  if (crisis.length > 0)
    return { score: 3, type: 'crisis', evidence: crisis }
  const info = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookInformation, language),
    language,
  )
  if (info.length > 0)
    return { score: 2, type: 'information', evidence: info }
  const emotion = collectMatchedTerms(
    context,
    pickKeywords(SCORING_KEYWORDS.paywall.hookEmotion, language),
    language,
  )
  if (emotion.length > 0)
    return { score: 1, type: 'emotion', evidence: emotion }
  return { score: 0, type: 'none', evidence: [] }
}

export function secondaryPaywallRange(totalEpisodes: number): [number, number] | null {
  if (totalEpisodes >= 30 && totalEpisodes <= 50)
    return [20, 25]
  if (totalEpisodes >= 51 && totalEpisodes <= 70)
    return [30, 40]
  if (totalEpisodes >= 71 && totalEpisodes <= 100)
    return [50, 60]
  return null
}

export function evaluateRoleTagScore(
  text: string,
  groups: Record<string, { en: string[], zh: string[] }>,
  language: AnalysisLanguage,
) {
  const matched = new Set<string>()
  let typeCount = 0
  for (const group of Object.values(groups)) {
    const hits = collectMatchedTerms(text, pickKeywords(group, language), language)
    if (hits.length > 0) {
      typeCount += 1
      for (const hit of hits)
        matched.add(hit)
    }
  }

  return {
    typeCount,
    uniqueTagCount: matched.size,
    sampleTags: Array.from(matched).slice(0, 10),
  }
}

export function detectMechanisms(text: string, language: AnalysisLanguage) {
  const detected: Array<{ name: string, hits: number }> = []
  const categories = [
    SCORING_KEYWORDS.market.mechanismIdentity,
    SCORING_KEYWORDS.market.mechanismRelationship,
    SCORING_KEYWORDS.market.mechanismConflict,
  ] as const

  for (const category of categories) {
    for (const [name, dict] of Object.entries(category)) {
      const hits = countTerms(text, pickKeywords(dict, language), language)
      if (hits >= 2)
        detected.push({ name, hits })
    }
  }

  return detected
}

export function detectGenre(text: string, language: AnalysisLanguage): GenreKey {
  const genreScores = Object.entries(SCORING_KEYWORDS.market.genreMarkers).map(([genre, terms]) => ({
    genre: genre as GenreKey,
    score: countTerms(text, pickKeywords(terms, language), language),
  }))

  genreScores.sort((a, b) => b.score - a.score)
  const top = genreScores[0] ?? { genre: 'ceoRomance' as GenreKey, score: 0 }
  if (top.score <= 0)
    return 'ceoRomance'
  return top.genre
}

export function detectAudienceProfile(text: string, language: AnalysisLanguage) {
  const scores = Object.entries(SCORING_KEYWORDS.market.genreMarkers).map(([genre, terms]) => ({
    genre,
    score: countTerms(text, pickKeywords(terms, language), language),
  }))
  const total = scores.reduce((sum, item) => sum + item.score, 0)
  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const top = sorted[0]?.score ?? 0
  const second = sorted[1]?.score ?? 0
  const coreShare = total > 0 ? (top / total) * 100 : 0
  const spanShare = total > 0 ? (second / total) * 100 : 0

  return {
    coreShare,
    spanShare,
    breakdown: sorted.map(item => `${item.genre}:${item.score}`),
  }
}

export function inferPrimaryIssueType(ids: string[]): RepairIssueType {
  const has = (prefix: string) => ids.some(id => id.startsWith(prefix))
  const hasAny = (targets: string[]) => ids.some(id => targets.includes(id))

  if (hasAny(['story.core_driver', 'story.character.male', 'story.character.female']))
    return 'core'

  if (hasAny([
    'pay.paywall.primary.position',
    'pay.paywall.primary.previous',
    'pay.paywall.primary.next',
    'pay.paywall.secondary.position',
    'pay.paywall.secondary.previous',
    'pay.paywall.secondary.next',
    'pay.density.drama',
    'pay.density.motivation',
    'pay.density.foreshadow',
    'pay.visual_hammer',
  ])) {
    return 'structure'
  }

  if (hasAny([
    'pay.paywall.primary.hook',
    'pay.paywall.secondary.hook',
    'pay.hooks.episodic',
  ])) {
    return 'hook'
  }

  if (has('market.'))
    return 'language'
  return 'language'
}

export function repairCostReason(issueType: RepairIssueType) {
  if (issueType === 'language')
    return 'Primary issues are language/localization; estimated effort <3h.'
  if (issueType === 'hook')
    return 'Primary issues are hook optimization; estimated effort 3-10h.'
  if (issueType === 'structure')
    return 'Issues require structural revision; estimated effort 1-3d.'
  return 'Issues require core rewrite; estimated effort >10d.'
}

export function estimateTotalWords(episodes: ParsedEpisode[], tokenizer: AnalysisTokenizer) {
  const text = episodes.map(ep => ep.text).join('\n')
  if (tokenizer === 'whitespace')
    return text.split(/\s+/).filter(Boolean).length
  // 中文近似词数换算，和现有 L1 统计一致
  return Math.round(text.length / 1.4)
}

export function scoreOf(items: AuditItem[], id: string) {
  return items.find(item => item.id === id)?.score ?? 0
}

export function sumByPrefix(items: AuditItem[], prefix: string) {
  return items
    .filter(item => item.id.startsWith(prefix))
    .reduce((sum, item) => sum + item.score, 0)
}

/**
 * 统一创建 AuditItem，集中做：
 * 1) 分数边界保护
 * 2) 状态默认策略
 * 3) 小数精度控制（避免浮点噪音污染结果）
 */
export function makeAuditItem(
  id: string,
  score: number,
  max: number,
  reason: string,
  evidence: string[],
  statusOverride?: AuditStatus,
  confidenceFlag?: 'low_sample' | 'normal',
): AuditItem {
  const safeScore = roundTo(clamp(score, 0, max), 4)
  const status = statusOverride ?? inferStatus(safeScore, max)
  return {
    id,
    status,
    score: safeScore,
    max,
    reason,
    evidence: evidence.slice(0, 12).map((value, index) => sanitizeEvidence(value, index)),
    ...(confidenceFlag ? { confidenceFlag } : {}),
  }
}

function sanitizeEvidence(value: string, index: number) {
  const normalized = value.trim()
  if (normalized.length === 0)
    return normalized
  if (!/[\u3400-\u9FFF\uF900-\uFAFF]/.test(normalized))
    return normalized
  return `Non-English source evidence omitted (${index + 1}).`
}

export function evidenceFromCounts(countMap: Record<string, number>) {
  return Object.entries(countMap).map(([label, value]) => `${label}:${value}`)
}

export function booleanEvidence(valueMap: Record<string, boolean>) {
  return Object.entries(valueMap).map(([label, value]) => `${label}:${value ? 'yes' : 'no'}`)
}

export function collectMatchedTerms(text: string, terms: string[], language: AnalysisLanguage) {
  const hits: string[] = []
  for (const term of terms) {
    if (countTerm(text, term, language) > 0)
      hits.push(term)
  }
  return hits
}

export function countTerms(text: string, terms: string[], language: AnalysisLanguage) {
  return terms.reduce((sum, term) => sum + countTerm(text, term, language), 0)
}

/**
 * 关键词计数策略
 * - 英文：统一小写后按子串非重叠计数
 * - 中文：直接按原文子串计数
 */
export function countTerm(text: string, term: string, language: AnalysisLanguage) {
  if (term.length === 0)
    return 0

  // 关键词包含拉丁字母时，统一按英文词边界计数，避免大小写与误命中问题。
  if (language === 'en' || /[a-z]/i.test(term))
    return countEnglishTerm(text, term)

  const source = text
  const needle = term
  let count = 0
  let index = 0
  while (index <= source.length - needle.length) {
    const found = source.indexOf(needle, index)
    if (found < 0)
      break
    count += 1
    index = found + needle.length
  }
  return count
}

const ENGLISH_TERM_REGEX_CACHE = new Map<string, RegExp>()

function countEnglishTerm(text: string, term: string) {
  const source = text.toLowerCase()
  const regex = englishTermRegex(term)
  let count = 0
  let match = regex.exec(source)
  while (match != null) {
    count += 1
    if (regex.lastIndex === match.index)
      regex.lastIndex += 1
    match = regex.exec(source)
  }
  return count
}

function englishTermRegex(term: string) {
  const key = term.toLowerCase()
  const cached = ENGLISH_TERM_REGEX_CACHE.get(key)
  if (cached != null) {
    cached.lastIndex = 0
    return cached
  }

  const escaped = escapeRegex(key).replace(/\s+/g, '\\s+')
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'g')
  ENGLISH_TERM_REGEX_CACHE.set(key, regex)
  return regex
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function inferStatus(score: number, max: number): AuditStatus {
  if (score >= max * 0.6)
    return 'ok'
  if (score <= 0)
    return 'warn'
  return 'warn'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function roundTo(value: number, digits: number) {
  const base = 10 ** digits
  return Math.round(value * base) / base
}
