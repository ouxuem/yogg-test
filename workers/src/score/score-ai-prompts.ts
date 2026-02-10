import type { EpisodeBrief } from './input-types'
import type { EpisodePassItem } from './score-ai-schemas'

const ENGLISH_OUTPUT_POLICY = `
Hard output rules:
1) Return all fields in English only.
2) Do not output Chinese characters.
3) Keep text concise and concrete.
4) Follow the schema exactly. No extra fields.
`.trim()

interface GlobalPromptInput {
  episodePass: EpisodePassItem[]
  numericScoreParts: {
    pay: number
    story: number
    market: number
    potential: number
    overall100: number
    grade: string
  }
}

export function buildEpisodePassPrompt(episodeBriefs: EpisodeBrief[]) {
  const compact = episodeBriefs.map((brief) => {
    return {
      episode: brief.episode,
      opening: clip(brief.opening, 220),
      ending: clip(brief.ending, 220),
      keyEvents: brief.keyEvents.map(item => clip(item, 100)).slice(0, 6),
      emotionRaw: brief.emotionRaw,
      conflictExtRaw: brief.conflictExtRaw,
      conflictIntRaw: brief.conflictIntRaw,
      paywallFlag: brief.paywallFlag,
      tokenCount: brief.tokenCount,
      wordCount: brief.wordCount,
    }
  })

  return `
You are a drama script evaluation assistant.
Your task is to generate episode-level structured diagnostics for a result dashboard.

For each episode, decide:
- health: GOOD / FAIR / PEAK
- primaryHookType: short phrase (examples: Inciting Incident, World Building, Mid-Act Climax)
- aiHighlight: one practical sentence
- state: optimal / issue / neutral
- issueCategory: structure / pacing / mixed
- issueLabel / issueReason / suggestion
- emotionLevel: Low / Medium / High
- conflictDensity: LOW / MEDIUM / HIGH
- pacingScore: 0-10
- signalPercent: 0-100

Rules:
- If hook cannot be identified, output "None".
- Keep hook labels and highlights useful for producers.
- If state is optimal, still fill issue fields with a brief healthy-status wording.
- Ensure episode numbers remain unchanged.

${ENGLISH_OUTPUT_POLICY}

Episode briefs JSON:
${JSON.stringify(compact)}
`.trim()
}

export function buildGlobalPassPrompt(input: GlobalPromptInput) {
  const compactEpisodePass = input.episodePass.map(item => ({
    episode: item.episode,
    health: item.health,
    primaryHookType: item.primaryHookType,
    aiHighlight: clip(item.aiHighlight, 140),
    state: item.state,
    issueCategory: item.issueCategory,
    issueLabel: item.issueLabel,
    issueReason: clip(item.issueReason, 120),
    signalPercent: item.signalPercent,
  }))

  return `
You are producing global executive summaries for a script scoring dashboard.
Write concise, decision-ready copy.

Output requirements:
- commercialSummary: one compact paragraph.
- dimensionNarratives.monetization/story/market: one sentence each.
- chartCaptions.emotion/conflict: one sentence each.
- diagnosisOverview:
  - integritySummary: one sentence.
  - pacingFocusEpisode: choose one real episode number from the input.
  - pacingIssueLabel: short label.
  - pacingIssueReason: one concise sentence.

Avoid placeholders. Reference concrete narrative signals from input.

${ENGLISH_OUTPUT_POLICY}

Deterministic score parts:
${JSON.stringify(input.numericScoreParts)}

Episode pass JSON:
${JSON.stringify(compactEpisodePass)}
`.trim()
}

function clip(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max)
    return clean
  return `${clean.slice(0, max - 1)}…`
}
