'use client'

import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import AnalysisLoading from '@/components/analysis/analysis-loading'
import Waves from '@/components/ui/waves'
import { asStoredRun, deleteRunInput, readRunInput, subscribeRunStore, writeRun } from '@/lib/analysis/run-store'
import { useResolvedRid } from '@/lib/analysis/use-resolved-rid'
import { isRecord } from '@/lib/type-guards'

const PREFLIGHT_ERRORS_KEY = 'sdicap:preflight_errors'

export default function AnalyzePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [progressOverride, setProgressOverride] = useState<AnalysisProgress | undefined>(undefined)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const rid = useResolvedRid({ fallbackToLast: false })
  const hasRid = rid != null && rid.length > 0
  const queryRid = searchParams.get('rid')

  const input = useSyncExternalStore(
    subscribeRunStore,
    () => (hasRid ? readRunInput(rid) ?? '' : ''),
    () => '',
  )

  useEffect(() => {
    if (!isFinalizing && (rid == null || rid.length === 0 || input.trim().length === 0))
      router.replace('/')
  }, [input, isFinalizing, rid, router])

  useEffect(() => {
    if (rid == null || rid.length === 0 || input.trim().length === 0)
      return
    const ridValue = rid

    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })

    const onMessage = (event: MessageEvent<unknown>) => {
      const data: unknown = event.data
      if (!isRecord(data) || typeof data.type !== 'string')
        return

      if (data.type === 'progress') {
        if (!isRecord(data.progress))
          return
        const phase = typeof data.progress.phase === 'string' ? data.progress.phase : 'validate_index'
        const percentRaw = typeof data.progress.percent === 'number' ? data.progress.percent : 0
        const activity = typeof data.progress.activity === 'string' ? data.progress.activity : ''
        const batch = isRecord(data.progress.batch)
          ? {
              current: typeof data.progress.batch.current === 'number' ? data.progress.batch.current : 0,
              total: typeof data.progress.batch.total === 'number' ? data.progress.batch.total : 0,
            }
          : undefined
        setProgressOverride({
          phase: phase as AnalysisProgress['phase'],
          percent: percentRaw,
          activity,
          batch,
        })
      }

      if (data.type === 'preflight_error') {
        setIsFinalizing(true)
        const errors = Array.isArray(data.errors) ? data.errors : []
        window.sessionStorage.setItem(PREFLIGHT_ERRORS_KEY, JSON.stringify(errors))
        deleteRunInput(ridValue)
        router.replace('/')
      }

      if (data.type === 'done') {
        const run = asStoredRun(data.result)
        if (!run)
          return
        setIsFinalizing(true)
        writeRun(ridValue, run)
        deleteRunInput(ridValue)
        router.replace(`/result?rid=${encodeURIComponent(ridValue)}`)
      }
    }

    worker.addEventListener('message', onMessage)

    worker.postMessage({ type: 'start', input, apiOrigin: window.location.origin })

    return () => {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
    }
  }, [input, rid, router])

  if (queryRid == null || rid == null || rid.length === 0 || input.trim().length === 0)
    return null

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-8">
      <Waves
        lineColor="var(--muted-foreground)"
        lineOpacity={0.2}
        cursorInfluence={0.72}
        cursorRadius={220}
        cursorStrength={1.05}
        maxCursorMove={40}
      />
      <div className="relative z-10 w-full max-w-5xl">
        <AnalysisLoading testId="analysis-loading" progress={progressOverride} />
      </div>
    </main>
  )
}
