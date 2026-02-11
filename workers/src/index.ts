import type { Context } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GEMINI_RESPONSE_SCHEMA } from './schema/structured-schema'

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

Episode counting protocol:
- N is episode count, not page count. Never infer N from PDF page number.
- Detect explicit episode markers first (EP, EPISODE, 第X集, E01, E1).
- If explicit markers exist, set N from marker sequence, not from document length/pages.
- Treat isolated high episode numbers as outliers when they conflict with the main sequence.
- Do not output any episode index above inferred chapter-based N.
- If explicit markers are weak/missing, infer N from recurring chapter boundaries and narrative segmentation, never from pages.
- Before final JSON, run a self-check: N must be chapter-based and episode-indexed arrays must align to 1..N.

Coverage rules:
- If episodes are detectable, output full coverage for 1..N in:
  emotion.series, episodeRows, diagnosis.matrix.
- If not detectable, synthesize 1..6 full coverage.
- For episode-indexed arrays, episode numbers must be continuous and unique:
  start at 1, end at N, no gaps, no duplicates.
- Let N = episodeRows.length, and enforce:
  emotion.series.length = N, diagnosis.matrix.length = N.
- In episodeRows/emotion.series/diagnosis.matrix:
  episode must be integer in [1, N], and arrays must be sorted by episode asc.

Diagnosis rules:
- diagnosis.details must include only issue/neutral episodes.
- No detail item for optimal episodes.
- diagnosis.details.episode and diagnosis.overview.pacingFocusEpisode must be in [1, N].

Scoring consistency:
- total_110 = pay + story + market + potential
- pay [0,50], story [0,30], market [0,20], potential [0,10]
- overall_100 = round(total_110 / 110 * 100)
- grade mapping by total_110:
  S+ >= 101, S >= 91, A+ >= 86, A >= 81, B >= 70, C < 70

Chart constraints:
- emotion.anchors exactly 3: Start, Mid, End
- emotion.anchors episode must be in [1, N]
- conflict.phases exactly 6 in fixed order
- conflict.phases ext/int in 0..100
- emotion value and signalPercent in 0..100
- pacingScore in 0..10

If primary hook is unclear, use "None".
Never output null, NaN, Infinity, or empty strings for required fields.
Keep producer-facing text concise and practical.`

const PDF_COUNTING_GUARD_PROMPT = `PDF handling rule:
- This is a paginated PDF. A page is a layout unit, not an episode.
- Multiple pages can belong to one episode; one page must not create one episode.
- Determine N by chapter/episode structure in content, never by page count.`

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

app.options(SCORE_STREAM_ROUTE, (c) => {
  return c.body(null, 204)
})

app.options(LEGACY_CORS_TEST_ROUTE, (c) => {
  return c.body(null, 204)
})

app.post(SCORE_STREAM_ROUTE, async c => createScoreStreamResponse(c))
app.post(LEGACY_CORS_TEST_ROUTE, async c => createScoreStreamResponse(c))

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

  const userParts: Array<Record<string, unknown>> = []

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
      if (mimeType === 'application/pdf')
        userParts.push({ text: PDF_COUNTING_GUARD_PROMPT })
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
    systemInstruction: {
      parts: [{ text: SCORING_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: userParts,
      },
    ],
    generationConfig: {
      temperature: 0.1,
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
