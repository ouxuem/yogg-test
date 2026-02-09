'use client'

import { useSearchParams } from 'next/navigation'
import { useMemo, useSyncExternalStore } from 'react'
import { readLastRid, subscribeRunStore } from '@/lib/analysis/run-store'
import { normalizeRid } from '@/lib/analysis/run-view'

export function useResolvedRid(options?: { fallbackToLast?: boolean }) {
  const fallbackToLast = options?.fallbackToLast ?? true
  const searchParams = useSearchParams()
  const lastRid = useSyncExternalStore(subscribeRunStore, readLastRid, () => null)

  return useMemo(() => {
    const fromQuery = normalizeRid(searchParams.get('rid'))
    if (fromQuery != null)
      return fromQuery
    if (!fallbackToLast)
      return null
    return normalizeRid(lastRid)
  }, [fallbackToLast, lastRid, searchParams])
}
