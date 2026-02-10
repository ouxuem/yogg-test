import type { AnalysisTokenizer } from './detect-language'
import { detokenize, tokenize } from './tokenize'

export interface EpisodeWindows {
  episode: number
  tokensTotal: number
  head_500w: string
  tail_350w: string
  next_head_100t: string
  hook_context: string
  paywall_context?: string
  paywall_pre_context_1000t?: string
  paywall_post_context_400t?: string
  hasPaywall: boolean
}

export interface BuildWindowsInput {
  number: number
  text: string
  paywallCount: number
}

function indexOfPaywallToken(tokens: string[], tokenizer: AnalysisTokenizer) {
  if (tokenizer === 'whitespace') {
    const upper = tokens.map(t => t.toUpperCase())
    return upper.indexOf('[PAYWALL]')
  }

  const joined = detokenize(tokens, tokenizer)
  const idx = joined.toUpperCase().indexOf('[PAYWALL]')
  if (idx < 0)
    return -1

  if (tokenizer === 'char-fallback')
    return idx

  let cursor = 0
  for (let i = 0; i < tokens.length; i++) {
    cursor += tokens[i].length
    if (cursor > idx)
      return i
  }
  return -1
}

export function buildEpisodeWindows(
  episodes: BuildWindowsInput[],
  tokenizer: AnalysisTokenizer,
): EpisodeWindows[] {
  const tokenized = episodes.map(ep => ({
    number: ep.number,
    paywallCount: ep.paywallCount,
    tokens: tokenize(ep.text, tokenizer),
  }))

  const windows: EpisodeWindows[] = []

  for (let i = 0; i < tokenized.length; i++) {
    const episode = tokenized[i]
    const next = tokenized[i + 1]
    const head = detokenize(episode.tokens.slice(0, 500), tokenizer)
    const tail = detokenize(episode.tokens.slice(Math.max(0, episode.tokens.length - 350)), tokenizer)
    const nextHead = detokenize((next?.tokens ?? []).slice(0, 100), tokenizer)
    const hookContext = detokenize(
      [...episode.tokens.slice(Math.max(0, episode.tokens.length - 350)), ...(next?.tokens ?? []).slice(0, 100)],
      tokenizer,
    )

    const hasPaywall = episode.paywallCount > 0
    let paywallContext: string | undefined
    let paywallPre: string | undefined
    let paywallPost: string | undefined

    if (hasPaywall) {
      const paywallTokenIndex = indexOfPaywallToken(episode.tokens, tokenizer)
      if (paywallTokenIndex >= 0) {
        const contextStart = Math.max(0, paywallTokenIndex - 350)
        const contextEnd = Math.min(episode.tokens.length, paywallTokenIndex + 350)
        paywallContext = detokenize(episode.tokens.slice(contextStart, contextEnd), tokenizer)

        const preStart = Math.max(0, paywallTokenIndex - 1000)
        paywallPre = detokenize(episode.tokens.slice(preStart, paywallTokenIndex), tokenizer)

        const postEnd = Math.min(episode.tokens.length, paywallTokenIndex + 400)
        paywallPost = detokenize(episode.tokens.slice(paywallTokenIndex, postEnd), tokenizer)
      }
    }

    if (paywallContext == null) {
      const tailTokens = episode.tokens.slice(Math.max(0, episode.tokens.length - 350))
      paywallContext = detokenize(tailTokens, tokenizer)
      const preStart = Math.max(0, episode.tokens.length - 1000)
      paywallPre = detokenize(episode.tokens.slice(preStart, episode.tokens.length), tokenizer)
      paywallPost = ''
    }

    windows.push({
      episode: episode.number,
      tokensTotal: episode.tokens.length,
      head_500w: head,
      tail_350w: tail,
      next_head_100t: nextHead,
      hook_context: hookContext,
      paywall_context: paywallContext,
      paywall_pre_context_1000t: paywallPre,
      paywall_post_context_400t: paywallPost,
      hasPaywall,
    })
  }

  return windows
}
