'use client'

import React, { useCallback, useEffect, useMemo, useRef } from 'react'

type Dot = {
  cx: number
  cy: number
  x: number
  y: number
  vx: number
  vy: number
}

type PointerState = {
  x: number
  y: number
  vx: number
  vy: number
  lastX: number
  lastY: number
  lastT: number
  active: boolean
}

export interface DotGridProps {
  dotSize?: number
  gap?: number
  baseColor?: string
  activeColor?: string
  proximity?: number
  pushStrength?: number
  velocityInfluence?: number
  shockRadius?: number
  shockStrength?: number
  damping?: number
  spring?: number
  opacity?: number
  blur?: number
  maxDots?: number
  fps?: number
  className?: string
  style?: React.CSSProperties
}

function hexToRgb01(hex: string): [number, number, number] {
  let value = hex.trim()
  if (value.startsWith('#')) value = value.slice(1)
  if (value.length === 3) value = value.split('').map(x => x + x).join('')
  const n = Number.parseInt(value, 16)
  if (Number.isNaN(n) || (value.length !== 6 && value.length !== 8)) return [1, 1, 1]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function cssColorToRgb01(color: string): [number, number, number] {
  if (!color) return [1, 1, 1]
  const input = color.trim()
  if (input.startsWith('#')) return hexToRgb01(input)
  if (typeof window === 'undefined') return [1, 1, 1]

  const probe = document.createElement('span')
  probe.style.color = 'rgb(255,255,255)'
  probe.style.color = input
  probe.style.position = 'absolute'
  probe.style.opacity = '0'
  probe.style.pointerEvents = 'none'
  probe.style.left = '-9999px'
  document.body.appendChild(probe)
  const parsed = getComputedStyle(probe).color
  document.body.removeChild(probe)

  const m = parsed.match(/rgba?\(([^)]+)\)/)
  if (!m) return [1, 1, 1]
  const parts = m[1].split(',').map(x => Number(x.trim()))
  return [
    Math.max(0, Math.min(255, parts[0] ?? 255)) / 255,
    Math.max(0, Math.min(255, parts[1] ?? 255)) / 255,
    Math.max(0, Math.min(255, parts[2] ?? 255)) / 255,
  ]
}

export default function DotGrid({
  dotSize = 1.5,
  gap = 7.5,
  baseColor = 'var(--border)',
  activeColor = 'var(--muted-foreground)',
  proximity = 170,
  pushStrength = 0.08,
  velocityInfluence = 0.015,
  shockRadius = 180,
  shockStrength = 1.4,
  damping = 0.9,
  spring = 0.05,
  opacity = 0.42,
  blur = 1.1,
  maxDots = 3200,
  fps = 30,
  className = '',
  style,
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotsRef = useRef<Dot[]>([])
  const pointerRef = useRef<PointerState>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    active: false,
  })
  const lastFrameRef = useRef(0)

  const baseRgbRef = useRef<[number, number, number]>([1, 1, 1])
  const activeRgbRef = useRef<[number, number, number]>([1, 1, 1])

  const circle = useMemo(() => {
    if (typeof window === 'undefined') return null
    const path = new Path2D()
    path.arc(0, 0, dotSize / 2, 0, Math.PI * 2)
    return path
  }, [dotSize])

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const rect = wrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const baseCell = dotSize + gap
    let cell = baseCell
    let cols = Math.floor((rect.width + gap) / cell)
    let rows = Math.floor((rect.height + gap) / cell)
    const total = cols * rows
    if (total > maxDots) {
      const scale = Math.sqrt(total / maxDots)
      cell = baseCell * scale
      cols = Math.max(1, Math.floor((rect.width + gap) / cell))
      rows = Math.max(1, Math.floor((rect.height + gap) / cell))
    }
    const effectiveGap = Math.max(0, cell - dotSize)
    const gridW = cols * cell - effectiveGap
    const gridH = rows * cell - effectiveGap
    const startX = (rect.width - gridW) / 2 + dotSize / 2
    const startY = (rect.height - gridH) / 2 + dotSize / 2

    const nextDots: Dot[] = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        nextDots.push({
          cx: startX + x * cell,
          cy: startY + y * cell,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
        })
      }
    }
    dotsRef.current = nextDots
  }, [dotSize, gap, maxDots])

  useEffect(() => {
    if (!wrapperRef.current) return
    const styles = getComputedStyle(wrapperRef.current)
    const readCssVar = (value: string) => {
      const m = value.match(/var\((--[^,)]+)/)
      return m ? styles.getPropertyValue(m[1]).trim() : value
    }
    baseRgbRef.current = cssColorToRgb01(readCssVar(baseColor))
    activeRgbRef.current = cssColorToRgb01(readCssVar(activeColor))
  }, [baseColor, activeColor])

  useEffect(() => {
    if (!circle) return
    let raf = 0
    const frameInterval = 1000 / Math.max(1, fps)
    const step = (now: number) => {
      if (now - lastFrameRef.current < frameInterval) {
        raf = requestAnimationFrame(step)
        return
      }
      lastFrameRef.current = now

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const pointer = pointerRef.current
      const prox2 = proximity * proximity
      const [br, bg, bb] = baseRgbRef.current
      const [ar, ag, ab] = activeRgbRef.current

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = opacity

      for (const dot of dotsRef.current) {
        const dx = dot.cx - pointer.x
        const dy = dot.cy - pointer.y
        const d2 = dx * dx + dy * dy

        if (pointer.active && d2 < prox2) {
          const d = Math.sqrt(Math.max(1e-6, d2))
          const influence = 1 - d / proximity
          const push = influence * influence * pushStrength
          dot.vx += (dx / d) * push + pointer.vx * velocityInfluence * influence
          dot.vy += (dy / d) * push + pointer.vy * velocityInfluence * influence
        }

        dot.vx += -dot.x * spring
        dot.vy += -dot.y * spring
        dot.vx *= damping
        dot.vy *= damping
        dot.x += dot.vx
        dot.y += dot.vy

        let r = br
        let g = bg
        let b = bb
        if (d2 < prox2) {
          const t = 1 - Math.sqrt(d2) / proximity
          r = br + (ar - br) * t
          g = bg + (ag - bg) * t
          b = bb + (ab - bb) * t
        }

        ctx.save()
        ctx.translate(dot.cx + dot.x, dot.cy + dot.y)
        ctx.fillStyle = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`
        ctx.fill(circle)
        ctx.restore()
      }

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [circle, proximity, pushStrength, velocityInfluence, damping, spring, opacity, fps])

  useEffect(() => {
    buildGrid()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(buildGrid)
      if (wrapperRef.current) ro.observe(wrapperRef.current)
    } else {
      globalThis.addEventListener('resize', buildGrid)
    }
    return () => {
      ro?.disconnect()
      if (!ro) globalThis.removeEventListener('resize', buildGrid)
    }
  }, [buildGrid])

  useEffect(() => {
    const updatePointer = (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const pointer = pointerRef.current
      const now = performance.now()
      const dt = Math.max(8, now - pointer.lastT)
      const nx = clientX - rect.left
      const ny = clientY - rect.top
      pointer.vx = (nx - pointer.lastX) / dt
      pointer.vy = (ny - pointer.lastY) / dt
      pointer.x = nx
      pointer.y = ny
      pointer.lastX = nx
      pointer.lastY = ny
      pointer.lastT = now
      pointer.active = true
    }

    const onMove = (event: PointerEvent) => updatePointer(event.clientX, event.clientY)
    const onLeave = () => {
      pointerRef.current.active = false
      pointerRef.current.vx = 0
      pointerRef.current.vy = 0
    }
    const onShock = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top
      for (const dot of dotsRef.current) {
        const dx = dot.cx - cx
        const dy = dot.cy - cy
        const dist = Math.hypot(dx, dy)
        if (dist > shockRadius || dist < 1e-6) continue
        const falloff = 1 - dist / shockRadius
        const force = shockStrength * falloff
        dot.vx += (dx / dist) * force
        dot.vy += (dy / dist) * force
      }
    }

    globalThis.addEventListener('pointermove', onMove, { passive: true })
    globalThis.addEventListener('pointerleave', onLeave)
    globalThis.addEventListener('pointerdown', onShock)
    return () => {
      globalThis.removeEventListener('pointermove', onMove)
      globalThis.removeEventListener('pointerleave', onLeave)
      globalThis.removeEventListener('pointerdown', onShock)
    }
  }, [shockRadius, shockStrength])

  return (
    <section className={`pointer-events-none relative h-full w-full ${className}`} style={style}>
      <div ref={wrapperRef} className="relative h-full w-full">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ filter: `blur(${blur}px)` }}
        />
      </div>
    </section>
  )
}
