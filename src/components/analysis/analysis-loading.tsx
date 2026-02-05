'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Progress, ProgressLabel } from '@/components/ui/progress'

type PhaseKey = 'ingest' | 'entities' | 'semantic' | 'scoring' | 'finalize'

const PHASES: Array<{
  key: PhaseKey
  title: string
  subtitle: string
  weight: number
}> = [
  {
    key: 'ingest',
    title: 'Ingestion & structuring',
    subtitle: 'Reading episodes and standardizing the input format.',
    weight: 0.18,
  },
  {
    key: 'entities',
    title: 'Entity freeze',
    subtitle: 'Locking characters, relationships, and repeated motifs.',
    weight: 0.14,
  },
  {
    key: 'semantic',
    title: 'Deep semantic analysis (L2)',
    subtitle: 'Evaluating hooks, conflict signals, and narrative intent.',
    weight: 0.42,
  },
  {
    key: 'scoring',
    title: 'Canonical aggregation (V2)',
    subtitle: 'Applying V2 rules, weights, and corrections consistently.',
    weight: 0.18,
  },
  {
    key: 'finalize',
    title: 'Finalizing report',
    subtitle: 'Assembling dashboard and diagnosis outputs.',
    weight: 0.08,
  },
]

const ACTIVITY_LINES = [
  'Validating episode headers and paywall markers.',
  'Sampling EP2 opening window (1,000 chars) for attribution.',
  'Rebuilding hook context across episode boundaries.',
  'Scanning for redline cultural taboos (hard veto).',
  'Calculating “visual hammer” density across EP1–EP3.',
  'Classifying hook types: Decision, Crisis, Information, Emotion.',
  'Calibrating paywall window around EP6–EP7 for monetization signals.',
  'Separating external conflict vs internal emotional tension.',
  'Running V2 audit trail assembly for explainable scoring.',
]

const VALUE_TIPS = [
  'V2 does not just count conflict — it separates external action from internal emotional tension.',
  'Hook scoring re-samples episode tails to avoid “cut-point bias”.',
  'The system combines deterministic metrics (L1) with structure recognition (L2) for stability.',
  'Monetization signals carry 50% weight — paywall placement and hook strength matter.',
]

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function _formatPct(value01: number) {
  return `${Math.round(clamp01(value01) * 100)}%`
}

function phaseFromProgress(progress01: number): PhaseKey {
  const cutoffs = PHASES.reduce<Array<{ key: PhaseKey, end: number }>>((acc, phase) => {
    const prevEnd = acc.length ? acc[acc.length - 1].end : 0
    acc.push({ key: phase.key, end: prevEnd + phase.weight })
    return acc
  }, [])

  const hit = cutoffs.find(c => progress01 <= c.end)
  return hit?.key ?? 'finalize'
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
}: {
  testId?: string
}) {
  const progress01 = useSimulatedProgress(true)
  const phaseKey = useMemo(() => phaseFromProgress(progress01), [progress01])
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
    return `${current}…`
  }, [activeIndex])

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
          <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <ol className="space-y-2">
              {PHASES.map((phase, index) => {
                const isActive = index === activeIndex
                const isDone = index < activeIndex
                return (
                  <li
                    key={phase.key}
                    className={[
                      'rounded-xl px-3 py-2 transition',
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
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Activity
              </p>
              <p className="mt-1 text-sm leading-5">
                {ACTIVITY_LINES[activityIndex]}
              </p>
            </div>
            <div className="mt-3 rounded-xl border border-border/70 bg-card/60 p-3">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Why it’s worth the wait
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {VALUE_TIPS[tipIndex]}
              </p>
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
          L1 + L2 → V2 audit → report
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
        <span>Deterministic metrics</span>
        <span>Structure recognition</span>
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
            className="w-full rounded-sm bg-primary/80"
            style={{
              height: `${8 + ((i * 7) % 18)}px`,
              opacity: 0.35 + ((i % 5) * 0.1),
              animation: 'analysis-bar 1.8s ease-in-out infinite',
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>

      <style jsx>
        {`
        @keyframes analysis-bar {
          0% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }
      `}
      </style>
    </div>
  )
}
