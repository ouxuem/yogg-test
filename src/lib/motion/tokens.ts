import type { Transition } from 'motion/react'

export type MotionPreset = 'snappy' | 'gentle' | 'bouncy' | 'smooth' | 'inertia'
export type ReducedMotionStrategy = 'user' | 'always' | 'never'

export interface SpringTransition {
  type: 'spring'
  stiffness: number
  damping: number
  mass?: number
}

export const snappy: SpringTransition = { type: 'spring', stiffness: 400, damping: 30 }
export const gentle: SpringTransition = { type: 'spring', stiffness: 300, damping: 35 }
export const bouncy: SpringTransition = { type: 'spring', stiffness: 500, damping: 25, mass: 0.8 }
export const smooth: SpringTransition = { type: 'spring', stiffness: 200, damping: 40, mass: 1.2 }
export const inertia: SpringTransition = { type: 'spring', stiffness: 150, damping: 20, mass: 0.5 }

export const SPRING_PRESETS: Record<MotionPreset, SpringTransition> = {
  snappy,
  gentle,
  bouncy,
  smooth,
  inertia,
}

export const APPLE_EASING = {
  appleEase: [0.25, 0.1, 0.25, 1.0] as const,
  appleEaseOut: [0.22, 1, 0.36, 1] as const,
  appleDecelerate: [0, 0, 0.2, 1] as const,
}
export const appleEase = APPLE_EASING.appleEase
export const appleEaseOut = APPLE_EASING.appleEaseOut
export const appleDecelerate = APPLE_EASING.appleDecelerate

export const FAST_EXIT: Transition = {
  duration: 0.18,
  ease: APPLE_EASING.appleDecelerate,
}
export const fastExit = FAST_EXIT

export const REDUCED_TRANSITION: Transition = {
  duration: 0.01,
  ease: 'linear',
}
export const reduced = REDUCED_TRANSITION

export const MOTION_VIEWPORT = {
  once: true,
  amount: 0.2,
  margin: '0px 0px -10% 0px',
} as const

export const MOTION_STAGGER = {
  children: 0.06,
  delay: 0.1,
} as const

export const MOTION_MAX_ACTIVE_GROUPS = 3
