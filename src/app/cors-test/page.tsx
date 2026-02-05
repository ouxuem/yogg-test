import CorsTestClient from '@/components/cors-test-client'

export default function CorsTestPage() {
  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">CORS Test</h1>
        <p className="text-muted-foreground text-sm">
          这个页面会在
          <strong>浏览器端</strong>
          直接向 LLM API 发起跨域请求，用来验证是否存在 CORS 限制。
        </p>
      </header>
      <CorsTestClient />
    </main>
  )
}
