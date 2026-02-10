'use client'

import type { ResultChartDatum } from './result-charts'
import type { HealthLevel } from './result-sections'
import type { PreviewScore } from '@/lib/analysis/analysis-result'
import type { StoredRun } from '@/lib/analysis/run-store'
import { RiArrowRightSLine, RiBookOpenLine, RiCoinsLine, RiDownloadLine, RiNodeTree, RiShareLine } from '@remixicon/react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { exportResultPdf } from '@/lib/analysis/export-result-pdf'
import { parseStoredRun, readRunRaw, subscribeRunStore, touchRun } from '@/lib/analysis/run-store'
import { resolveRunTitle } from '@/lib/analysis/run-view'
import {
  buildDimensionInsight,
  buildEpisodeSignals,
  buildHookTypeByEpisode,
  buildIssueReasonByEpisode,
} from '@/lib/analysis/score-ui'
import { useResolvedRid } from '@/lib/analysis/use-resolved-rid'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import { clamp } from '@/lib/number'
import { GradeRing, HealthBadge, MetricRow } from './result-sections'

const ResultCharts = dynamic(async () => import('./result-charts'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 gap-6 pt-6 lg:grid-cols-2" aria-hidden="true">
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-xs font-semibold tracking-[0.7px] uppercase">
              Emotional intensity
            </p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.25px]">
              Episode breakdown
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] w-full rounded-md bg-muted/20" />
          <div className="mt-3 h-[20px] w-3/4 rounded bg-muted/15" />
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-xs font-semibold tracking-[0.7px] uppercase">
              Conflict frequency
            </p>
            <div className="flex items-center gap-4">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span className="size-2 rounded-full bg-muted" aria-hidden="true" />
                <span>Ext</span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span className="size-2 rounded-full bg-muted" aria-hidden="true" />
                <span>Int</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] w-full rounded-md bg-muted/20" />
          <div className="mt-3 h-[20px] w-3/4 rounded bg-muted/15" />
        </CardContent>
      </Card>
    </div>
  ),
})

const EMPTY_EPISODES: StoredRun['l1']['episodes'] = []
const EMPTY_PREVIEW_SCORE: PreviewScore = {
  overall100: 0,
  grade: 'C',
  monetization: 0,
  story: 0,
  market: 0,
}

function normalizeSeries(values: number[]) {
  const max = Math.max(0, ...values)
  if (max === 0)
    return values.map(() => 0)
  const denominator = Math.log1p(max)
  return values.map((value) => {
    const safe = Math.max(0, value)
    return Math.round((Math.log1p(safe) / denominator) * 100)
  })
}

export default function ResultPage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const rid = useResolvedRid()
  const hasRid = rid != null && rid.length > 0
  const exportRootRef = useRef<HTMLDivElement | null>(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const raw = useSyncExternalStore(
    subscribeRunStore,
    () => (hasRid ? readRunRaw(rid) : null),
    () => null,
  )
  const result = useMemo(() => parseStoredRun(raw), [raw])

  useEffect(() => {
    if (!hydrated)
      return
    if (!hasRid || rid == null) {
      router.replace('/')
      return
    }
    if (result)
      return
    const rawNow = readRunRaw(rid)
    if (rawNow == null)
      router.replace('/')
  }, [hasRid, hydrated, rid, result, router])

  useEffect(() => {
    if (!hasRid || !result)
      return
    touchRun(rid)
  }, [hasRid, rid, result])

  const episodes = result?.l1.episodes ?? EMPTY_EPISODES
  const totalEpisodes = result?.meta.totalEpisodes ?? episodes.length

  const previewScore: PreviewScore = result?.previewScore ?? EMPTY_PREVIEW_SCORE
  const overall100 = clamp(previewScore.overall100, 0, 100)
  const grade = previewScore.grade

  const monetization = clamp(previewScore.monetization, 0, 100)
  const story = clamp(previewScore.story, 0, 100)
  const market = clamp(previewScore.market, 0, 100)

  const title = resolveRunTitle(result?.meta.title)
  const auditItems = useMemo(() => result?.score?.audit.items ?? [], [result])

  const emotionRaw = useMemo(() => episodes.map(ep => ep.emotionHits), [episodes])
  const conflictExtRaw = useMemo(() => episodes.map(ep => ep.conflictExtHits), [episodes])
  const conflictIntRaw = useMemo(() => episodes.map(ep => ep.conflictIntHits), [episodes])
  const conflictRaw = useMemo(() => {
    return episodes.map((ep, idx) => {
      const ext = conflictExtRaw[idx] ?? 0
      const int = conflictIntRaw[idx] ?? 0
      const decomposed = ext + int
      return decomposed > 0 ? decomposed : ep.conflictHits
    })
  }, [conflictExtRaw, conflictIntRaw, episodes])

  const emotion = useMemo(() => normalizeSeries(emotionRaw), [emotionRaw])
  const conflict = useMemo(() => normalizeSeries(conflictRaw), [conflictRaw])

  const chartData = useMemo(() => {
    return episodes.map((ep, idx) => ({
      ep: `Ep ${String(ep.episode).padStart(2, '0')}`,
      emotion: emotion[idx] ?? 0,
      conflict: conflict[idx] ?? 0,
      conflictExt: (() => {
        const extRaw = conflictExtRaw[idx] ?? 0
        const intRaw = conflictIntRaw[idx] ?? 0
        const totalRaw = extRaw + intRaw
        if (totalRaw <= 0)
          return 0
        const normalizedTotal = conflict[idx] ?? 0
        return Math.round(normalizedTotal * (extRaw / totalRaw))
      })(),
      conflictInt: (() => {
        const extRaw = conflictExtRaw[idx] ?? 0
        const intRaw = conflictIntRaw[idx] ?? 0
        const totalRaw = extRaw + intRaw
        if (totalRaw <= 0)
          return 0
        const normalizedTotal = conflict[idx] ?? 0
        const normalizedExt = Math.round(normalizedTotal * (extRaw / totalRaw))
        return Math.max(0, normalizedTotal - normalizedExt)
      })(),
      rawEmotion: emotionRaw[idx] ?? 0,
      rawConflict: conflictRaw[idx] ?? 0,
      rawConflictExt: conflictExtRaw[idx] ?? 0,
      rawConflictInt: conflictIntRaw[idx] ?? 0,
    })) satisfies ResultChartDatum[]
  }, [conflict, conflictExtRaw, conflictIntRaw, conflictRaw, emotion, emotionRaw, episodes])

  const payDescription = useMemo(() => {
    return buildDimensionInsight(
      auditItems,
      'pay.',
      'Paywall and retention signals are stable across the current script sample.',
    )
  }, [auditItems])

  const storyDescription = useMemo(() => {
    return buildDimensionInsight(
      auditItems,
      'story.',
      'Story structure remains cohesive with no critical narrative warning in current scoring.',
    )
  }, [auditItems])

  const marketDescription = useMemo(() => {
    return buildDimensionInsight(
      auditItems,
      'market.',
      'Market fit remains acceptable under current ruleset checks.',
    )
  }, [auditItems])

  const episodeSignals = useMemo(() => buildEpisodeSignals(episodes), [episodes])
  const signalByEpisode = useMemo(() => {
    return new Map(episodeSignals.map(item => [item.episode, item]))
  }, [episodeSignals])
  const hookByEpisode = useMemo(() => buildHookTypeByEpisode(auditItems), [auditItems])
  const issueByEpisode = useMemo(() => buildIssueReasonByEpisode(auditItems), [auditItems])

  useEffect(() => {
    if (!hydrated)
      return

    let idleId: number | null = null
    let timeoutId: number | null = null

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(() => {
        void import('./result-charts')
      })
    }
    else {
      timeoutId = window.setTimeout(() => {
        void import('./result-charts')
      }, 250)
    }

    return () => {
      if (timeoutId != null)
        window.clearTimeout(timeoutId)
      if (idleId != null)
        window.cancelIdleCallback?.(idleId)
    }
  }, [hydrated])

  const breakdownRows = useMemo(() => {
    return episodes.map(ep => ({
      episode: String(ep.episode).padStart(2, '0'),
      health: signalByEpisode.get(ep.episode)?.health ?? ('fair' as HealthLevel),
      hook: hookByEpisode.get(ep.episode) ?? 'No Hook',
      highlight:
        issueByEpisode.get(ep.episode)
        ?? `Emotion hits ${ep.emotionHits}, conflict hits ${ep.conflictHits}.`,
    }))
  }, [episodes, hookByEpisode, issueByEpisode, signalByEpisode])

  const onNewUpload = () => {
    window.sessionStorage.removeItem('sdicap:preflight_errors')
    router.push('/')
  }

  const handleExportPdf = async () => {
    if (isExportingPdf)
      return

    const root = exportRootRef.current
    if (root == null) {
      setPdfError('PDF export failed. Please refresh and try again.')
      return
    }

    setIsExportingPdf(true)
    setPdfError(null)

    try {
      await exportResultPdf({
        root,
        title,
        rid: rid ?? undefined,
      })
    }
    catch (error) {
      console.error('[result/export-pdf] failed', error)
      setPdfError('PDF export failed. Please retry in the latest Chrome.')
    }
    finally {
      setIsExportingPdf(false)
    }
  }

  if (!hydrated) {
    return (
      <main className="bg-background min-h-svh" data-testid="result-page">
        <div className="mx-auto flex min-h-svh w-full max-w-6xl items-center justify-center px-6 py-14">
          <Card className="bg-muted/20 shadow-xs w-full max-w-[520px] ring-border/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Spinner className="text-muted-foreground size-4" />
                <p className="text-foreground text-[16px] leading-6 font-semibold">
                  Loading result…
                </p>
              </div>
              <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                Reading this analysis run from browser storage.
              </p>
            </CardHeader>
          </Card>
        </div>
      </main>
    )
  }

  if (!hasRid || !result)
    return null

  return (
    <main className="bg-background min-h-svh" data-testid="result-page">
      <div className="border-border/60 bg-background/90 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-foreground text-base font-semibold tracking-tight">ScriptAI</span>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={onNewUpload}>
              New Upload
            </Button>
          </div>
        </div>
      </div>

      <div ref={exportRootRef} className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
        <div className="flex flex-col gap-4">
          <div className="border-border/60 grid grid-cols-1 gap-4 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="bg-primary size-[7px] shrink-0 rounded-full opacity-70" aria-hidden="true" />
                <p className="text-muted-foreground text-sm font-semibold tracking-[0.7px] uppercase">
                  Project analysis
                </p>
              </div>
              <h1 className="text-foreground mt-3 text-[48px] leading-[48px] font-semibold tracking-[-1.2px]">
                {title}
              </h1>
              <p className="text-muted-foreground mt-3 text-[18px] leading-[28px]">
                Evaluation dashboard·Automated assessment
              </p>
            </div>

            <div className="lg:pt-14">
              <div
                className="bg-muted/20 border-border/40 ml-auto h-[66px] w-[136px] rounded-lg border px-4 pt-[9px] pb-[9px] text-right"
                data-testid="overall-score-card"
              >
                <p className="text-muted-foreground text-[12px] leading-4 font-semibold tracking-[0.6px] uppercase whitespace-nowrap">
                  Overall score
                </p>
                <div className="mt-[2px] flex items-baseline justify-end gap-1 tabular-nums">
                  <span className="text-primary text-[24px] leading-[32px] font-bold">
                    {overall100}
                  </span>
                  <span className="text-muted-foreground text-[14px] leading-[20px]">
                    /100
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { void handleExportPdf() }}
                  disabled={isExportingPdf}
                  className="h-[38px] gap-2 px-4 text-muted-foreground border-border/60 bg-background shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] disabled:opacity-100 hover:bg-background hover:text-muted-foreground disabled:hover:bg-background disabled:hover:text-muted-foreground"
                >
                  {isExportingPdf
                    ? (
                        <>
                          <Spinner className="size-4" />
                          Exporting PDF...
                        </>
                      )
                    : (
                        <>
                          <RiDownloadLine className="size-5" />
                          Export PDF
                        </>
                      )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="h-[38px] gap-2 px-4 text-muted-foreground border-border/60 bg-background shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] disabled:opacity-100 hover:bg-background hover:text-muted-foreground disabled:hover:bg-background disabled:hover:text-muted-foreground"
                >
                  <RiShareLine className="size-5" />
                  Share
                </Button>
              </div>
              {pdfError != null && (
                <p className="mt-2 text-right text-xs text-red-600">
                  {pdfError}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-[0.69fr_1fr]">
            <Card className="shadow-xs py-0">
              <CardContent className="flex h-full flex-col items-center pb-10 pt-10 text-center">
                <div className="relative grid place-items-center">
                  <GradeRing grade={grade} score100={overall100} />
                </div>
                <div className="mt-auto">
                  <div className="text-foreground text-lg font-semibold tracking-tight">Commercial Adaptability</div>
                  <p className="text-muted-foreground mx-auto mt-3 max-w-[28ch] text-xs leading-5">
                    A quick preview while deeper analysis continues to evolve.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs py-0">
              <CardContent className="flex h-full flex-col justify-center gap-10 pb-10 pt-10">
                <MetricRow
                  icon={RiCoinsLine}
                  accentClassName="text-[var(--chart-1)]"
                  indicatorClassName="bg-[var(--chart-1)]"
                  label="Monetization Power"
                  value={monetization}
                  description={payDescription}
                />
                <MetricRow
                  icon={RiBookOpenLine}
                  accentClassName="text-[var(--chart-4)]"
                  indicatorClassName="bg-[var(--chart-4)]"
                  label="Story Structure Quality"
                  value={story}
                  description={storyDescription}
                />
                <MetricRow
                  icon={RiNodeTree}
                  accentClassName="text-[var(--chart-5)]"
                  indicatorClassName="bg-[var(--chart-5)]"
                  label="Market Compatibility"
                  value={market}
                  description={marketDescription}
                />
              </CardContent>
            </Card>
          </div>

          <ResultCharts chartData={chartData} />

          <Card className="bg-muted/20 shadow-xs py-0 ring-border/60">
            <div className="bg-background/50 border-border/60 flex h-[58px] items-center justify-between border-b px-6">
              <p className="text-foreground text-[14px] font-semibold tracking-[0.35px] uppercase">
                Individual episode breakdown
              </p>

              <button
                type="button"
                className="bg-background border-border/60 flex h-[25px] w-[151px] items-center justify-between rounded-[4px] border px-[9px] text-[10px] text-muted-foreground shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:bg-muted/30"
                onClick={() => {
                  if (!hasRid || rid == null)
                    return
                  router.push(`/diagnosis?rid=${encodeURIComponent(rid)}`)
                }}
                disabled={!hasRid}
              >
                <span className="leading-[15px] whitespace-nowrap">
                  Episodes 1–
                  {totalEpisodes}
                  {' '}
                  Summary
                </span>
                <RiArrowRightSLine className="size-[21px]" aria-hidden="true" />
              </button>
            </div>

            <div className="px-6 pb-4 pt-4">
              <div className="border-border/60 text-muted-foreground grid h-[24px] grid-cols-[56px_112px_170px_1fr] items-center border-b px-2 text-[10px] font-semibold tracking-[0.5px] uppercase">
                <div>EP #</div>
                <div>Health</div>
                <div>Primary hook type</div>
                <div>AI highlight</div>
              </div>

              <div className="space-y-1 pt-2">
                {breakdownRows.map(row => (
                  <div
                    key={row.episode}
                    className="grid min-h-[43px] grid-cols-[56px_112px_170px_1fr] items-center px-2 py-2"
                  >
                    <div className="text-foreground text-[14px] font-semibold tabular-nums">
                      {row.episode}
                    </div>
                    <div>
                      <HealthBadge level={row.health} />
                    </div>
                    <div className="text-foreground text-[12px] font-medium leading-4">
                      {row.hook}
                    </div>
                    <div className="text-muted-foreground text-[12px] leading-[19.5px]">
                      <p className="overflow-hidden text-ellipsis line-clamp-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                        {row.highlight}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-border/60 border-t px-6 py-3 text-center">
              <p className="text-muted-foreground text-[10px] italic leading-[15px]">
                Showing
                {' '}
                {breakdownRows.length}
                {' '}
                of
                {' '}
                {totalEpisodes}
                {' '}
                episodes.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  )
}
