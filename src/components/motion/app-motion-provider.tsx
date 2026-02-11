'use client'

import type { ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { SPRING_PRESETS } from '@/lib/motion/tokens'

export default function AppMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={SPRING_PRESETS.gentle}
    >
      {children}
    </MotionConfig>
  )
}
