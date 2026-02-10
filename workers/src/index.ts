import type { Context } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { GEMINI_RESPONSE_SCHEMA } from './cors-test/structured-schema'
import { evaluateAiScore } from './score/score-ai-evaluator'

interface CloudflareBindings {
  ZENAI_LLM_API_KEY?: string
  ZENAI_LLM_API_BASE_URL?: string
  ZENAI_LLM_MODEL?: string
}

interface UploadFileLike {
  arrayBuffer: () => Promise<ArrayBuffer>
  type?: string
  name?: string
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

const SCORE_STREAM_ROUTE = '/api/score/stream'
const LEGACY_CORS_TEST_ROUTE = '/api/cors-test/stream'
const GEMINI_DEFAULT_BASE_ENDPOINT = 'https://llm-api.dev.zenai.cc'
const GEMINI_FIXED_MODEL = 'gemini-3-pro'
const GEMINI_STREAM_QUERY = 'alt=sse'
const GEMINI_THINKING_LEVEL = 'low'
const STRUCTURED_RESPONSE_MIME_TYPE = 'application/json'
const STREAM_ENCODING = 'utf-8'

const SCORING_SYSTEM_PROMPT = `You are a senior drama-script analyst and strict JSON generator.

Return exactly one JSON object with top-level keys: score, presentation.
Do not output meta, markdown, code fences, explanations, or any extra text.

Hard constraints:
- English only.
- grade: S+, S, A+, A, B, C
- health: GOOD, FAIR, PEAK
- state: optimal, issue, neutral
- issueCategory: structure, pacing, mixed
- emotionLevel: Low, Medium, High
- conflictDensity: LOW, MEDIUM, HIGH
- anchors.slot: Start, Mid, End
- conflict.phases order: Start, Inc., Rise, Climax, Fall, Res.

Coverage rules:
- If episodes are detectable, output full coverage for 1..N in:
  emotion.series, episodeRows, diagnosis.matrix.
- If not detectable, synthesize 1..6 full coverage.

Diagnosis rules:
- diagnosis.details must include only issue/neutral episodes.
- No detail item for optimal episodes.

Scoring consistency:
- total_110 = pay + story + market + potential
- pay [0,50], story [0,30], market [0,20], potential [0,10]
- overall_100 = round(total_110 / 110 * 100)
- grade mapping by total_110:
  S+ >= 101, S >= 91, A+ >= 86, A >= 81, B >= 70, C < 70

Chart constraints:
- emotion.anchors exactly 3: Start, Mid, End
- conflict.phases exactly 6 in fixed order
- emotion value and signalPercent in 0..100
- pacingScore in 0..10

If primary hook is unclear, use "None".
Keep producer-facing text concise and practical.`

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
}

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

app.options(SCORE_STREAM_ROUTE, (c) => {
  return c.body(null, 204)
})

app.options(LEGACY_CORS_TEST_ROUTE, (c) => {
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

app.post(SCORE_STREAM_ROUTE, async c => createScoreStreamResponse(c))
app.post(LEGACY_CORS_TEST_ROUTE, async c => createScoreStreamResponse(c))

function hasApiKey(env: CloudflareBindings) {
  return getApiKey(env) != null
}

function getApiKey(env: CloudflareBindings) {
  const key = env.ZENAI_LLM_API_KEY?.trim()
  if (typeof key !== 'string' || key.length === 0)
    return undefined
  return key
}

function isUploadFileLike(value: unknown): value is UploadFileLike {
  return typeof value === 'object'
    && value != null
    && 'arrayBuffer' in value
    && typeof (value as UploadFileLike).arrayBuffer === 'function'
}

function resolveUploadMimeType(file: UploadFileLike) {
  const declaredType = file.type?.trim().toLowerCase() ?? ''
  if (declaredType.length > 0)
    return declaredType

  const lowerName = file.name?.toLowerCase() ?? ''
  for (const [suffix, mimeType] of Object.entries(EXTENSION_MIME_MAP)) {
    if (lowerName.endsWith(suffix))
      return mimeType
  }

  return 'application/octet-stream'
}

function isAllowedScoreUploadMimeType(mimeType: string) {
  return mimeType === 'application/pdf'
    || mimeType === 'text/plain'
    || mimeType === 'text/markdown'
}

function isTextualMimeType(mimeType: string) {
  return mimeType === 'text/plain' || mimeType === 'text/markdown'
}

function encodeBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function normalizeEndpointBase(endpoint: string | undefined) {
  const trimmed = (endpoint ?? '').trim().replace(/\/+$/, '')
  if (trimmed.length === 0)
    return GEMINI_DEFAULT_BASE_ENDPOINT
  if (trimmed.endsWith('/v1'))
    return trimmed.slice(0, -3)
  return trimmed
}

function buildStreamGenerateContentUrl(endpoint: string, model: string) {
  return `${endpoint}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?${GEMINI_STREAM_QUERY}`
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error)
    return error.message
  return String(error)
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

async function createScoreStreamResponse(c: Context<{ Bindings: CloudflareBindings }>) {
  const apiKey = getApiKey(c.env)
  if (apiKey == null) {
    return c.json(
      { error: { code: 'ERR_SERVER_CONFIG', message: 'ZENAI_LLM_API_KEY is not configured.' } },
      500,
    )
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  }
  catch {
    return c.json(
      { error: { code: 'ERR_BAD_REQUEST', message: 'Request body must be multipart/form-data.' } },
      400,
    )
  }

  if (formData.has('prompt')) {
    return c.json(
      { error: { code: 'ERR_BAD_REQUEST', message: 'prompt is not allowed. Prompt is fixed on server.' } },
      400,
    )
  }

  const textValue = formData.get('text')
  const requestText = typeof textValue === 'string' ? textValue.trim() : ''

  const fileValue = formData.get('file')
  const file = isUploadFileLike(fileValue) ? fileValue : null

  if (file == null && requestText.length === 0) {
    return c.json(
      { error: { code: 'ERR_BAD_REQUEST', message: 'Either text or file is required.' } },
      400,
    )
  }

  const userParts: Array<Record<string, unknown>> = [{ text: SCORING_SYSTEM_PROMPT }]

  if (file != null) {
    const mimeType = resolveUploadMimeType(file)
    if (!isAllowedScoreUploadMimeType(mimeType)) {
      return c.json(
        {
          error: {
            code: 'ERR_BAD_REQUEST',
            message: `Unsupported file MIME type: ${mimeType}. Supported: application/pdf, text/plain, text/markdown.`,
          },
        },
        400,
      )
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    }
    catch {
      return c.json(
        { error: { code: 'ERR_BAD_REQUEST', message: 'Failed to read uploaded file data.' } },
        400,
      )
    }

    if (isTextualMimeType(mimeType)) {
      const text = new TextDecoder(STREAM_ENCODING).decode(bytes).trim()
      if (text.length === 0) {
        return c.json(
          { error: { code: 'ERR_BAD_REQUEST', message: 'Uploaded text file is empty.' } },
          400,
        )
      }
      userParts.push({ text })
    }
    else {
      userParts.push({
        inlineData: {
          mimeType,
          data: encodeBase64(bytes),
        },
      })
    }
  }
  else {
    userParts.push({ text: requestText })
  }

  const endpointBase = normalizeEndpointBase(c.env.ZENAI_LLM_API_BASE_URL)
  const upstreamUrl = buildStreamGenerateContentUrl(endpointBase, GEMINI_FIXED_MODEL)
  const upstreamBody = {
    contents: [
      {
        role: 'user',
        parts: userParts,
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: STRUCTURED_RESPONSE_MIME_TYPE,
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      thinkingConfig: {
        thinkingLevel: GEMINI_THINKING_LEVEL,
      },
    },
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(upstreamBody),
    })

    if (!upstream.ok) {
      const upstreamText = await upstream.text()
      return c.json(
        {
          error: {
            code: 'ERR_UPSTREAM',
            message: `HTTP ${upstream.status} ${upstream.statusText}. ${upstreamText}`,
          },
        },
        502,
      )
    }

    const upstreamStream = upstream.body
    if (upstreamStream == null) {
      return c.json(
        { error: { code: 'ERR_UPSTREAM_PROTOCOL', message: 'Upstream stream body is missing.' } },
        502,
      )
    }

    return new Response(upstreamStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  }
  catch (error) {
    return c.json(
      { error: { code: 'ERR_SCORE_STREAM', message: toErrorMessage(error) } },
      500,
    )
  }
}
