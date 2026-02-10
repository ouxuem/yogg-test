import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { evaluateAiScore } from './score/score-ai-evaluator'

interface CloudflareBindings {
  ZENAI_LLM_API_KEY?: string
  ZENAI_LLM_API_BASE_URL?: string
  ZENAI_LLM_MODEL?: string
}

const requestSchema = z.object({
  episodeBriefs: z.array(z.object({
    episode: z.number().int().min(1),
    opening: z.string().trim().min(1).max(1200),
    ending: z.string().trim().min(1).max(1200),
    keyEvents: z.array(z.string().trim().min(1).max(220)).min(3).max(6),
    tokenCount: z.number().int().min(1),
    wordCount: z.number().int().min(1),
    emotionRaw: z.number().min(0),
    conflictExtRaw: z.number().min(0),
    conflictIntRaw: z.number().min(0),
    paywallFlag: z.boolean(),
  })).min(1).max(120),
  ingest: z.object({
    declaredTotalEpisodes: z.number().int().min(1).optional(),
    inferredTotalEpisodes: z.number().int().min(0),
    totalEpisodesForScoring: z.number().int().min(1),
    observedEpisodeCount: z.number().int().min(1),
    completionState: z.enum(['completed', 'incomplete', 'unknown']),
    coverageRatio: z.number().min(0).max(1),
    mode: z.enum(['official', 'provisional']),
  }),
  language: z.enum(['en', 'zh']),
  tokenizer: z.enum(['whitespace', 'intl-segmenter', 'char-fallback']),
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

  const episodeBriefs = normalizeEpisodeBriefs(parsed.data.episodeBriefs)

  try {
    const score = await evaluateAiScore({
      env: c.env,
      episodeBriefs,
      language: parsed.data.language,
      tokenizer: parsed.data.tokenizer,
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

function normalizeEpisodeBriefs(
  episodeBriefs: Array<{
    episode: number
    opening: string
    ending: string
    keyEvents: string[]
    tokenCount: number
    wordCount: number
    emotionRaw: number
    conflictExtRaw: number
    conflictIntRaw: number
    paywallFlag: boolean
  }>,
) {
  const sorted = [...episodeBriefs].sort((a, b) => a.episode - b.episode)
  const seen = new Set<number>()

  for (const item of sorted) {
    if (item.episode < 1)
      throw new Error('episodeBriefs episode must be >= 1.')
    if (seen.has(item.episode))
      throw new Error(`Duplicate episodeBriefs episode: ${item.episode}.`)
    seen.add(item.episode)
  }

  return sorted.map((item, index) => ({
    ...item,
    episode: index + 1,
  }))
}
