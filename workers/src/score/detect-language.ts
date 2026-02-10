export type AnalysisLanguage = 'en' | 'zh'
export type LanguageMode = AnalysisLanguage | 'mixed'

function stripStructureMarkers(rawInput: string) {
  return rawInput.replace(/\[PAYWALL\]/gi, ' ')
}

function countMatches(input: string, regex: RegExp) {
  const matches = input.match(regex)
  return matches ? matches.length : 0
}

function scriptStats(rawInput: string) {
  const sample = stripStructureMarkers(rawInput).slice(0, 8000)
  const cjk = countMatches(sample, /[\u4E00-\u9FFF]/g)
  const latin = countMatches(sample, /[a-z]/gi)
  return { cjk, latin }
}

export function detectLanguageMode(rawInput: string): LanguageMode {
  const { cjk, latin } = scriptStats(rawInput)
  if (cjk > 0 && latin > 0)
    return 'mixed'
  if (cjk > 0)
    return 'zh'
  return 'en'
}

export function detectLanguage(rawInput: string): AnalysisLanguage {
  const mode = detectLanguageMode(rawInput)
  return mode === 'zh' ? 'zh' : 'en'
}

export type AnalysisTokenizer = 'whitespace' | 'intl-segmenter' | 'char-fallback'

export function detectTokenizer(language: AnalysisLanguage): AnalysisTokenizer {
  if (language === 'en')
    return 'whitespace'
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined')
    return 'intl-segmenter'
  return 'char-fallback'
}
