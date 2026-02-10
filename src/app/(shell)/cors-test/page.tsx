import process from 'node:process'
import CorsTestClient from '@/components/cors-test-client'

const DEFAULT_CORS_TEST_WORKER_BASE_URL = 'https://worker.1143434456qq.workers.dev'

export default function CorsTestPage() {
  const endpointFromEnv = process.env.NEXT_PUBLIC_CORS_TEST_WORKER_BASE_URL
  const endpoint
    = endpointFromEnv != null && endpointFromEnv.trim().length > 0
      ? endpointFromEnv.trim()
      : DEFAULT_CORS_TEST_WORKER_BASE_URL

  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Gemini 媒体识别 CORS Test</h1>
        <p className="text-muted-foreground text-sm">
          Browser 通过 Worker 代理调用
          <code>POST /api/cors-test/stream</code>
          ，由 Worker 使用
          <code>ZENAI_LLM_API_KEY</code>
          与固定模型
          <code>gemini-3-pro</code>
          转发到 Gemini SSE 接口。
        </p>
      </header>
      <CorsTestClient endpoint={endpoint} />
    </main>
  )
}
