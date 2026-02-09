import process from 'node:process'
import CorsTestClient from '@/components/cors-test-client'

export default function CorsTestPage() {
  const endpointFromEnv = process.env.NEXT_PUBLIC_ZENAI_LLM_API_BASE_URL
  const endpoint
    = endpointFromEnv != null && endpointFromEnv.trim().length > 0
      ? endpointFromEnv.trim()
      : 'https://llm-api.dev.zenai.cc/v1'

  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">CORS Test</h1>
        <p className="text-muted-foreground text-sm">
          This page makes a browser-side request to your LLM API endpoint to
          validate whether CORS restrictions are in place.
        </p>
      </header>
      <CorsTestClient endpoint={endpoint} />
    </main>
  )
}
