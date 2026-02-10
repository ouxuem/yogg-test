import type { AuditItem } from '@/lib/analysis/score-types'

type EpisodeHealthLevel = 'good' | 'fair' | 'peak'

interface EpisodeSignal {
  episode: number
  signal: number
  signalPercent: number
  health: EpisodeHealthLevel
  emotionLevel: 'Low' | 'Medium' | 'High'
  conflictDensity: 'LOW' | 'MEDIUM' | 'HIGH'
  pacingScore: number
}

const AUDIT_LABELS: Record<string, string> = {
  'pay.opening.male_lead': 'Male lead opening',
  'pay.opening.female_lead': 'Female lead opening',
  'pay.paywall.primary.position': 'Primary paywall position',
  'pay.paywall.primary.previous': 'Primary paywall setup',
  'pay.paywall.primary.hook': 'Primary paywall hook',
  'pay.paywall.primary.next': 'Primary paywall follow-up',
  'pay.paywall.secondary.position': 'Secondary paywall position',
  'pay.paywall.secondary.previous': 'Secondary paywall setup',
  'pay.paywall.secondary.hook': 'Secondary paywall hook',
  'pay.paywall.secondary.next': 'Secondary paywall follow-up',
  'pay.hooks.episodic': 'Episodic hooks',
  'pay.density.drama': 'Drama density',
  'pay.density.motivation': 'Motivation clarity',
  'pay.density.foreshadow': 'Foreshadow density',
  'pay.visual_hammer': 'Visual hammer',
  'story.core_driver': 'Core driver',
  'story.character.male': 'Male character depth',
  'story.character.female': 'Female character depth',
  'story.emotion_density': 'Emotion density',
  'story.conflict': 'Conflict density',
  'story.twist': 'Twist density',
  'market.benchmark': 'Benchmark mechanisms',
  'market.taboo': 'Cultural taboo',
  'market.localization': 'Localization density',
  'market.audience.genre': 'Genre-audience fit',
  'market.audience.purity': 'Audience purity',
  'potential.repair_cost': 'Repair cost',
  'potential.expected_gain': 'Expected gain',
  'potential.story_core': 'Story core',
  'potential.scarcity': 'Market scarcity',
}

const PACING_IDS = new Set<string>([
  'pay.hooks.episodic',
  'pay.density.drama',
  'pay.density.motivation',
  'pay.density.foreshadow',
  'pay.visual_hammer',
  'story.conflict',
  'story.twist',
])

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function roundTo(value: number, digits: number) {
  const base = 10 ** digits
  return Math.round(value * base) / base
}

function quantileThreshold(values: number[], q: number) {
  if (values.length === 0)
    return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)))
  return sorted[idx] ?? 0
}

function normalizeSeries(values: number[]) {
  const max = Math.max(0, ...values)
  if (max === 0)
    return values.map(() => 0)
  return values.map(v => Math.round((v / max) * 100))
}

function conflictDensityLabel(conflictHits: number): EpisodeSignal['conflictDensity'] {
  if (conflictHits >= 4)
    return 'HIGH'
  if (conflictHits >= 2)
    return 'MEDIUM'
  return 'LOW'
}

function emotionLevel(signalPercent: number): EpisodeSignal['emotionLevel'] {
  if (signalPercent >= 70)
    return 'High'
  if (signalPercent >= 35)
    return 'Medium'
  return 'Low'
}

export function buildEpisodeSignals(
  episodes: Array<{ episode: number, emotionHits: number, conflictHits: number }>,
): EpisodeSignal[] {
  const signals = episodes.map(ep => ep.emotionHits + ep.conflictHits)
  const normalized = normalizeSeries(signals)
  const lowCut = quantileThreshold(signals, 0.25)
  const highCut = quantileThreshold(signals, 0.75)
  const min = signals.length > 0 ? Math.min(...signals) : 0
  const max = signals.length > 0 ? Math.max(...signals) : 0
  const allSame = signals.length < 2 || min === max

  return episodes.map((ep, index) => {
    const signal = signals[index] ?? 0
    const signalPercent = normalized[index] ?? 0
    const health: EpisodeHealthLevel = allSame
      ? 'fair'
      : signal <= lowCut
        ? 'good'
        : signal >= highCut
          ? 'peak'
          : 'fair'
    return {
      episode: ep.episode,
      signal,
      signalPercent,
      health,
      emotionLevel: emotionLevel(signalPercent),
      conflictDensity: conflictDensityLabel(ep.conflictHits),
      pacingScore: roundTo(clamp(signalPercent / 10, 0, 10), 1),
    }
  })
}

function parseEpisodeNumbers(raw: string) {
  const text = raw.trim()
  if (text.length === 0)
    return []
  const matched = new Set<number>()
  const patterns = [
    /\bEp(?:isode)?\s*(\d{1,3})\b/gi,
    /第\s*(\d{1,3})\s*集/g,
  ]

  for (const pattern of patterns) {
    let match = pattern.exec(text)
    while (match != null) {
      const value = Number.parseInt(match[1] ?? '', 10)
      if (Number.isFinite(value) && value > 0)
        matched.add(value)
      match = pattern.exec(text)
    }
  }

  return Array.from(matched).sort((a, b) => a - b)
}

export function extractEpisodeNumbersFromAuditItem(item: AuditItem) {
  const matched = new Set<number>()
  for (const value of [item.reason, ...item.evidence]) {
    for (const episode of parseEpisodeNumbers(value))
      matched.add(episode)
  }
  return Array.from(matched).sort((a, b) => a - b)
}

function inferHookType(item: AuditItem) {
  const reason = item.reason.toLowerCase()
  if (reason.includes('decision') || reason.includes('决策'))
    return 'Decision Hook'
  if (reason.includes('crisis') || reason.includes('危机'))
    return 'Crisis Hook'
  if (reason.includes('information') || reason.includes('信息'))
    return 'Information Hook'
  if (reason.includes('emotion') || reason.includes('情感'))
    return 'Emotion Hook'

  if (item.id === 'pay.paywall.primary.hook') {
    if (item.score >= 5)
      return 'Decision Hook'
    if (item.score >= 4)
      return 'Crisis Hook'
    if (item.score >= 3)
      return 'Information Hook'
    if (item.score >= 2)
      return 'Emotion Hook'
    return 'No Hook'
  }

  if (item.id === 'pay.paywall.secondary.hook') {
    if (item.score >= 3)
      return 'Escalated Hook'
    if (item.score >= 2)
      return 'Information Hook'
    if (item.score >= 1)
      return 'Weak Hook'
    return 'No Hook'
  }

  return 'No Hook'
}

function hookStrength(item: AuditItem) {
  if (item.max <= 0)
    return 'None'
  const ratio = item.score / item.max
  if (ratio >= 0.8)
    return 'Strong'
  if (ratio >= 0.5)
    return 'Medium'
  if (ratio > 0)
    return 'Weak'
  return 'None'
}

export function buildHookTypeByEpisode(items: AuditItem[]) {
  const byEpisode = new Map<number, string>()
  const primaryPos = items.find(item => item.id === 'pay.paywall.primary.position')
  const secondaryPos = items.find(item => item.id === 'pay.paywall.secondary.position')
  const primaryHook = items.find(item => item.id === 'pay.paywall.primary.hook')
  const secondaryHook = items.find(item => item.id === 'pay.paywall.secondary.hook')

  const primaryEpisode = primaryPos ? extractEpisodeNumbersFromAuditItem(primaryPos)[0] : null
  const secondaryEpisode = secondaryPos ? extractEpisodeNumbersFromAuditItem(secondaryPos)[0] : null

  if (primaryEpisode != null && primaryHook != null) {
    byEpisode.set(primaryEpisode, `${inferHookType(primaryHook)} (${hookStrength(primaryHook)})`)
  }
  if (secondaryEpisode != null && secondaryHook != null) {
    byEpisode.set(secondaryEpisode, `${inferHookType(secondaryHook)} (${hookStrength(secondaryHook)})`)
  }

  const episodic = items.find(item => item.id === 'pay.hooks.episodic')
  if (episodic != null) {
    for (const evidence of episodic.evidence) {
      const match = /Ep(\d{1,3})\s*:\s*(\d+(?:\.\d+)?)/i.exec(evidence)
      if (match == null)
        continue
      const episode = Number.parseInt(match[1] ?? '', 10)
      const score = Number.parseFloat(match[2] ?? '')
      if (!Number.isFinite(episode) || !Number.isFinite(score))
        continue
      if (byEpisode.has(episode))
        continue
      const strength = score >= 1.75 ? 'Strong' : score >= 1 ? 'Medium' : score > 0 ? 'Weak' : 'None'
      byEpisode.set(episode, `Episodic Hook (${strength})`)
    }
  }

  return byEpisode
}

export function buildIssueReasonByEpisode(items: AuditItem[]) {
  const byEpisode = new Map<number, string>()
  const issues = items
    .filter(item => item.status !== 'ok')
    .sort((a, b) => (b.max - b.score) - (a.max - a.score))

  for (const issue of issues) {
    const episodes = extractEpisodeNumbersFromAuditItem(issue)
    if (episodes.length === 0)
      continue
    for (const episode of episodes) {
      if (byEpisode.has(episode))
        continue
      byEpisode.set(episode, compactReason(issue.reason))
    }
  }
  return byEpisode
}

function scoreGap(item: AuditItem) {
  return item.max - item.score
}

function scoreRatio(item: AuditItem) {
  if (item.max <= 0)
    return 0
  return item.score / item.max
}

export function buildDimensionInsight(
  items: AuditItem[],
  prefix: 'pay.' | 'story.' | 'market.',
  emptyFallback = 'No AI evidence available for this dimension.',
) {
  const scoped = items
    .filter(item => item.id.startsWith(prefix))
  if (scoped.length === 0)
    return emptyFallback

  const weakest = [...scoped].sort((a, b) => scoreGap(b) - scoreGap(a))[0]
  if (weakest != null && scoreGap(weakest) > 0.01) {
    const label = labelForAuditItem(weakest.id)
    return `${label}: ${compactReason(weakest.reason)}`
  }

  const strongest = [...scoped].sort((a, b) => scoreRatio(b) - scoreRatio(a))[0]
  if (strongest == null)
    return emptyFallback
  const label = labelForAuditItem(strongest.id)
  return `${label}: ${compactReason(strongest.reason)}`
}

export function buildCommercialAdaptabilitySummary(items: AuditItem[], overall100: number, grade: string) {
  const scoped = items.filter(item => item.id.startsWith('pay.') || item.id.startsWith('story.') || item.id.startsWith('market.'))
  if (scoped.length === 0)
    return `AI summary unavailable for this run. Overall ${overall100}/100 (${grade}).`

  const weakest = [...scoped].sort((a, b) => scoreGap(b) - scoreGap(a))[0]
  if (weakest == null)
    return `Overall ${overall100}/100 (${grade}).`

  const label = labelForAuditItem(weakest.id)
  return `Overall ${overall100}/100 (${grade}). Focus next on ${label.toLowerCase()}: ${compactReason(weakest.reason, 100)}`
}

export function classifyIssueCategory(id: string): 'structure' | 'pacing' {
  return PACING_IDS.has(id) ? 'pacing' : 'structure'
}

export function labelForAuditItem(id: string) {
  return AUDIT_LABELS[id] ?? id
}

export function compactReason(reason: string, maxLength = 120) {
  const text = reason.replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength)
    return text
  return `${text.slice(0, maxLength - 1)}…`
}
