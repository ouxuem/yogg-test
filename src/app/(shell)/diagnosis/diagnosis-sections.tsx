'use client'

import type { EpisodeState } from './diagnosis-styles'
import { RiArrowDownSLine, RiBook2Line, RiSparkling2Line } from '@remixicon/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { stateStyles } from './diagnosis-styles'

export function LegendItem({ label, state }: { label: string, state: Exclude<EpisodeState, 'empty'> }) {
  const style = stateStyles(state)
  return (
    <div className="flex items-center gap-2">
      <span className="size-3 rounded-[3px] border" style={style} aria-hidden="true" />
      <span className="text-xs leading-4 sm:text-[12px] sm:leading-4">{label}</span>
    </div>
  )
}

interface MatrixItem {
  slot: number
  episode: number | null
  state: EpisodeState
  hasDetail: boolean
}

export function EpisodeMatrixCard({
  canExpand,
  isExpanded,
  matrix,
  selectedEpisode,
  setIsExpanded,
  setSelectedEpisode,
  totalEpisodes,
}: {
  canExpand: boolean
  isExpanded: boolean
  matrix: MatrixItem[]
  selectedEpisode: number
  setIsExpanded: (next: boolean | ((prev: boolean) => boolean)) => void
  setSelectedEpisode: (episode: number) => void
  totalEpisodes: number
}) {
  return (
    <Card className="bg-muted/20 shadow-xs mt-8 py-0 ring-border/60" interactive>
      <div className="flex flex-col gap-3 px-4 pt-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:pt-8">
        <p className="text-foreground text-[16px] leading-6 font-semibold tracking-[-0.2px]">
          Episode Matrix
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
          <LegendItem label="Optimal" state="optimal" />
          <LegendItem label="Issue Detected" state="issue" />
          <LegendItem label="Neutral/Healthy" state="neutral" />
        </div>
      </div>

      <div className="px-4 pb-6 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3 lg:grid-cols-12">
          {matrix.map((item) => {
            const episode = item.episode
            const isSelected = episode != null && episode === selectedEpisode
            const isEmpty = item.state === 'empty'
            const isOptimal = item.state === 'optimal'
            const isNeutralWithoutDetail = item.state === 'neutral' && !item.hasDetail
            const isClickable = !isEmpty && !isOptimal && !isNeutralWithoutDetail

            const selectionClass = isSelected
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              : isClickable
                ? 'hover:bg-muted/20 cursor-pointer'
                : ''

            const style = stateStyles(item.state)
            return (
              <button
                key={episode != null ? `ep-${episode}` : `slot-${item.slot}`}
                type="button"
                disabled={!isClickable}
                onClick={() => {
                  if (episode == null || !isClickable)
                    return
                  setSelectedEpisode(episode)
                }}
                className={[
                  'w-full aspect-square rounded-[10px] border text-[12px] font-semibold tabular-nums shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_6%,transparent)] transition lg:h-[83.5px] lg:w-[83.5px]',
                  isEmpty && 'disabled:cursor-not-allowed disabled:opacity-60',
                  selectionClass,
                ].join(' ')}
                style={style}
              >
                {episode ?? ''}
              </button>
            )
          })}
        </div>

        {canExpand && (
          <div className="mt-8 flex items-center justify-center">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="gap-2 text-[12px] leading-4 font-semibold"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded(v => !v)}
            >
              {isExpanded ? 'Show fewer episodes' : `View All ${totalEpisodes} Episodes`}
              <RiArrowDownSLine
                className={isExpanded ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'}
                aria-hidden="true"
              />
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

export function PrimaryIssueCard({
  conflictDensity,
  emotionLevel,
  hookType,
  pacingScore,
  selectedEpisode,
  selectedState,
  selectedSignalPercent,
  suggestion,
}: {
  conflictDensity: 'LOW' | 'MEDIUM' | 'HIGH'
  emotionLevel: string
  hookType: string
  pacingScore: number
  selectedEpisode: number
  selectedSignalPercent: number
  selectedState: EpisodeState
  suggestion: string
}) {
  return (
    <Card className="bg-muted/20 shadow-xs mt-4 py-0 ring-border/60" interactive>
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          borderLeft: `4px solid color-mix(in oklab, var(--chart-3) 70%, var(--border))`,
        }}
      >
        <div className="px-8 py-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-background border-border/60 inline-flex h-[30px] items-center rounded-[8px] border px-3 text-[12px] font-semibold">
                Episode
                {' '}
                {selectedEpisode}
              </span>
              <span
                className="inline-flex h-[26px] items-center gap-2 rounded-[8px] border px-3 text-[10px] font-semibold tracking-[0.4px] uppercase"
                style={{
                  backgroundColor: `color-mix(in oklab, var(--chart-3) 12%, var(--background))`,
                  borderColor: `color-mix(in oklab, var(--chart-3) 28%, var(--border))`,
                  color: `color-mix(in oklab, var(--chart-3) 74%, var(--foreground))`,
                }}
              >
                <RiSparkling2Line className="size-4" aria-hidden="true" />
                {selectedState === 'issue' ? 'Structural weakness' : 'Preview insight'}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px] lg:items-start">
              <div>
                <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.5px] uppercase">
                  Hook type
                </p>
                <p className="text-foreground mt-2 text-[16px] leading-6 font-semibold">
                  {hookType}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.5px] uppercase">
                  Emotion level
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Progress
                    value={selectedSignalPercent}
                    className="gap-0"
                    trackClassName="bg-muted h-2.5 w-[128px]"
                    indicatorClassName="bg-[var(--chart-3)]"
                  />
                  <p className="text-muted-foreground text-[12px] leading-4">{emotionLevel}</p>
                </div>
              </div>
            </div>

            <div className="border-border/60 bg-background/40 mt-6 rounded-[10px] border px-4 py-4 shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_6%,transparent)]">
              <div className="flex items-center gap-2">
                <RiSparkling2Line className="size-4 text-primary" aria-hidden="true" />
                <p className="text-primary text-[10px] font-semibold tracking-[0.5px] uppercase">
                  Suggestion
                </p>
              </div>
              <p className="text-muted-foreground mt-2 text-[12px] leading-[20px]">
                {suggestion}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="bg-background border-border/60 inline-flex h-[26px] items-center gap-2 rounded-[8px] border px-3 text-[11px] text-muted-foreground">
                Conflict Density:
                <span className="text-foreground font-semibold">{conflictDensity}</span>
              </span>
              <span className="bg-background border-border/60 inline-flex h-[26px] items-center gap-2 rounded-[8px] border px-3 text-[11px] text-muted-foreground">
                Pacing Score:
                <span className="text-foreground font-semibold">
                  {pacingScore.toFixed(1)}
                  /10
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function PacingIssueCard({
  hasIssue,
  issueLabel,
  issueReason,
  pacingEpisode,
}: {
  hasIssue: boolean
  issueLabel: string
  issueReason: string
  pacingEpisode: number
}) {
  return (
    <Card className="bg-muted/20 shadow-xs mt-6 py-0 ring-border/60" interactive>
      <div className="px-8 py-7">
        <div className="flex flex-col gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-background border-border/60 inline-flex h-[30px] items-center rounded-[8px] border px-3 text-[12px] font-semibold">
                Episode
                {' '}
                {pacingEpisode}
              </span>
              <span
                className="inline-flex h-[26px] items-center gap-2 rounded-[8px] border px-3 text-[10px] font-semibold tracking-[0.4px] uppercase"
                style={{
                  backgroundColor: `color-mix(in oklab, var(--chart-3) 12%, var(--background))`,
                  borderColor: `color-mix(in oklab, var(--chart-3) 28%, var(--border))`,
                  color: `color-mix(in oklab, var(--chart-3) 74%, var(--foreground))`,
                }}
              >
                <RiBook2Line className="size-4" aria-hidden="true" />
                {hasIssue ? 'Pacing drag' : 'Pacing stable'}
              </span>
            </div>

            <p className="text-muted-foreground mt-4 text-[10px] font-semibold tracking-[0.5px] uppercase">
              {hasIssue ? 'Detected issue' : 'Status'}
            </p>
            <p className="text-foreground mt-1 text-[12px] leading-[19px]">
              {`${issueLabel}: ${issueReason}`}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function NoIssueStateCard({
  selectedEpisode,
  filterView,
}: {
  selectedEpisode: number
  filterView: 'all' | 'structure' | 'pacing'
}) {
  const statusByView: Record<'all' | 'structure' | 'pacing', string> = {
    all: 'No actionable issue detail for this episode. Narrative status is healthy.',
    structure: 'No structural issue detail for this episode under current filter.',
    pacing: 'No pacing issue detail for this episode under current filter.',
  }

  return (
    <Card className="bg-muted/20 shadow-xs mt-4 py-0 ring-border/60" interactive>
      <div className="px-8 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-background border-border/60 inline-flex h-[28px] items-center rounded-[8px] border px-3 text-[12px] font-semibold">
            Episode
            {' '}
            {selectedEpisode}
          </span>
          <span className="bg-background border-border/60 inline-flex h-[26px] items-center rounded-[8px] border px-3 text-[10px] font-semibold tracking-[0.4px] uppercase text-muted-foreground">
            No issue detail
          </span>
        </div>
        <p className="text-muted-foreground mt-3 text-[12px] leading-[20px]">
          {statusByView[filterView]}
        </p>
      </div>
    </Card>
  )
}

export function IntegrityCard({ summary }: { summary: string }) {
  return (
    <Card className="bg-muted/20 shadow-xs mt-6 py-0 ring-border/60 opacity-90" interactive>
      <div className="px-8 py-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div
              className="grid size-12 place-items-center rounded-full border"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--chart-4) 12%, var(--background))',
                borderColor: 'color-mix(in oklab, var(--chart-4) 18%, var(--border))',
              }}
            >
              <RiSparkling2Line className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-foreground text-[16px] leading-6 font-semibold">
                Structural Integrity Check
              </p>
              <p className="text-muted-foreground mt-1 text-[14px] leading-5">
                {summary}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
