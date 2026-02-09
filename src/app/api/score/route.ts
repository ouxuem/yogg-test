import process from 'node:process'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { evaluateAiScore } from '@/lib/analysis/score-ai-evaluator'
import { buildEpisodeWindows } from '@/lib/analysis/window-builder'

export const runtime = 'nodejs'

const requestSchema = z.object({
  episodes: z.array(z.object({
    number: z.number().int().min(1),
    text: z.string(),
    paywallCount: z.number().int().min(0),
  })).min(1),
  ingest: z.object({
    declaredTotalEpisodes: z.number().int().min(1).optional(),
    inferredTotalEpisodes: z.number().int().min(0),
    totalEpisodesForScoring: z.number().int().min(1),
    observedEpisodeCount: z.number().int().min(1),
    completionState: z.enum(['completed', 'incomplete', 'unknown']),
    coverageRatio: z.number().min(0).max(1),
    mode: z.enum(['official', 'provisional']),
  }).optional(),
  language: z.enum(['en', 'zh']),
  tokenizer: z.enum(['whitespace', 'intl-segmenter', 'char-fallback']),
  totalWordsFromL1: z.number().min(1),
})

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return NextResponse.json(
      { error: { code: 'ERR_SERVER_CONFIG', message: 'ZENAI_LLM_API_KEY is not configured.' } },
      { status: 500 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json(
      { error: { code: 'ERR_BAD_REQUEST', message: 'Request body must be valid JSON.' } },
      { status: 400 },
    )
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      { error: { code: 'ERR_BAD_REQUEST', message: issue?.message ?? 'Invalid request payload.' } },
      { status: 400 },
    )
  }

  try {
    const windows = buildEpisodeWindows(
      parsed.data.episodes.map(episode => ({
        number: episode.number,
        text: episode.text,
        paywallCount: episode.paywallCount,
      })),
      parsed.data.tokenizer,
    )

    const score = await evaluateAiScore({
      episodes: parsed.data.episodes,
      windows,
      language: parsed.data.language,
      tokenizer: parsed.data.tokenizer,
      totalWordsFromL1: parsed.data.totalWordsFromL1,
      ingest: parsed.data.ingest,
    })

    return NextResponse.json({ score }, { status: 200 })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: { code: 'ERR_AI_EVAL', message } },
      { status: 500 },
    )
  }
}

function hasApiKey() {
  const key = process.env.ZENAI_LLM_API_KEY?.trim()
  return typeof key === 'string' && key.length > 0
}
