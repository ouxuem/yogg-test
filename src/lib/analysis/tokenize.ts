import type { AnalysisTokenizer } from '@/lib/analysis/detect-language'

let zhSegmenter: Intl.Segmenter | null = null

function getZhSegmenter() {
  if (zhSegmenter)
    return zhSegmenter
  zhSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  return zhSegmenter
}

export function tokenize(text: string, tokenizer: AnalysisTokenizer): string[] {
  if (tokenizer === 'whitespace') {
    return text
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean)
  }

  if (tokenizer === 'intl-segmenter') {
    const segmenter = getZhSegmenter()
    const tokens: string[] = []
    for (const item of segmenter.segment(text)) {
      const token = item.segment.trim()
      if (token.length === 0)
        continue
      tokens.push(token)
    }
    return tokens
  }

  return Array.from(text).filter(ch => ch.trim().length > 0)
}

export function detokenize(tokens: string[], tokenizer: AnalysisTokenizer): string {
  if (tokenizer === 'whitespace')
    return tokens.join(' ')
  return tokens.join('')
}
