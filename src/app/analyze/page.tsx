'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import AnalysisLoading from '@/components/analysis/analysis-loading'
import Waves from '@/components/ui/waves'

const INPUT_STORAGE_KEY = 'sdicap:v2:input'

export default function AnalyzePage() {
  const router = useRouter()

  const input = useMemo(() => {
    if (typeof window === 'undefined')
      return ''
    return window.sessionStorage.getItem(INPUT_STORAGE_KEY) ?? ''
  }, [])

  useEffect(() => {
    if (!input.trim())
      router.replace('/')
  }, [input, router])

  if (!input.trim())
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
        <AnalysisLoading testId="analysis-loading" />
      </div>
    </main>
  )
}
