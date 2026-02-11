'use client'

import type { HealthLevel } from './result-sections'
import type { PreviewScore } from '@/lib/analysis/analysis-result'
import { RiArrowRightSLine, RiBookOpenLine, RiCoinsLine, RiDownloadLine, RiNodeTree } from '@remixicon/react'
import { motion, useReducedMotion } from 'motion/react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Reveal from '@/components/motion/reveal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { exportResultPdf } from '@/lib/analysis/export-result-pdf'
import { parseStoredRun, readRunRaw, subscribeRunStore, touchRun } from '@/lib/analysis/run-store'
import { resolveRunTitle } from '@/lib/analysis/run-view'
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
        <CardContent className="text-muted-foreground text-sm">
          Loading chart...
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
        <CardContent className="text-muted-foreground text-sm">
          Loading chart...
        </CardContent>
      </Card>
    </div>
  ),
})

const EMPTY_PREVIEW_SCORE: PreviewScore = {
  overall100: 0,
  grade: 'C',
  monetization: 0,
  story: 0,
  market: 0,
}

export default function ResultPage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const rid = useResolvedRid()
  const hasRid = rid != null && rid.length > 0
  const exportRootRef = useRef<HTMLDivElement | null>(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const isReduced = useReducedMotion() === true

  const raw = useSyncExternalStore(
    subscribeRunStore,
    () => (hasRid ? readRunRaw(rid) : null),
    () => null,
  )
  const result = useMemo(() => parseStoredRun(raw), [raw])
  const effectiveScore = result?.score ?? null
  const previewScore: PreviewScore = result?.previewScore ?? EMPTY_PREVIEW_SCORE
  const presentation = effectiveScore?.presentation ?? null
  const breakdownRows = presentation?.episodeRows ?? []

  useEffect(() => {
    if (!hydrated)
      return
    if (!hasRid || rid == null) {
      router.replace('/')
      return
    }
    if (result != null)
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

  const totalEpisodes = result?.meta.totalEpisodes ?? breakdownRows.length
  const overall100 = clamp(previewScore.overall100, 0, 100)
  const grade = previewScore.grade

  const monetization = clamp(previewScore.monetization, 0, 100)
  const story = clamp(previewScore.story, 0, 100)
  const market = clamp(previewScore.market, 0, 100)

  const title = resolveRunTitle(result?.meta.title)

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

  if (!hasRid)
    return null

  if (!result)
    return null

  return (
    <main className="bg-background min-h-svh" data-testid="result-page">
      <div className="border-border/60 bg-background/90 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-foreground text-base font-semibold tracking-tight">ScriptAI</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { void handleExportPdf() }}
              disabled={isExportingPdf}
              className="h-[38px] gap-2 px-4 border-border/60 bg-background shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
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
            <Button size="sm" onClick={onNewUpload}>
              New Upload
            </Button>
          </div>
        </div>
      </div>

      <motion.div
        ref={exportRootRef}
        className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10"
        initial={{ opacity: 0, y: isReduced ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 34 }}
      >
        <div className="flex flex-col gap-4">
          <Reveal variant="fadeInUp" delay={0}>
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
                  Evaluation dashboard / Automated assessment
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

                {pdfError != null && (
                  <p className="mt-2 text-right text-xs text-red-600">
                    {pdfError}
                  </p>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal variant="fadeInUp" delay={0.04}>
            <div className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-[0.69fr_1fr]">
              <Card className="shadow-xs py-0" interactive>
                <CardContent className="flex h-full flex-col items-center pb-10 pt-10 text-center">
                  <div className="relative grid place-items-center">
                    <GradeRing grade={grade} score100={overall100} />
                  </div>
                  <div className="mt-auto">
                    <div className="text-foreground text-lg font-semibold tracking-tight">Commercial Adaptability</div>
                    <p className="text-muted-foreground mx-auto mt-3 max-w-[28ch] text-xs leading-5">
                      {presentation?.commercialSummary}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-xs py-0" interactive>
                <CardContent className="flex h-full flex-col justify-center gap-10 pb-10 pt-10">
                  <MetricRow
                    animationDelay={0.14}
                    icon={RiCoinsLine}
                    accentClassName="text-[var(--chart-1)]"
                    indicatorClassName="bg-[var(--chart-1)]"
                    label="Monetization Power"
                    value={monetization}
                    description={presentation?.dimensionNarratives.monetization ?? ''}
                  />
                  <MetricRow
                    animationDelay={0.2}
                    icon={RiBookOpenLine}
                    accentClassName="text-[var(--chart-4)]"
                    indicatorClassName="bg-[var(--chart-4)]"
                    label="Story Structure Quality"
                    value={story}
                    description={presentation?.dimensionNarratives.story ?? ''}
                  />
                  <MetricRow
                    animationDelay={0.26}
                    icon={RiNodeTree}
                    accentClassName="text-[var(--chart-5)]"
                    indicatorClassName="bg-[var(--chart-5)]"
                    label="Market Compatibility"
                    value={market}
                    description={presentation?.dimensionNarratives.market ?? ''}
                  />
                </CardContent>
              </Card>
            </div>
          </Reveal>

          {presentation != null && (
            <Reveal variant="fadeInUp" delay={0.08} className="pb-5">
              <ResultCharts
                emotion={presentation.charts.emotion}
                conflict={presentation.charts.conflict}
              />
            </Reveal>
          )}

          <Reveal variant="fadeInUp" delay={0.12}>
            <Card className="bg-muted/20 shadow-xs mt-6 py-0 ring-border/60" interactive>
              <div className="bg-background/50 border-border/60 flex flex-col gap-2 border-b px-4 py-3 sm:h-[58px] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
                <p className="text-foreground text-[14px] font-semibold tracking-[0.35px] uppercase">
                  Individual episode breakdown
                </p>

                <button
                  type="button"
                  className="bg-background border-border/60 flex h-[28px] w-[170px] items-center justify-between rounded-[6px] border px-[10px] text-[11px] text-muted-foreground shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:bg-muted/30 sm:h-[25px] sm:w-[151px] sm:rounded-[4px] sm:px-[9px] sm:text-[10px]"
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

              <div className="px-4 pb-4 pt-4 sm:px-6">
                <div className="hidden md:block">
                  <div className="border-border/60 text-muted-foreground grid h-[24px] grid-cols-[56px_112px_170px_1fr] items-center border-b px-2 text-[10px] font-semibold tracking-[0.5px] uppercase">
                    <div>EP #</div>
                    <div>Health</div>
                    <div>Primary hook type</div>
                    <div>AI highlight</div>
                  </div>

                  <div className="space-y-1 pt-2">
                    {breakdownRows.length > 0
                      ? breakdownRows.map((row) => {
                          const health: HealthLevel = row.health === 'GOOD' ? 'good' : row.health === 'PEAK' ? 'peak' : 'fair'
                          return (
                            <motion.div
                              key={row.episode}
                              className="grid min-h-[43px] grid-cols-[56px_112px_170px_1fr] items-center px-2 py-2"
                              initial={{ opacity: 0, y: isReduced ? 0 : 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ type: 'spring', stiffness: 320, damping: 32, delay: row.episode * 0.01 }}
                            >
                              <div className="text-foreground text-[14px] font-semibold tabular-nums">
                                {String(row.episode).padStart(2, '0')}
                              </div>
                              <div>
                                <HealthBadge level={health} />
                              </div>
                              <div className="text-foreground text-[12px] font-medium leading-4">
                                {row.primaryHookType}
                              </div>
                              <div className="text-muted-foreground text-[12px] leading-[19.5px]">
                                <p className="overflow-hidden text-ellipsis line-clamp-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                                  {row.aiHighlight}
                                </p>
                              </div>
                            </motion.div>
                          )
                        })
                      : null}
                  </div>
                </div>

                <div className="space-y-2 md:hidden">
                  {breakdownRows.length > 0
                    ? breakdownRows.map((row) => {
                        const health: HealthLevel = row.health === 'GOOD' ? 'good' : row.health === 'PEAK' ? 'peak' : 'fair'
                        return (
                          <motion.div
                            key={row.episode}
                            className="border-border/60 bg-background/50 rounded-lg border px-3 py-3"
                            initial={{ opacity: 0, y: isReduced ? 0 : 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32, delay: row.episode * 0.01 }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-foreground text-sm font-semibold tabular-nums">
                                EP
                                {' '}
                                {String(row.episode).padStart(2, '0')}
                              </p>
                              <HealthBadge level={health} />
                            </div>
                            <p className="text-foreground text-[13px] font-medium leading-5">
                              {row.primaryHookType}
                            </p>
                            <p className="text-muted-foreground mt-1.5 text-[12px] leading-[18px] overflow-hidden text-ellipsis line-clamp-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                              {row.aiHighlight}
                            </p>
                          </motion.div>
                        )
                      })
                    : null}
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
          </Reveal>
        </div>
      </motion.div>
    </main>
  )
}
