import process from 'node:process'
import CorsTestClient from '@/components/cors-test-client'
import Reveal from '@/components/motion/reveal'

const DEFAULT_CORS_TEST_WORKER_BASE_URL = 'https://worker.1143434456qq.workers.dev'

export default function CorsTestPage() {
  const endpointFromEnv = process.env.NEXT_PUBLIC_CORS_TEST_WORKER_BASE_URL
  const endpoint
    = endpointFromEnv != null && endpointFromEnv.trim().length > 0
      ? endpointFromEnv.trim()
      : DEFAULT_CORS_TEST_WORKER_BASE_URL

  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 flex-col gap-6 p-6">
      <Reveal variant="fadeInUp" delay={0}>
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Gemini Media Recognition CORS Test</h1>
          <p className="text-muted-foreground text-sm">
            The browser sends
            <code>POST /api/cors-test/stream</code>
            through the Worker proxy. The Worker uses
            <code>ZENAI_LLM_API_KEY</code>
            with the fixed model
            <code>gemini-3-pro</code>
            to forward requests to the Gemini SSE endpoint.
          </p>
        </header>
      </Reveal>
      <Reveal variant="fadeInUp" delay={0.05}>
        <CorsTestClient endpoint={endpoint} />
      </Reveal>
    </main>
  )
}
