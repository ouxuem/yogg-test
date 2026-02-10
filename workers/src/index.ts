import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { evaluateAiScore } from './score/score-ai-evaluator'
import { buildEpisodeWindows } from './score/window-builder'

interface CloudflareBindings {
  ZENAI_LLM_API_KEY?: string
  ZENAI_LLM_API_BASE_URL?: string
  ZENAI_LLM_MODEL?: string
}

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

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
}))

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.options('/api/score', (c) => {
  return c.body(null, 204)
})

app.post('/api/score', async (c) => {
  if (!hasApiKey(c.env)) {
    return c.json(
      { error: { code: 'ERR_SERVER_CONFIG', message: 'ZENAI_LLM_API_KEY is not configured.' } },
      500,
    )
  }

  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json(
      { error: { code: 'ERR_BAD_REQUEST', message: 'Request body must be valid JSON.' } },
      400,
    )
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return c.json(
      { error: { code: 'ERR_BAD_REQUEST', message: issue?.message ?? 'Invalid request payload.' } },
      400,
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
      env: c.env,
      episodes: parsed.data.episodes,
      windows,
      language: parsed.data.language,
      tokenizer: parsed.data.tokenizer,
      totalWordsFromL1: parsed.data.totalWordsFromL1,
      ingest: parsed.data.ingest,
    })

    return c.json({ score }, 200)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json(
      { error: { code: 'ERR_AI_EVAL', message } },
      500,
    )
  }
})

function hasApiKey(env: CloudflareBindings) {
  const key = env.ZENAI_LLM_API_KEY?.trim()
  return typeof key === 'string' && key.length > 0
}

export default app
