'use client'

import { useEffect, useState } from 'react'
import DotGrid from '@/components/ui/dot-grid'
import PrismaticBurst from '@/components/ui/prismatic-burst'

const MAIN_TITLE = '构建场景中'

const DEFAULT_STATUS_MESSAGES = [
  '正在建立连接',
  '获取数据资源',
  '解析页面结构',
  '渲染视觉元素',
  '准备就绪',
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

  const [visibleChars, setVisibleChars] = useState(0)
  const [statusIndex, setStatusIndex] = useState(0)
  const [loaderIndex, setLoaderIndex] = useState(0)
  const [showCursor, setShowCursor] = useState(true)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (visibleChars < MAIN_TITLE.length) {
      const timer = setTimeout(() => {
        setVisibleChars(prev => prev + 1)
      }, 120)
      return () => clearTimeout(timer)
    }
  }, [visibleChars])

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

  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 530)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (visibleChars === MAIN_TITLE.length) {
      const timer = setTimeout(() => setIsReady(true), 300)
      return () => clearTimeout(timer)
    }
  }, [visibleChars])

  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_55%)]" />
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
        <div className="w-full max-w-5xl flex flex-col items-center gap-8" data-testid={testId}>
          <>
            <div className="relative">
              <h1 className={`text-center text-5xl leading-[1.08] font-semibold tracking-[-0.03em] sm:text-6xl md:text-7xl transition-all duration-700 ease-out ${isReady ? 'opacity-100' : 'opacity-90'}`}>
                <span className="bg-linear-to-b from-white via-white to-white/70 bg-clip-text text-transparent">
                  {MAIN_TITLE.split('').map((char, index) => (
                    <span
                      key={index}
                      className={`inline-block transition-all duration-300 ${index < visibleChars ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                      style={{ transitionDelay: `${index * 50}ms` }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
                <span className={`inline-block ml-1 w-[3px] h-[0.9em] bg-white/80 align-middle transition-opacity duration-200 ${showCursor && visibleChars >= MAIN_TITLE.length ? 'opacity-100' : 'opacity-0'}`} />
              </h1>
              <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 h-[2px] bg-linear-to-r from-transparent via-primary/60 to-transparent transition-all duration-1000 ease-out ${isReady ? 'w-24 opacity-100' : 'w-0 opacity-0'}`} />
            </div>

            <div className="h-6 flex items-center justify-center">
              <p key={hasMessage ? normalizedMessage : statusIndex} className="text-sm sm:text-base font-medium tracking-[0.12em] uppercase text-white/50 animate-fade-in-up">
                {hasMessage ? normalizedMessage : DEFAULT_STATUS_MESSAGES[statusIndex]}
              </p>
            </div>

            <div className={`flex items-center gap-2 mt-4 transition-all duration-700 delay-500 ${isReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {Array.from({ length: LOADER_DOT_COUNT }).map((_, index) => (
                <span
                  key={index}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${index === loaderIndex ? 'bg-primary scale-125' : 'bg-white/18 scale-100'}`}
                />
              ))}
            </div>
          </>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
