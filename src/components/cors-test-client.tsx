'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const ENDPOINT = 'https://llm-api.dev.zenai.cc/v1/chat/completions'

const SYSTEM_PROMPT = [
  'You are a strict JSON-only assistant.',
  'Return a single JSON object with keys: ok (boolean), note (string).',
].join('\n')

type AuthMode = 'none' | 'dummy' | 'key'

interface TestResult {
  at: string
  mode: AuthMode
  durationMs: number
  status?: number
  statusText?: string
  contentType?: string | null
  bodyPreview?: string
  error?: string
}

function nowIso() {
  return new Date().toISOString()
}

function truncate(text: string, max = 1200) {
  if (text.length <= max)
    return text
  return `${text.slice(0, max)}…`
}

function buildHeaders(mode: AuthMode, apiKey: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (mode === 'dummy')
    headers.Authorization = 'Bearer test'

  if (mode === 'key') {
    const trimmed = apiKey.trim()
    if (trimmed)
      headers.Authorization = `Bearer ${trimmed}`
  }

  return headers
}

export default function CorsTestClient() {
  const [apiKey, setApiKey] = useState('')
  const [input, setInput] = useState('Hello! Please respond with JSON only.')
  const [result, setResult] = useState<TestResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const payload = useMemo(() => {
    const userText = input.trim().slice(0, 500)
    return {
      model: 'gemini-3-flash',
      temperature: 0.5,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText || 'Hello' },
      ],
    }
  }, [input])

  async function run(mode: AuthMode) {
    setIsRunning(true)
    const startedAt = performance.now()

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: buildHeaders(mode, apiKey),
        body: JSON.stringify(payload),
      })

      const durationMs = Math.round(performance.now() - startedAt)
      const contentType = response.headers.get('content-type')
      const bodyText = await response.text().catch(() => '')

      setResult({
        at: nowIso(),
        mode,
        durationMs,
        status: response.status,
        statusText: response.statusText,
        contentType,
        bodyPreview: truncate(bodyText),
      })
    }
    catch (error) {
      const durationMs = Math.round(performance.now() - startedAt)
      const message = error instanceof Error ? error.message : String(error)

      setResult({
        at: nowIso(),
        mode,
        durationMs,
        error: message,
      })
    }
    finally {
      setIsRunning(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-medium">Endpoint</div>
        <div className="text-muted-foreground break-all text-sm">{ENDPOINT}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-medium">API Key（可选）</div>
          <Input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="仅用于浏览器直连测试；不要在公开环境暴露密钥"
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">
            说明：浏览器端无法安全读取
            <code>process.env.ZENAI_LLM_API_KEY</code>
            。如果要在浏览器直连，只能用 BYOK（手动输入密钥）。
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">User Input（最多 500 字符）</div>
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            className="min-h-24"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isRunning}
          onClick={() => {
            void run('none')
          }}
        >
          Test (No Auth)
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isRunning}
          onClick={() => {
            void run('dummy')
          }}
        >
          Test (Dummy Auth)
        </Button>
        <Button
          type="button"
          disabled={isRunning}
          onClick={() => {
            void run('key')
          }}
        >
          Test (With Key)
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Result</div>
        <pre className="bg-muted/40 overflow-auto rounded-md border p-3 text-xs leading-relaxed">
          {result
            ? JSON.stringify(result, null, 2)
            : '点击上面的按钮后，这里会显示结果。\n\n如果出现 TypeError: Failed to fetch，大概率是 CORS 或网络问题；请打开 DevTools → Network 查看是否有 OPTIONS 预检请求被拦截。'}
        </pre>
      </div>
    </section>
  )
}
