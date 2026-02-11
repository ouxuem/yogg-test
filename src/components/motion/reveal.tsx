'use client'

import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMotionGroupGate } from '@/lib/motion/orchestrator'
import { MOTION_VIEWPORT } from '@/lib/motion/tokens'
import {
  getFadeInUpVariant,
  getScaleInVariant,
  getStaggerContainerVariant,
  getStaggerItemVariant,
} from '@/lib/motion/variants'

export type RevealVariantName = 'fadeInUp' | 'scaleIn' | 'staggerContainer' | 'staggerItem' | 'none'

export interface RevealProps {
  children: ReactNode
  delay?: number
  once?: boolean
  groupId?: string
  variant?: RevealVariantName
  className?: ComponentPropsWithoutRef<'div'>['className']
}

const REVEAL_FALLBACK_DURATION_MS = 760

function getVariant(variant: RevealVariantName, isReduced: boolean) {
  switch (variant) {
    case 'scaleIn':
      return getScaleInVariant(isReduced)
    case 'staggerContainer':
      return getStaggerContainerVariant(isReduced)
    case 'staggerItem':
      return getStaggerItemVariant(isReduced)
    case 'none':
      return undefined
    case 'fadeInUp':
    default:
      return getFadeInUpVariant(isReduced)
  }
}

export default function Reveal({
  children,
  delay = 0,
  once = true,
  groupId,
  variant = 'fadeInUp',
  className,
}: RevealProps) {
  const retryIntervalRef = useRef<number | null>(null)
  const releaseTimerRef = useRef<number | null>(null)
  const localId = useId()
  const isReduced = useReducedMotion() === true
  const [isAllowed, setIsAllowed] = useState(isReduced)

  const id = useMemo(() => groupId ?? `reveal-${localId.replaceAll(':', '')}`, [groupId, localId])
  const { tryAcquire, release } = useMotionGroupGate(id)
  const variants = getVariant(variant, isReduced)

  const clearRetryInterval = useCallback(() => {
    if (retryIntervalRef.current != null) {
      window.clearInterval(retryIntervalRef.current)
      retryIntervalRef.current = null
    }
  }, [])

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current != null) {
      window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [])

  const attemptAcquire = useCallback(() => {
    if (isReduced)
      return true

    if (tryAcquire()) {
      setIsAllowed(true)
      clearReleaseTimer()
      releaseTimerRef.current = window.setTimeout(() => {
        release()
      }, REVEAL_FALLBACK_DURATION_MS + delay * 1000)
      return true
    }

    return false
  }, [clearReleaseTimer, delay, isReduced, release, tryAcquire])

  useEffect(() => {
    return () => {
      clearRetryInterval()
      clearReleaseTimer()
      release()
    }
  }, [clearReleaseTimer, clearRetryInterval, release])

  const onViewportEnter = () => {
    if (isReduced || isAllowed)
      return
    if (attemptAcquire())
      return
    if (retryIntervalRef.current != null)
      return
    retryIntervalRef.current = window.setInterval(() => {
      if (attemptAcquire()) {
        clearRetryInterval()
      }
    }, 120)
  }

  const onViewportLeave = () => {
    clearRetryInterval()
    if (once || isReduced)
      return
    clearReleaseTimer()
    setIsAllowed(false)
    release()
  }

  if (variants == null) {
    return (
      <div className={className}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      initial="hidden"
      whileInView={isReduced || isAllowed ? 'visible' : 'hidden'}
      viewport={{
        once,
        amount: MOTION_VIEWPORT.amount,
        margin: MOTION_VIEWPORT.margin,
      }}
      onViewportEnter={onViewportEnter}
      onViewportLeave={onViewportLeave}
      variants={variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
