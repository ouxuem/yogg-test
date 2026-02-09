'use client'

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, Output } from 'ai'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// 使用 Zod 定义结构化输出的 schema
const responseSchema = z.object({
  ok: z.boolean().describe('Whether the request was successful'),
  note: z.string().describe('A note or message about the response'),
})

type AuthMode = 'none' | 'dummy' | 'key'

interface TestResult {
  at: string
  mode: AuthMode
  durationMs: number
  response?: z.infer<typeof responseSchema>
  error?: string
}

function nowIso() {
  return new Date().toISOString()
}

function getApiKey(mode: AuthMode, apiKey: string): string {
  if (mode === 'none')
    return ''
  if (mode === 'dummy')
    return 'test'
  return apiKey.trim()
}

export default function CorsTestClient({ endpoint }: { endpoint: string }) {
  const [apiKey, setApiKey] = useState('')
  const [input, setInput] = useState('Hello! Please respond with JSON only.')
  const [result, setResult] = useState<TestResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  async function run(mode: AuthMode) {
    setIsRunning(true)
    const startedAt = performance.now()

    try {
      const key = getApiKey(mode, apiKey)

      const provider = createOpenAICompatible({
        name: 'zenai',
        baseURL: endpoint,
        apiKey: key || 'placeholder', // AI SDK requires a non-empty apiKey
        supportsStructuredOutputs: true, // 启用结构化输出支持
      })

      const userText = input.trim().slice(0, 500) || 'Hello'

      const { output } = await generateText({
        model: provider.chatModel('gemini-3-flash'),
        output: Output.object({ schema: responseSchema }),
        prompt: userText,
        temperature: 0.5,
        providerOptions: {
          zenai: {
            reasoningEffort: 'high',
          },
        },
      })

      const durationMs = Math.round(performance.now() - startedAt)

      setResult({
        at: nowIso(),
        mode,
        durationMs,
        response: output ?? undefined,
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
        <div className="text-muted-foreground break-all text-sm">{endpoint}</div>
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
