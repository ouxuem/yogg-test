'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { getPageTransition } from '@/lib/motion/variants'

export default function RoutePresence({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isReduced = useReducedMotion() === true
  const transition = getPageTransition(isReduced)
  const [motionState, setMotionState] = useState<'idle' | 'running'>('idle')

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={transition.initial}
        animate={transition.animate}
        exit={transition.exit}
        data-testid="route-presence"
        data-motion-state={motionState}
        onAnimationStart={() => setMotionState('running')}
        onAnimationComplete={() => setMotionState('idle')}
        className="min-h-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
