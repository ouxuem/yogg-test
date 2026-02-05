import Link from 'next/link'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default async function PrismaticDemoPage() {
  await sleep(1800)

  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="border-border bg-card text-card-foreground w-full max-w-xl rounded-xl border p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Prismatic Demo Page</h1>
        <p className="text-muted-foreground mt-3">
          This page simulates a 1.8 second load to demonstrate transition
          loading states.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-medium"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  )
}
