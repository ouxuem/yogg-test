'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import GlobalLoading from '@/components/ui/global-loading'

export default function AnalyzePage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return (
    <main className="min-h-svh">
      <GlobalLoading message="Redirecting to home..." testId="analyze-redirect-loading" />
    </main>
  )
}
