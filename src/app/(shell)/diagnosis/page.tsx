'use client'

import type { EpisodeState } from './diagnosis-styles'
import { RiArrowLeftSLine, RiCalendarLine } from '@remixicon/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { parseStoredRun, readRunRaw, subscribeRunStore, touchRun } from '@/lib/analysis/run-store'
import { resolveRunTitle } from '@/lib/analysis/run-view'
import {
  buildEpisodeSignals,
  buildHookTypeByEpisode,
  buildIssueReasonByEpisode,
  classifyIssueCategory,
  compactReason,
  extractEpisodeNumbersFromAuditItem,
  labelForAuditItem,
} from '@/lib/analysis/score-ui'
import { useResolvedRid } from '@/lib/analysis/use-resolved-rid'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import { clamp } from '@/lib/number'
import { EpisodeMatrixCard, IntegrityCard, PacingIssueCard, PrimaryIssueCard } from './diagnosis-sections'

function episodeStateFromHealth(health: 'good' | 'fair' | 'peak'): EpisodeState {
  if (health === 'good')
    return 'issue'
  if (health === 'peak')
    return 'optimal'
  return 'neutral'
}

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

  const episodes = useMemo(() => run?.l1.episodes ?? [], [run])
  const totalEpisodes = useMemo(() => run?.meta.totalEpisodes ?? episodes.length, [episodes.length, run?.meta.totalEpisodes])
  const auditItems = useMemo(() => run?.score?.audit.items ?? [], [run])

  const episodeSignals = useMemo(() => {
    return buildEpisodeSignals(episodes)
  }, [episodes])

  const signalByEpisode = useMemo(() => {
    return new Map(episodeSignals.map(item => [item.episode, item]))
  }, [episodeSignals])

  const hookByEpisode = useMemo(() => buildHookTypeByEpisode(auditItems), [auditItems])
  const issueByEpisode = useMemo(() => buildIssueReasonByEpisode(auditItems), [auditItems])

  const collapsedSlots = 24
  const canExpand = totalEpisodes > collapsedSlots

  const [selectedEpisode, setSelectedEpisode] = useState(() => {
    const fromQuery = Number(searchParams.get('ep'))
    if (Number.isFinite(fromQuery) && fromQuery >= 1)
      return Math.min(fromQuery, Math.max(1, totalEpisodes))
    return Math.min(9, Math.max(1, totalEpisodes))
  })

  const [isExpanded, setIsExpanded] = useState(() => {
    const fromQuery = Number(searchParams.get('ep'))
    return Number.isFinite(fromQuery) && fromQuery > collapsedSlots
  })

  const selectedEpisodeClamped = clamp(selectedEpisode, 1, Math.max(1, totalEpisodes))
  const slotCount = isExpanded ? totalEpisodes : collapsedSlots

  const matrix = useMemo(() => {
    const items: Array<{ slot: number, episode: number | null, state: EpisodeState }> = []
    for (let i = 1; i <= slotCount; i++) {
      if (!isExpanded && i > totalEpisodes) {
        items.push({ slot: i, episode: null, state: 'empty' })
        continue
      }

      const signal = signalByEpisode.get(i)
      items.push({
        slot: i,
        episode: i,
        state: signal == null ? 'neutral' : episodeStateFromHealth(signal.health),
      })
    }

    return items
  }, [isExpanded, signalByEpisode, slotCount, totalEpisodes])

  const selectedSignal = signalByEpisode.get(selectedEpisodeClamped)
  const selectedState = selectedSignal == null ? 'neutral' as EpisodeState : episodeStateFromHealth(selectedSignal.health)

  const [filterView, setFilterView] = useState<'all' | 'structure' | 'pacing'>('all')

  const selectedIssueItem = useMemo(() => {
    const candidates = auditItems
      .filter(item => item.status !== 'ok')
      .filter(item => extractEpisodeNumbersFromAuditItem(item).includes(selectedEpisodeClamped))
      .sort((a, b) => (b.max - b.score) - (a.max - a.score))
    return candidates[0] ?? null
  }, [auditItems, selectedEpisodeClamped])

  const selectedSuggestion = useMemo(() => {
    const lineFromEpisode = issueByEpisode.get(selectedEpisodeClamped)
    if (selectedIssueItem != null) {
      return `${labelForAuditItem(selectedIssueItem.id)}: ${compactReason(selectedIssueItem.reason, 180)}`
    }
    if (lineFromEpisode != null)
      return lineFromEpisode
    if (selectedState === 'issue')
      return '该集情绪和冲突信号偏弱，建议补强冲突推进与结尾钩子。'
    return '当前集在规则评分下未发现明显结构风险。'
  }, [issueByEpisode, selectedEpisodeClamped, selectedIssueItem, selectedState])

  const pacingIssueItem = useMemo(() => {
    const pacingItems = auditItems
      .filter(item => item.status !== 'ok' && classifyIssueCategory(item.id) === 'pacing')
      .sort((a, b) => (b.max - b.score) - (a.max - a.score))
    return pacingItems[0] ?? null
  }, [auditItems])

  const pacingEpisode = useMemo(() => {
    if (pacingIssueItem == null)
      return selectedEpisodeClamped
    const episodesFromItem = extractEpisodeNumbersFromAuditItem(pacingIssueItem)
    return episodesFromItem[0] ?? selectedEpisodeClamped
  }, [pacingIssueItem, selectedEpisodeClamped])

  const pacingIssueLabel = pacingIssueItem == null ? 'Pacing check' : labelForAuditItem(pacingIssueItem.id)
  const pacingIssueReason = pacingIssueItem == null
    ? '当前评分结果未检测到显著节奏拖拽。'
    : compactReason(pacingIssueItem.reason, 180)

  const integritySummary = useMemo(() => {
    const totalChecks = auditItems.length
    if (totalChecks === 0)
      return '评分审计数据缺失，无法完成结构完整性判断。'

    const issues = auditItems.filter(item => item.status !== 'ok')
    if (issues.length === 0)
      return `共 ${totalChecks} 项检查全部通过，未发现结构异常。`

    const weakest = [...issues].sort((a, b) => (b.max - b.score) - (a.max - a.score))[0]
    const passed = totalChecks - issues.length
    return `共 ${passed}/${totalChecks} 项通过；当前主要短板是 ${labelForAuditItem(weakest.id)}（${compactReason(weakest.reason, 88)}）。`
  }, [auditItems])

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

  if (!hasRid || !run)
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
            <Avatar size="default">
              <AvatarFallback>SA</AvatarFallback>
            </Avatar>
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

        <PrimaryIssueCard
          conflictDensity={selectedSignal?.conflictDensity ?? 'LOW'}
          emotionLevel={selectedSignal?.emotionLevel ?? 'Low'}
          hookType={hookByEpisode.get(selectedEpisodeClamped) ?? 'No Hook'}
          pacingScore={selectedSignal?.pacingScore ?? 0}
          selectedEpisode={selectedEpisodeClamped}
          selectedSignalPercent={selectedSignal?.signalPercent ?? 0}
          selectedState={selectedState}
          suggestion={selectedSuggestion}
        />

        {(filterView === 'all' || filterView === 'pacing') && (
          <PacingIssueCard
            hasIssue={pacingIssueItem != null}
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
