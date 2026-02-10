'use client'

import type { EpisodeState } from './diagnosis-styles'
import type { AnalysisScoreResult } from '@/lib/analysis/score-types'
import { RiArrowLeftSLine, RiCalendarLine } from '@remixicon/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { parseStoredRun, readRunRaw, subscribeRunStore, touchRun } from '@/lib/analysis/run-store'
import { resolveRunTitle } from '@/lib/analysis/run-view'
import { useResolvedRid } from '@/lib/analysis/use-resolved-rid'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import { clamp } from '@/lib/number'
import { EpisodeMatrixCard, IntegrityCard, PacingIssueCard, PrimaryIssueCard } from './diagnosis-sections'

type DiagnosisDetail = AnalysisScoreResult['presentation']['diagnosis']['details'][number]

export default function DiagnosisPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hydrated = useHydrated()
  const rid = useResolvedRid()
  const hasRid = rid != null && rid.length > 0

  const raw = useSyncExternalStore(
    subscribeRunStore,
    () => (hasRid ? readRunRaw(rid) : null),
    () => null,
  )
  const run = useMemo(() => parseStoredRun(raw), [raw])

  useEffect(() => {
    if (!hasRid || !run)
      return
    touchRun(rid)
  }, [hasRid, rid, run])

  useEffect(() => {
    if (!hydrated)
      return
    if (!hasRid || rid == null) {
      router.replace('/')
      return
    }
    if (run)
      return
    const rawNow = readRunRaw(rid)
    if (rawNow == null)
      router.replace('/')
  }, [hasRid, hydrated, rid, router, run])

  const title = resolveRunTitle(run?.meta.title)
  const presentation = run?.score.presentation
  const diagnosis = presentation?.diagnosis

  const totalEpisodes = useMemo(() => {
    if (run?.meta.totalEpisodes != null)
      return run.meta.totalEpisodes
    return diagnosis?.matrix.length ?? 0
  }, [diagnosis?.matrix.length, run?.meta.totalEpisodes])

  const [selectedEpisode, setSelectedEpisode] = useState(() => {
    const fromQuery = Number(searchParams.get('ep'))
    if (Number.isFinite(fromQuery) && fromQuery >= 1)
      return fromQuery
    return 1
  })

  const collapsedSlots = 24
  const canExpand = totalEpisodes > collapsedSlots
  const [isExpanded, setIsExpanded] = useState(() => {
    const fromQuery = Number(searchParams.get('ep'))
    return Number.isFinite(fromQuery) && fromQuery > collapsedSlots
  })

  const selectedEpisodeClamped = clamp(selectedEpisode, 1, Math.max(1, totalEpisodes))
  const slotCount = isExpanded ? totalEpisodes : collapsedSlots

  const stateByEpisode = useMemo(() => {
    const map = new Map<number, EpisodeState>()
    for (const item of diagnosis?.matrix ?? [])
      map.set(item.episode, item.state)
    return map
  }, [diagnosis?.matrix])

  const detailByEpisode = useMemo(() => {
    const map = new Map<number, DiagnosisDetail>()
    for (const detail of diagnosis?.details ?? [])
      map.set(detail.episode, detail)
    return map
  }, [diagnosis?.details])

  const hookByEpisode = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of presentation?.episodeRows ?? [])
      map.set(row.episode, row.primaryHookType)
    return map
  }, [presentation?.episodeRows])

  const matrix = useMemo(() => {
    const items: Array<{ slot: number, episode: number | null, state: EpisodeState }> = []
    for (let i = 1; i <= slotCount; i++) {
      if (!isExpanded && i > totalEpisodes) {
        items.push({ slot: i, episode: null, state: 'empty' })
        continue
      }

      items.push({
        slot: i,
        episode: i,
        state: stateByEpisode.get(i) ?? 'neutral',
      })
    }

    return items
  }, [isExpanded, slotCount, stateByEpisode, totalEpisodes])

  const selectedState = stateByEpisode.get(selectedEpisodeClamped) ?? 'neutral'
  const selectedDetail = detailByEpisode.get(selectedEpisodeClamped) ?? null

  const [filterView, setFilterView] = useState<'all' | 'structure' | 'pacing'>('all')

  const selectedSuggestion = selectedDetail?.suggestion ?? 'No issue detail for this episode. Narrative status is healthy.'

  const conflictDensity = selectedDetail?.conflictDensity ?? 'LOW'
  const emotionLevel = selectedDetail?.emotionLevel ?? 'Low'
  const pacingScore = selectedDetail?.pacingScore ?? 0
  const signalPercent = selectedDetail?.signalPercent ?? 0
  const hookType = hookByEpisode.get(selectedEpisodeClamped) ?? 'None'

  const overview = diagnosis?.overview
  const pacingEpisode = clamp(overview?.pacingFocusEpisode ?? selectedEpisodeClamped, 1, Math.max(1, totalEpisodes))
  const pacingIssueLabel = overview?.pacingIssueLabel ?? 'Pacing check'
  const pacingIssueReason = overview?.pacingIssueReason ?? 'No pacing issue was flagged in this run.'
  const integritySummary = overview?.integritySummary ?? 'No diagnosis overview available.'

  const showPacingCard = filterView === 'all' || filterView === 'pacing'

  if (!hydrated) {
    return (
      <main className="bg-background min-h-svh" data-testid="diagnosis-page">
        <div className="mx-auto flex min-h-svh w-full max-w-6xl items-center justify-center px-6 py-14">
          <Card className="bg-muted/20 shadow-xs w-full max-w-[520px] ring-border/60">
            <div className="p-6">
              <div className="flex items-center gap-2">
                <Spinner className="text-muted-foreground size-4" />
                <p className="text-foreground text-[16px] leading-6 font-semibold">
                  Loading diagnosis…
                </p>
              </div>
              <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                Reading this analysis run from browser storage.
              </p>
            </div>
          </Card>
        </div>
      </main>
    )
  }

  if (!hasRid)
    return null

  if (!run || presentation == null || diagnosis == null)
    return null

  return (
    <main className="bg-background min-h-svh" data-testid="diagnosis-page">
      <div className="border-border/60 bg-background/90 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-foreground text-base font-semibold tracking-tight">ScriptAI</span>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => router.push('/')}>
              New Upload
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
        <div className="border-border/60 border-b pb-6">
          <p className="text-muted-foreground text-[14px] leading-5 font-semibold tracking-[0.7px] uppercase">
            Diagnosis report
          </p>

          <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <h1 className="text-foreground text-[48px] leading-[48px] font-semibold tracking-[-1.2px]">
                Episode Structural Diagnosis
              </h1>

              <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-[18px] leading-[28px]">
                <RiCalendarLine className="size-5 text-primary" aria-hidden="true" />
                <span>
                  Project:
                  {' '}
                  <span className="text-foreground font-medium">{title}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-start gap-3 lg:justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!hasRid || rid == null)
                    return
                  router.push(`/result?rid=${encodeURIComponent(rid)}`)
                }}
                disabled={!hasRid}
                className="h-[38px] gap-2 px-4 border-border/60 bg-background shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] disabled:opacity-60"
              >
                <RiArrowLeftSLine className="size-5" />
                Back to result
              </Button>
            </div>
          </div>
        </div>

        <EpisodeMatrixCard
          canExpand={canExpand}
          isExpanded={isExpanded}
          matrix={matrix}
          selectedEpisode={selectedEpisodeClamped}
          setIsExpanded={setIsExpanded}
          setSelectedEpisode={setSelectedEpisode}
          totalEpisodes={totalEpisodes}
        />

        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-foreground text-[18px] leading-[28px] font-semibold">
            Analysis Details
          </h2>

          <div className="flex items-center gap-3">
            <p className="text-muted-foreground text-[12px] leading-4">
              Filter view:
            </p>
            <Select
              value={filterView}
              onValueChange={(value) => {
                if (value === 'all' || value === 'structure' || value === 'pacing')
                  setFilterView(value)
              }}
            >
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="All Issues" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Issues</SelectItem>
                <SelectItem value="structure">Structural</SelectItem>
                <SelectItem value="pacing">Pacing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(filterView === 'all' || selectedDetail == null || selectedDetail.issueCategory === filterView) && (
          <PrimaryIssueCard
            conflictDensity={conflictDensity}
            emotionLevel={emotionLevel}
            hookType={hookType}
            pacingScore={pacingScore}
            selectedEpisode={selectedEpisodeClamped}
            selectedSignalPercent={signalPercent}
            selectedState={selectedState}
            suggestion={selectedSuggestion}
          />
        )}

        {showPacingCard && (
          <PacingIssueCard
            hasIssue={diagnosis.details.some(detail => detail.issueCategory === 'pacing' || detail.issueCategory === 'mixed')}
            issueLabel={pacingIssueLabel}
            issueReason={pacingIssueReason}
            pacingEpisode={pacingEpisode}
          />
        )}

        <IntegrityCard summary={integritySummary} />
      </div>
    </main>
  )
}
