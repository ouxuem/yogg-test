'use client'

import type { RemixiconComponentType } from '@remixicon/react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

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
  animationDelay = 0.12,
  accentClassName,
  description,
  icon: Icon,
  indicatorClassName,
  label,
  value,
}: {
  animationDelay?: number
  accentClassName: string
  description: string
  icon: RemixiconComponentType
  indicatorClassName: string
  label: string
  value: number
}) {
  const isReduced = useReducedMotion() === true
  const isReady = useMountTriggeredMotion(!isReduced)
  const normalizedValue = clampScore(value)

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
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={normalizedValue}
          className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        >
          <motion.div
            className={cn('h-full origin-left', indicatorClassName)}
            initial={false}
            animate={{ scaleX: isReady ? normalizedValue / 100 : 0 }}
            transition={isReduced
              ? { duration: 0.01 }
              : {
                  type: 'spring',
                  stiffness: 260,
                  damping: 30,
                  delay: animationDelay,
                }}
          />
        </div>
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

function useMountTriggeredMotion(enabled: boolean) {
  const [isReady, setIsReady] = useState(!enabled)

  useEffect(() => {
    if (!enabled)
      return

    const frameId = window.requestAnimationFrame(() => {
      setIsReady(true)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [enabled])

  return isReady
}

export function GradeRing({ grade, score100 }: { grade: string, score100: number }) {
  const isReduced = useReducedMotion() === true
  const isReady = useMountTriggeredMotion(!isReduced)
  const normalizedScore = clampScore(score100)
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - normalizedScore / 100)

  return (
    <motion.div
      className="relative grid size-48 place-items-center"
      initial={false}
      animate={isReady
        ? { opacity: 1, scale: 1, y: 0 }
        : { opacity: isReduced ? 1 : 0, scale: isReduced ? 1 : 0.92, y: isReduced ? 0 : 6 }}
      transition={isReduced
        ? { duration: 0.01 }
        : { type: 'spring', stiffness: 240, damping: 32, delay: 0.1 }}
    >
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
          initial={false}
          animate={{ strokeDashoffset: isReady ? dashOffset : circumference }}
          transition={isReduced
            ? { duration: 0.01 }
            : { type: 'spring', stiffness: 220, damping: 30, delay: 0.18 }}
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
    </motion.div>
  )
}
