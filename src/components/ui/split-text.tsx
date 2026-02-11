'use client'

import type { CSSProperties, ElementType } from 'react'
import type { Transition } from 'motion/react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type SplitType = 'chars' | 'words' | 'lines' | 'words, chars'
type SplitTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span'
type EaseFunction = (t: number) => number
type MotionState = Record<string, string | number>

interface Segment {
  key: string
  value: string
  animate: boolean
  order: number
  lineBreak: boolean
}

interface CompletionState {
  key: string
  count: number
  total: number
  done: boolean
}

export interface SplitTextProps {
  text: string
  className?: string
  delay?: number
  duration?: number
  ease?: Transition['ease'] | EaseFunction
  splitType?: SplitType
  from?: MotionState
  to?: MotionState
  threshold?: number
  rootMargin?: string
  tag?: SplitTag
  textAlign?: CSSProperties['textAlign']
  onLetterAnimationComplete?: () => void
}

const DEFAULT_FROM: MotionState = { opacity: 0, y: 40 }
const DEFAULT_TO: MotionState = { opacity: 1, y: 0 }

function splitGraphemes(input: string) {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(input), item => item.segment)
  }
  return Array.from(input)
}

function createSegments(text: string, splitType: SplitType): Segment[] {
  if (splitType === 'lines') {
    const lines = text.split('\n')
    let order = 0
    const segments: Segment[] = []

    lines.forEach((line, lineIndex) => {
      segments.push({
        key: `line-${lineIndex}`,
        value: line.length > 0 ? line : '\u00A0',
        animate: true,
        order: order++,
        lineBreak: false,
      })
      if (lineIndex < lines.length - 1) {
        segments.push({
          key: `line-break-${lineIndex}`,
          value: '\n',
          animate: false,
          order: -1,
          lineBreak: true,
        })
      }
    })

    return segments
  }

  if (splitType === 'words') {
    let order = 0
    return text.split(/(\s+)/).map((part, index) => {
      const animate = part.trim().length > 0
      return {
        key: `word-${index}`,
        value: part,
        animate,
        order: animate ? order++ : -1,
        lineBreak: false,
      }
    })
  }

  if (splitType === 'words, chars') {
    let order = 0
    const segments: Segment[] = []

    text.split(/(\s+)/).forEach((part, wordIndex) => {
      if (part.trim().length === 0) {
        segments.push({
          key: `space-${wordIndex}`,
          value: part,
          animate: false,
          order: -1,
          lineBreak: false,
        })
        return
      }

      splitGraphemes(part).forEach((char, charIndex) => {
        segments.push({
          key: `word-${wordIndex}-char-${charIndex}`,
          value: char,
          animate: true,
          order: order++,
          lineBreak: false,
        })
      })
    })

    return segments
  }

  let order = 0
  return splitGraphemes(text).map((char, index) => {
    const animate = char.trim().length > 0
    return {
      key: `char-${index}`,
      value: char,
      animate,
      order: animate ? order++ : -1,
      lineBreak: false,
    }
  })
}

function clampThreshold(value: number) {
  if (Number.isNaN(value))
    return 0.1
  return Math.min(1, Math.max(0, value))
}

function normalizeRootMargin(value: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0)
    return '0px'
  if (trimmed.split(/\s+/).length === 1)
    return `0px 0px ${trimmed} 0px`
  return trimmed
}

function SplitText({
  text,
  className = '',
  delay = 50,
  duration = 1.25,
  ease = 'easeOut',
  splitType = 'chars',
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  threshold = 0.1,
  rootMargin = '-100px',
  tag = 'p',
  textAlign = 'center',
  onLetterAnimationComplete,
}: SplitTextProps) {
  const ref = useRef<HTMLElement | null>(null)
  const callbackRef = useRef(onLetterAnimationComplete)
  const completionRef = useRef<CompletionState>({
    key: '',
    count: 0,
    total: 0,
    done: false,
  })
  const segmentKey = `${splitType}:${text}`
  const [fontsLoaded, setFontsLoaded] = useState(() => {
    if (typeof document === 'undefined')
      return true
    if (!('fonts' in document))
      return true
    return document.fonts.status === 'loaded'
  })
  const [enteredKeys, setEnteredKeys] = useState<Record<string, true>>({})
  const entered = enteredKeys[segmentKey] === true

  useEffect(() => {
    callbackRef.current = onLetterAnimationComplete
  }, [onLetterAnimationComplete])

  useEffect(() => {
    if (typeof document === 'undefined')
      return
    if (!('fonts' in document))
      return
    if (document.fonts.status === 'loaded')
      return

    let active = true
    void document.fonts.ready.then(() => {
      if (active)
        setFontsLoaded(true)
    })

    return () => {
      active = false
    }
  }, [])

  const segments = useMemo(() => createSegments(text, splitType), [text, splitType])
  const animatedCount = useMemo(() => segments.filter(segment => segment.animate).length, [segments])

  useEffect(() => {
    completionRef.current = {
      key: segmentKey,
      count: 0,
      total: animatedCount,
      done: false,
    }
  }, [segmentKey, animatedCount])

  useEffect(() => {
    if (animatedCount !== 0 || !entered || completionRef.current.done)
      return
    completionRef.current.done = true
    callbackRef.current?.()
  }, [animatedCount, entered])

  useEffect(() => {
    if (!fontsLoaded || !ref.current || !text.trim().length || entered)
      return

    const target = ref.current
    const observerOptions: IntersectionObserverInit = {
      threshold: clampThreshold(threshold),
      rootMargin: normalizeRootMargin(rootMargin),
    }

    let observer: IntersectionObserver
    try {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting)
          return
        setEnteredKeys((prev) => {
          if (prev[segmentKey])
            return prev
          return { ...prev, [segmentKey]: true }
        })
        observer.disconnect()
      }, observerOptions)
    }
    catch {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting)
          return
        setEnteredKeys((prev) => {
          if (prev[segmentKey])
            return prev
          return { ...prev, [segmentKey]: true }
        })
        observer.disconnect()
      }, { threshold: clampThreshold(threshold) })
    }

    observer.observe(target)
    return () => observer.disconnect()
  }, [entered, fontsLoaded, rootMargin, segmentKey, text, threshold])

  const onSegmentComplete = () => {
    if (!entered || completionRef.current.done)
      return

    completionRef.current.count += 1
    if (completionRef.current.count < completionRef.current.total)
      return

    completionRef.current.done = true
    callbackRef.current?.()
  }

  const style: CSSProperties = {
    textAlign,
    wordWrap: 'break-word',
    willChange: 'transform, opacity',
  }

  const isInlineContainer = tag === 'span'
  const classes = cn('split-parent overflow-hidden whitespace-normal', isInlineContainer ? 'inline-block' : 'block', className)
  const Tag = tag as ElementType

  return (
    <Tag ref={ref} style={style} className={classes}>
      {segments.map((segment) => {
        if (segment.lineBreak)
          return <br key={segment.key} />

        if (!segment.animate) {
          return (
            <span key={segment.key} style={{ whiteSpace: 'pre' }}>
              {segment.value}
            </span>
          )
        }

        return (
          <motion.span
            key={segment.key}
            initial={from}
            animate={entered ? to : from}
            transition={{
              duration,
              ease,
              delay: (segment.order * delay) / 1000,
            }}
            onAnimationComplete={onSegmentComplete}
            style={{
              display: splitType === 'lines' ? 'block' : 'inline-block',
              whiteSpace: splitType === 'lines' ? 'pre-wrap' : 'pre',
              willChange: 'transform, opacity',
            }}
          >
            {segment.value}
          </motion.span>
        )
      })}
    </Tag>
  )
}

export default SplitText
