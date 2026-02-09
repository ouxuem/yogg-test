'use client'

import type { AnalysisProgress } from '@/lib/analysis/analysis-progress'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Progress, ProgressLabel } from '@/components/ui/progress'

type PhaseKey = AnalysisProgress['phase']

const PHASES: Array<{
  key: PhaseKey
  title: string
  subtitle: string
  weight: number
}> = [
  {
    key: 'validate_index',
    title: 'Validate & index',
    subtitle: 'Checking format, completeness, and episode order.',
    weight: 0.18,
  },
  {
    key: 'structure_story',
    title: 'Structure the story',
    subtitle: 'Building consistent story windows for fair comparison.',
    weight: 0.2,
  },
  {
    key: 'map_characters',
    title: 'Map characters & relationships',
    subtitle: 'Tracking who matters, how they connect, and what shifts.',
    weight: 0.18,
  },
  {
    key: 'evaluate_momentum',
    title: 'Evaluate momentum',
    subtitle: 'Measuring tension, conflict, pacing, and episode endings.',
    weight: 0.34,
  },
  {
    key: 'assemble_report',
    title: 'Score & assemble report',
    subtitle: 'Compiling score breakdowns, charts, and diagnostics.',
    weight: 0.1,
  },
]

const ACTIVITY_LINES = [
  'Validating episode headers and completion status.',
  'Indexing openings and endings across episodes.',
  'Identifying core characters and recurring threads.',
  'Estimating emotional intensity and conflict moments.',
  'Checking cliffhangers, reversals, and momentum shifts.',
  'Detecting monetization checkpoints and their setup.',
  'Running content safety and audience-fit checks.',
  'Compiling episode-by-episode breakdown and key issues.',
  'Finalizing charts and export-ready layout.',
]

const VALUE_TIPS = [
  'We look for both immediate hooks and long-range setup across episodes.',
  'Scores come with explanations, so you can see what drove them.',
  'We distinguish external action from internal emotional tension.',
  'We focus on momentum — what makes a reader keep going.',
]

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function phaseFromProgress(progress01: number): PhaseKey {
  const cutoffs = PHASES.reduce<Array<{ key: PhaseKey, end: number }>>((acc, phase) => {
    const prevEnd = acc.length ? acc[acc.length - 1].end : 0
    acc.push({ key: phase.key, end: prevEnd + phase.weight })
    return acc
  }, [])

  const hit = cutoffs.find(c => progress01 <= c.end)
  return hit?.key ?? 'assemble_report'
}

function useSimulatedProgress(enabled: boolean) {
  const startedAt = useRef<number | null>(null)
  const [progress01, setProgress01] = useState(0)

  useEffect(() => {
    if (!enabled)
      return
    if (startedAt.current === null)
      startedAt.current = Date.now()

    let raf = 0
    const tick = () => {
      const elapsedMs = Date.now() - (startedAt.current ?? Date.now())
      const elapsed = elapsedMs / 1000

      const base = clamp01(1 - Math.exp(-elapsed / 22))
      const nearDoneCap = 0.92
      const capped = Math.min(base, nearDoneCap)

      const breathe = 0.003 * Math.sin(elapsed * 1.6)
      setProgress01(clamp01(capped + breathe))
      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [enabled])

  return progress01
}

export default function AnalysisLoading({
  testId,
  progress,
  mode,
}: {
  testId?: string
  progress?: AnalysisProgress
  mode?: 'simulated' | 'driven'
}) {
  const effectiveMode = mode || (progress ? 'driven' : 'simulated')
  const simulatedProgress01 = useSimulatedProgress(effectiveMode === 'simulated')
  const drivenProgress01 = useMemo(() => clamp01((progress?.percent ?? 0) / 100), [progress?.percent])
  const progress01 = effectiveMode === 'driven' ? drivenProgress01 : simulatedProgress01

  const phaseKey = useMemo(() => {
    if (effectiveMode === 'driven')
      return progress?.phase || 'validate_index'
    return phaseFromProgress(progress01)
  }, [effectiveMode, progress?.phase, progress01])

  const activeIndex = useMemo(() => PHASES.findIndex(p => p.key === phaseKey), [phaseKey])

  const [activityIndex, setActivityIndex] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActivityIndex(i => (i + 1) % ACTIVITY_LINES.length)
    }, 1700)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTipIndex(i => (i + 1) % VALUE_TIPS.length)
    }, 5200)
    return () => window.clearInterval(interval)
  }, [])

  const statusText = useMemo(() => {
    const current = PHASES[Math.max(0, activeIndex)]?.title ?? 'Analyzing'
    const suffix = progress?.batch ? ` (${progress.batch.current}/${progress.batch.total})` : ''
    return `${current}…${suffix}`
  }, [activeIndex, progress])

  return (
    <div
      className="relative overflow-hidden rounded-[32px] border border-border/70 bg-background/80 p-[10px] shadow-sm backdrop-blur-[2px]"
      data-testid={testId}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 size-80 rounded-full bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] blur-3xl" />
        <div className="absolute -bottom-28 -right-24 size-96 rounded-full bg-[color-mix(in_oklab,var(--secondary)_12%,transparent)] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_55%)]" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--border)_55%,transparent)_0px,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px,transparent_14px)] opacity-[0.55]" />
      </div>

      <div className="relative overflow-hidden rounded-[24px] border border-border/70 bg-card/70 px-4 pb-4 pt-4 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-foreground mt-1 text-lg font-semibold tracking-tight">
              Deep analysis in progress
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              This can take a minute or two. Keep this tab open.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Progress value={Math.round(progress01 * 100)} className="gap-2">
            <ProgressLabel className="text-xs text-muted-foreground">
              {statusText}
            </ProgressLabel>
          </Progress>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-border/70 bg-background/60 p-3 lg:flex lg:h-full lg:flex-col">
            <ol className="flex flex-col gap-2 lg:grid lg:flex-1 lg:grid-rows-5 lg:gap-2">
              {PHASES.map((phase, index) => {
                const isActive = index === activeIndex
                const isDone = index < activeIndex
                return (
                  <li
                    key={phase.key}
                    className={[
                      'rounded-xl px-3 py-2 transition',
                      'lg:flex lg:h-full lg:items-center',
                      isActive ? 'bg-accent/60' : 'bg-transparent',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <PhaseMark state={isDone ? 'done' : isActive ? 'active' : 'idle'} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-5">
                          {phase.title}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs leading-4">
                          {phase.subtitle}
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <HeroViz />
            <div className="mt-3 rounded-xl border border-border/70 bg-card/60 p-3">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase whitespace-nowrap">
                Activity
              </p>
              <div className="mt-1 min-h-10">
                <p className="text-sm leading-5 overflow-hidden text-ellipsis line-clamp-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                  {progress?.activity ?? ACTIVITY_LINES[activityIndex]}
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border/70 bg-card/60 p-3">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase whitespace-nowrap">
                Why it’s worth the wait
              </p>
              <div className="mt-1 min-h-10">
                <p className="text-sm leading-5 text-muted-foreground overflow-hidden text-ellipsis line-clamp-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                  {VALUE_TIPS[tipIndex]}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhaseMark({ state }: { state: 'idle' | 'active' | 'done' }) {
  if (state === 'done') {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <svg
          viewBox="0 0 24 24"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    )
  }

  if (state === 'active') {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-primary/70 bg-primary/10">
        <span className="size-2 rounded-full bg-primary animate-pulse" />
      </span>
    )
  }

  return (
    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border bg-background">
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
    </span>
  )
}

function HeroViz() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card/60 p-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Pipeline
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          input → signals → score → report
        </p>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <StackBlocks label="Episodes" />
        <div className="text-muted-foreground grid place-items-center">
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </div>
        <SignalBars />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Measurable signals</span>
        <span>Story patterns</span>
      </div>
    </div>
  )
}

function StackBlocks({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="text-foreground text-sm font-semibold">{label}</div>
      <div className="mt-2 grid grid-cols-6 gap-1.5">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className={[
              'h-2.5 rounded-sm border border-border/70 bg-background',
              i % 7 === 0 ? 'animate-[pulse_2.4s_ease-in-out_infinite]' : '',
            ].join(' ')}
            style={{ animationDelay: `${(i % 6) * 120}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function SignalBars() {
  return (
    <div className="relative">
      <div className="text-foreground text-sm font-semibold">Signals</div>
      <div className="mt-2 grid grid-cols-8 items-end gap-1.5">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="animate-analysis-bar w-full rounded-sm bg-primary/80"
            style={{
              height: `${8 + ((i * 7) % 18)}px`,
              opacity: 0.35 + ((i % 5) * 0.1),
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
