'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { SPRING_PRESETS } from '@/lib/motion/tokens'
import DotGrid from '@/components/ui/dot-grid'
import PrismaticBurst from '@/components/ui/prismatic-burst'

const MAIN_TITLE = 'BUILDING SCENE'

const DEFAULT_STATUS_MESSAGES = [
  'Establishing connection',
  'Fetching data resources',
  'Parsing page structure',
  'Rendering visual elements',
  'Ready',
]

const LOADER_DOT_COUNT = 5

export default function GlobalLoading({
  message,
  testId,
}: {
  message?: string
  testId?: string
}) {
  const normalizedMessage = message?.trim() ?? ''
  const hasMessage = normalizedMessage.length > 0
  const isReduced = useReducedMotion() === true

  const [statusIndex, setStatusIndex] = useState(0)
  const [loaderIndex, setLoaderIndex] = useState(0)

  useEffect(() => {
    setStatusIndex(0)
  }, [hasMessage, normalizedMessage])

  useEffect(() => {
    if (hasMessage)
      return
    const interval = setInterval(() => {
      setStatusIndex(prev => (prev + 1) % DEFAULT_STATUS_MESSAGES.length)
    }, 1800)
    return () => clearInterval(interval)
  }, [hasMessage])

  useEffect(() => {
    const interval = setInterval(() => {
      setLoaderIndex(prev => (prev + 1) % LOADER_DOT_COUNT)
    }, 420)
    return () => clearInterval(interval)
  }, [])

  const titleChars = useMemo(() => MAIN_TITLE.split(''), [])
  const currentMessage = hasMessage ? normalizedMessage : DEFAULT_STATUS_MESSAGES[statusIndex]

  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_55%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={SPRING_PRESETS.smooth}
      />
      <div className="absolute inset-0">
        <PrismaticBurst
          intensity={1.9}
          speed={0.34}
          animationType="hover"
          distort={12}
          hoverDampness={0.35}
          rayCount={11}
          mixBlendMode="multiply"
        />
      </div>
      <div className="absolute inset-0 opacity-85">
        <DotGrid
          dotSize={2.8}
          gap={16}
          baseColor="var(--muted-foreground)"
          activeColor="var(--primary)"
          proximity={150}
          pushStrength={0.05}
          velocityInfluence={0.01}
          shockRadius={160}
          shockStrength={1}
          damping={0.9}
          spring={0.05}
          opacity={0.58}
          blur={1.7}
          maxDots={1500}
          fps={24}
        />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <motion.div
          className="w-full max-w-5xl flex flex-col items-center gap-8"
          data-testid={testId}
          initial={{ opacity: 0, y: isReduced ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_PRESETS.gentle}
        >
          <div className="relative">
            <h1 className="text-center text-5xl leading-[1.08] font-semibold tracking-[-0.03em] sm:text-6xl md:text-7xl">
              <span className="bg-linear-to-b from-white via-white to-white/70 bg-clip-text text-transparent">
                {titleChars.map((char, index) => (
                  <motion.span
                    key={`${char}-${index}`}
                    className="inline-block"
                    initial={{ opacity: 0, y: isReduced ? 0 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_PRESETS.gentle, delay: index * 0.06 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </span>
            </h1>
            <motion.div
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-[2px] bg-linear-to-r from-transparent via-primary/60 to-transparent"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 96, opacity: 1 }}
              transition={{ ...SPRING_PRESETS.smooth, delay: 0.24 }}
            />
          </div>

          <div className="h-6 flex items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={currentMessage}
                className="text-sm sm:text-base font-medium tracking-[0.12em] uppercase text-white/50"
                initial={{ opacity: 0, y: isReduced ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: isReduced ? 0 : -6 }}
                transition={SPRING_PRESETS.gentle}
              >
                {currentMessage}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 mt-4">
            {Array.from({ length: LOADER_DOT_COUNT }).map((_, index) => {
              const isActive = index === loaderIndex
              return (
                <motion.span
                  key={index}
                  className="w-1.5 h-1.5 rounded-full"
                  animate={isActive
                    ? { scale: 1.25, opacity: 1, backgroundColor: 'var(--primary)' }
                    : { scale: 1, opacity: 0.4, backgroundColor: 'rgba(255,255,255,0.2)' }}
                  transition={SPRING_PRESETS.snappy}
                />
              )
            })}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
