import type { TargetAndTransition, Transition, Variants } from 'motion/react'
import { APPLE_EASING, FAST_EXIT, MOTION_STAGGER, REDUCED_TRANSITION, SPRING_PRESETS } from './tokens'

export type MotionVariantName
  = | 'fadeInUp'
    | 'scaleIn'
    | 'staggerContainer'
    | 'staggerItem'
    | 'hoverLift'
    | 'tapScale'
    | 'modalOverlay'
    | 'modalContent'
    | 'pageTransition'

function withReduced<T extends Variants>(normal: T, reduced: T, isReduced: boolean) {
  return isReduced ? reduced : normal
}

const fadeInUpNormal: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: SPRING_PRESETS.gentle,
  },
}

const fadeInUpReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: REDUCED_TRANSITION },
}

const scaleInNormal: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: SPRING_PRESETS.snappy,
  },
}

const scaleInReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: REDUCED_TRANSITION },
}

const staggerContainerNormal: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: MOTION_STAGGER.delay,
      staggerChildren: MOTION_STAGGER.children,
    },
  },
}

const staggerContainerReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: REDUCED_TRANSITION },
}

const staggerItemNormal: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: SPRING_PRESETS.gentle,
  },
}

const staggerItemReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: REDUCED_TRANSITION },
}

const hoverLiftNormal: Variants = {
  rest: {
    scale: 1,
    y: 0,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    transition: SPRING_PRESETS.gentle,
  },
  hover: {
    scale: 1.02,
    y: -4,
    boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
    transition: SPRING_PRESETS.snappy,
  },
}

const hoverLiftReduced: Variants = {
  rest: { opacity: 1 },
  hover: { opacity: 1, transition: REDUCED_TRANSITION },
}

const tapScaleNormal: Variants = {
  rest: { scale: 1 },
  pressed: {
    scale: 0.96,
    transition: SPRING_PRESETS.bouncy,
  },
}

const tapScaleReduced: Variants = {
  rest: { opacity: 1 },
  pressed: { opacity: 1, transition: REDUCED_TRANSITION },
}

const modalOverlayNormal: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: APPLE_EASING.appleEaseOut },
  },
  exit: { opacity: 0, transition: FAST_EXIT },
}

const modalOverlayReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: REDUCED_TRANSITION },
  exit: { opacity: 0, transition: REDUCED_TRANSITION },
}

const modalContentNormal: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRING_PRESETS.gentle,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: FAST_EXIT,
  },
}

const modalContentReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: REDUCED_TRANSITION },
  exit: { opacity: 0, transition: REDUCED_TRANSITION },
}

export interface PageTransitionConfig {
  initial: TargetAndTransition
  animate: TargetAndTransition
  exit: TargetAndTransition
}

const pageTransitionNormal: PageTransitionConfig = {
  initial: { opacity: 0, x: 20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 40,
    },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: FAST_EXIT,
  },
}

const pageTransitionReduced: PageTransitionConfig = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: REDUCED_TRANSITION },
  exit: { opacity: 0, transition: REDUCED_TRANSITION },
}

export function getFadeInUpVariant(isReduced: boolean): Variants {
  return withReduced(fadeInUpNormal, fadeInUpReduced, isReduced)
}

export function getScaleInVariant(isReduced: boolean): Variants {
  return withReduced(scaleInNormal, scaleInReduced, isReduced)
}

export function getStaggerContainerVariant(isReduced: boolean): Variants {
  return withReduced(staggerContainerNormal, staggerContainerReduced, isReduced)
}

export function getStaggerItemVariant(isReduced: boolean): Variants {
  return withReduced(staggerItemNormal, staggerItemReduced, isReduced)
}

export function getHoverLiftVariant(isReduced: boolean): Variants {
  return withReduced(hoverLiftNormal, hoverLiftReduced, isReduced)
}

export function getTapScaleVariant(isReduced: boolean): Variants {
  return withReduced(tapScaleNormal, tapScaleReduced, isReduced)
}

export function getModalOverlayVariant(isReduced: boolean): Variants {
  return withReduced(modalOverlayNormal, modalOverlayReduced, isReduced)
}

export function getModalContentVariant(isReduced: boolean): Variants {
  return withReduced(modalContentNormal, modalContentReduced, isReduced)
}

export function getPageTransition(isReduced: boolean): PageTransitionConfig {
  return isReduced ? pageTransitionReduced : pageTransitionNormal
}

export function getExitTransition(isReduced: boolean): Transition {
  return isReduced ? REDUCED_TRANSITION : FAST_EXIT
}

export const fadeInUp = getFadeInUpVariant
export const scaleIn = getScaleInVariant
export const staggerContainer = getStaggerContainerVariant
export const staggerItem = getStaggerItemVariant
export const hoverLift = getHoverLiftVariant
export const tapScale = getTapScaleVariant
export const modalOverlay = getModalOverlayVariant
export const modalContent = getModalContentVariant
export const pageTransition = getPageTransition
