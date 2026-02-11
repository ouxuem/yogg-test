'use client'

import type { RemixiconComponentType } from '@remixicon/react'
import { motion, useReducedMotion } from 'motion/react'
import { Progress } from '@/components/ui/progress'

export type HealthLevel = 'good' | 'fair' | 'peak'

export function HealthBadge({ level }: { level: HealthLevel }) {
  const label = level === 'peak' ? 'Peak' : level === 'fair' ? 'Fair' : 'Good'
  const accent
    = level === 'peak'
      ? 'var(--chart-1)'
      : level === 'fair'
        ? 'var(--chart-3)'
        : 'var(--chart-4)'

  return (
    <span
      className="inline-flex h-[25px] items-center gap-2 rounded-full border px-3 text-[10px] font-semibold tracking-[0.25px] uppercase"
      style={{
        backgroundColor: `color-mix(in oklab, ${accent} 10%, var(--background))`,
        borderColor: `color-mix(in oklab, ${accent} 18%, var(--border))`,
        color: `color-mix(in oklab, ${accent} 78%, var(--foreground))`,
      }}
    >
      <span className="size-[6px] rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
      {label}
    </span>
  )
}

export function MetricRow({
  accentClassName,
  description,
  icon: Icon,
  indicatorClassName,
  label,
  value,
}: {
  accentClassName: string
  description: string
  icon: RemixiconComponentType
  indicatorClassName: string
  label: string
  value: number
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon className={`h-[18px] w-[18px] ${accentClassName}`} aria-hidden="true" />
        <p className="text-foreground text-sm font-semibold">{label}</p>
        <p className="text-foreground ml-auto text-sm font-semibold tabular-nums">
          {value}
          %
        </p>
      </div>

      <div className="mt-2">
        <Progress
          value={value}
          className="gap-0"
          trackClassName="bg-muted h-1.5"
          indicatorClassName={indicatorClassName}
        />
      </div>

      <div className="border-border mt-3 border-l-2 pl-6">
        <p className="text-muted-foreground min-h-[30px] text-[11px] leading-[15px] overflow-hidden text-ellipsis line-clamp-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
          {description}
        </p>
      </div>
    </div>
  )
}

function clampScore(value: number) {
  if (!Number.isFinite(value))
    return 0
  if (value < 0)
    return 0
  if (value > 100)
    return 100
  return Math.round(value)
}

export function GradeRing({ grade, score100 }: { grade: string, score100: number }) {
  const isReduced = useReducedMotion() === true
  const normalizedScore = clampScore(score100)
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - normalizedScore / 100)

  return (
    <div className="relative grid size-48 place-items-center">
      <svg className="size-48" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r="46"
          fill="none"
          stroke="color-mix(in oklab, var(--muted) 55%, var(--border) 45%)"
          strokeWidth="10"
        />
        <motion.circle
          cx="60"
          cy="60"
          r="46"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          animate={{ strokeDashoffset: dashOffset }}
          transition={isReduced ? { duration: 0.01 } : { type: 'spring', stiffness: 220, damping: 30 }}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-foreground font-serif text-[60px] leading-[60px] font-bold tracking-tight tabular-nums">
            {grade}
          </div>
          <div className="text-muted-foreground mt-2 text-[10px] font-semibold tracking-[1px] uppercase">
            Grade
          </div>
        </div>
      </div>
    </div>
  )
}
