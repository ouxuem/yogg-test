import type { AnalysisLanguage, AnalysisTokenizer } from '@/lib/analysis/detect-language'
import type { L1KeywordConfig } from '@/lib/analysis/l1-keywords'
import { L1_KEYWORDS_EN, L1_KEYWORDS_ZH } from '@/lib/analysis/l1-keywords'
import { tokenize } from '@/lib/analysis/tokenize'

interface EpisodeL1Stats {
  episode: number
  tokenCount: number
  wordCount: number
  emotionHits: number
  conflictHits: number
  conflictExtHits: number
  conflictIntHits: number
  vulgarHits: number
  tabooHits: number
}

interface L1StatsResult {
  episodes: EpisodeL1Stats[]
  totals: Omit<EpisodeL1Stats, 'episode'>
}

function keywordConfigFor(language: AnalysisLanguage): L1KeywordConfig {
  return language === 'zh' ? L1_KEYWORDS_ZH : L1_KEYWORDS_EN
}

function isAsciiAlphaNumeric(char: string | undefined) {
  if (char == null)
    return false
  return /[a-z0-9]/i.test(char)
}

function countEnglishKeywordHits(text: string, keyword: string) {
  const source = text.toLowerCase()
  const needle = keyword.toLowerCase().trim()
  if (needle.length === 0)
    return 0

  let count = 0
  let index = 0
  while (index <= source.length - needle.length) {
    const found = source.indexOf(needle, index)
    if (found < 0)
      break

    const prev = found > 0 ? source[found - 1] : undefined
    const next = source[found + needle.length]
    const prevBoundary = !isAsciiAlphaNumeric(prev)
    const nextBoundary = !isAsciiAlphaNumeric(next)
    if (prevBoundary && nextBoundary)
      count += 1

    index = found + needle.length
  }
  return count
}

function countGenericKeywordHits(text: string, keyword: string) {
  const needle = keyword.trim()
  if (needle.length === 0)
    return 0

  let count = 0
  let index = 0
  while (index <= text.length - needle.length) {
    const found = text.indexOf(needle, index)
    if (found < 0)
      break
    count += 1
    index = found + needle.length
  }
  return count
}

function countKeywordHits(text: string, tokenizer: AnalysisTokenizer, keywords: string[]) {
  if (keywords.length === 0)
    return 0

  if (tokenizer === 'whitespace') {
    return keywords.reduce((acc, keyword) => acc + countEnglishKeywordHits(text, keyword), 0)
  }

  return keywords.reduce((acc, keyword) => acc + countGenericKeywordHits(text, keyword), 0)
}

function computeEpisodeL1Stats(
  episode: { number: number, text: string },
  language: AnalysisLanguage,
  tokenizer: AnalysisTokenizer,
): EpisodeL1Stats {
  const config = keywordConfigFor(language)

  const tokens = tokenize(episode.text, tokenizer)
  const tokenCount = tokens.length
  const wordCount = tokenizer === 'whitespace' ? tokenCount : Math.round(tokenCount / 1.4)

  const emotionHits = countKeywordHits(episode.text, tokenizer, config.emotion)
  const conflictExtHits = countKeywordHits(episode.text, tokenizer, config.conflictExt)
  const conflictIntHits = countKeywordHits(episode.text, tokenizer, config.conflictInt)
  const conflictHits = conflictExtHits + conflictIntHits
  const vulgarHits = countKeywordHits(episode.text, tokenizer, config.vulgar)
  const tabooHits = countKeywordHits(episode.text, tokenizer, config.taboo)

  return {
    episode: episode.number,
    tokenCount,
    wordCount,
    emotionHits,
    conflictHits,
    conflictExtHits,
    conflictIntHits,
    vulgarHits,
    tabooHits,
  }
}

export function computeL1Stats(
  episodes: Array<{ number: number, text: string }>,
  language: AnalysisLanguage,
  tokenizer: AnalysisTokenizer,
  options?: {
    onEpisodeComputed?: (payload: {
      index: number
      total: number
      episode: EpisodeL1Stats
      totals: Omit<EpisodeL1Stats, 'episode'>
    }) => void
  },
): L1StatsResult {
  const stats: EpisodeL1Stats[] = []
  let tokenCountTotal = 0
  let wordCountTotal = 0
  let emotionTotal = 0
  let conflictTotal = 0
  let conflictExtTotal = 0
  let conflictIntTotal = 0
  let vulgarTotal = 0
  let tabooTotal = 0

  for (const episode of episodes) {
    const episodeStats = computeEpisodeL1Stats(episode, language, tokenizer)
    tokenCountTotal += episodeStats.tokenCount
    wordCountTotal += episodeStats.wordCount
    emotionTotal += episodeStats.emotionHits
    conflictTotal += episodeStats.conflictHits
    conflictExtTotal += episodeStats.conflictExtHits
    conflictIntTotal += episodeStats.conflictIntHits
    vulgarTotal += episodeStats.vulgarHits
    tabooTotal += episodeStats.tabooHits
    stats.push(episodeStats)
    options?.onEpisodeComputed?.({
      index: stats.length - 1,
      total: episodes.length,
      episode: episodeStats,
      totals: {
        tokenCount: tokenCountTotal,
        wordCount: wordCountTotal,
        emotionHits: emotionTotal,
        conflictHits: conflictTotal,
        conflictExtHits: conflictExtTotal,
        conflictIntHits: conflictIntTotal,
        vulgarHits: vulgarTotal,
        tabooHits: tabooTotal,
      },
    })
  }

  return {
    episodes: stats,
    totals: {
      tokenCount: tokenCountTotal,
      wordCount: wordCountTotal,
      emotionHits: emotionTotal,
      conflictHits: conflictTotal,
      conflictExtHits: conflictExtTotal,
      conflictIntHits: conflictIntTotal,
      vulgarHits: vulgarTotal,
      tabooHits: tabooTotal,
    },
  }
}
