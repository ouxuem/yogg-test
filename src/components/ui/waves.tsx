'use client'

import React, { CSSProperties, useEffect, useRef } from 'react'

class Grad {
  constructor(
    public x: number,
    public y: number,
    public z: number,
  ) {}

  dot2(x: number, y: number) {
    return this.x * x + this.y * y
  }
}

class Noise {
  private grad3 = [
    new Grad(1, 1, 0),
    new Grad(-1, 1, 0),
    new Grad(1, -1, 0),
    new Grad(-1, -1, 0),
    new Grad(1, 0, 1),
    new Grad(-1, 0, 1),
    new Grad(1, 0, -1),
    new Grad(-1, 0, -1),
    new Grad(0, 1, 1),
    new Grad(0, -1, 1),
    new Grad(0, 1, -1),
    new Grad(0, -1, -1),
  ]

  private p = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
    36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120,
    234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
    88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71,
    134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133,
    230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161,
    1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116,
    188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124,
    123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16,
    58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163,
    70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110,
    79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193,
    238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107,
    49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45,
    127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128,
    195, 78, 66, 215, 61, 156, 180,
  ]

  private perm = new Array<number>(512)
  private gradP = new Array<Grad>(512)

  constructor(seed = 0) {
    this.seed(seed)
  }

  seed(seed: number) {
    if (seed > 0 && seed < 1) seed *= 65536
    seed = Math.floor(seed)
    if (seed < 256) seed |= seed << 8

    for (let i = 0; i < 256; i++) {
      const value =
        i & 1 ? this.p[i] ^ (seed & 255) : this.p[i] ^ ((seed >> 8) & 255)
      this.perm[i] = this.perm[i + 256] = value
      this.gradP[i] = this.gradP[i + 256] = this.grad3[value % 12]
    }
  }

  private fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  private lerp(a: number, b: number, t: number) {
    return (1 - t) * a + t * b
  }

  perlin2(x: number, y: number) {
    let X = Math.floor(x)
    let Y = Math.floor(y)

    x -= X
    y -= Y
    X &= 255
    Y &= 255

    const n00 = this.gradP[X + this.perm[Y]].dot2(x, y)
    const n01 = this.gradP[X + this.perm[Y + 1]].dot2(x, y - 1)
    const n10 = this.gradP[X + 1 + this.perm[Y]].dot2(x - 1, y)
    const n11 = this.gradP[X + 1 + this.perm[Y + 1]].dot2(x - 1, y - 1)
    const u = this.fade(x)

    return this.lerp(this.lerp(n00, n10, u), this.lerp(n01, n11, u), this.fade(y))
  }
}

type Point = {
  x: number
  y: number
  wave: { x: number; y: number }
  cursor: { x: number; y: number; vx: number; vy: number }
}

type MouseState = {
  x: number
  y: number
  lx: number
  ly: number
  sx: number
  sy: number
  v: number
  vs: number
  a: number
  set: boolean
}

type Config = {
  lineColor: string
  lineOpacity: number
  lineWidth: number
  waveSpeedX: number
  waveSpeedY: number
  waveAmpX: number
  waveAmpY: number
  friction: number
  tension: number
  maxCursorMove: number
  xGap: number
  yGap: number
  cursorInfluence: number
  cursorRadius: number
  cursorStrength: number
}

export interface WavesProps {
  lineColor?: string
  lineOpacity?: number
  backgroundColor?: string
  lineWidth?: number
  waveSpeedX?: number
  waveSpeedY?: number
  waveAmpX?: number
  waveAmpY?: number
  xGap?: number
  yGap?: number
  friction?: number
  tension?: number
  maxCursorMove?: number
  cursorInfluence?: number
  cursorRadius?: number
  cursorStrength?: number
  showCursorDot?: boolean
  style?: CSSProperties
  className?: string
}

const Waves: React.FC<WavesProps> = ({
  lineColor = 'var(--foreground)',
  lineOpacity = 0.12,
  backgroundColor = 'transparent',
  lineWidth = 1,
  waveSpeedX = 0.008,
  waveSpeedY = 0.003,
  waveAmpX = 18,
  waveAmpY = 8,
  xGap = 14,
  yGap = 28,
  friction = 0.92,
  tension = 0.005,
  maxCursorMove = 40,
  cursorInfluence = 0.5,
  cursorRadius = 220,
  cursorStrength = 1.1,
  showCursorDot = false,
  style,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const frameRef = useRef<number | null>(null)
  const noiseRef = useRef(new Noise(Math.random()))
  const linesRef = useRef<Point[][]>([])
  const mouseRef = useRef<MouseState>({
    x: -10,
    y: 0,
    lx: 0,
    ly: 0,
    sx: 0,
    sy: 0,
    v: 0,
    vs: 0,
    a: 0,
    set: false,
  })
  const boundsRef = useRef({ width: 0, height: 0, left: 0, top: 0, dpr: 1 })
  const configRef = useRef<Config>({
    lineColor,
    lineOpacity,
    lineWidth,
    waveSpeedX,
    waveSpeedY,
    waveAmpX,
    waveAmpY,
    friction,
    tension,
    maxCursorMove,
    xGap,
    yGap,
    cursorInfluence,
    cursorRadius,
    cursorStrength,
  })

  useEffect(() => {
    configRef.current = {
      lineColor,
      lineOpacity,
      lineWidth,
      waveSpeedX,
      waveSpeedY,
      waveAmpX,
      waveAmpY,
      friction,
      tension,
      maxCursorMove,
      xGap,
      yGap,
      cursorInfluence,
      cursorRadius,
      cursorStrength,
    }
  }, [
    lineColor,
    lineOpacity,
    lineWidth,
    waveSpeedX,
    waveSpeedY,
    waveAmpX,
    waveAmpY,
    friction,
    tension,
    maxCursorMove,
    xGap,
    yGap,
    cursorInfluence,
    cursorRadius,
    cursorStrength,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    ctxRef.current = canvas.getContext('2d')

    const setSize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      boundsRef.current = {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        dpr,
      }

      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctxRef.current?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const setLines = () => {
      const { width, height } = boundsRef.current
      const { xGap, yGap } = configRef.current
      linesRef.current = []

      const paddedWidth = width + 180
      const paddedHeight = height + 24
      const totalLines = Math.ceil(paddedWidth / xGap)
      const totalPoints = Math.ceil(paddedHeight / yGap)
      const xStart = (width - xGap * totalLines) / 2
      const yStart = (height - yGap * totalPoints) / 2

      for (let i = 0; i <= totalLines; i++) {
        const points: Point[] = []
        for (let j = 0; j <= totalPoints; j++) {
          points.push({
            x: xStart + xGap * i,
            y: yStart + yGap * j,
            wave: { x: 0, y: 0 },
            cursor: { x: 0, y: 0, vx: 0, vy: 0 },
          })
        }
        linesRef.current.push(points)
      }
    }

    const moved = (point: Point, withCursor = true) => ({
      x: point.x + point.wave.x + (withCursor ? point.cursor.x : 0),
      y: point.y + point.wave.y + (withCursor ? point.cursor.y : 0),
    })

    const movePoints = (time: number) => {
      const mouse = mouseRef.current
      const noise = noiseRef.current
      const {
        waveSpeedX,
        waveSpeedY,
        waveAmpX,
        waveAmpY,
        friction,
        tension,
        maxCursorMove,
        cursorInfluence,
        cursorRadius,
        cursorStrength,
      } = configRef.current

      for (const points of linesRef.current) {
        for (const p of points) {
          const n = noise.perlin2(
            (p.x + time * waveSpeedX) * 0.002,
            (p.y + time * waveSpeedY) * 0.0015,
          )
          const angle = n * 9
          p.wave.x = Math.cos(angle) * waveAmpX
          p.wave.y = Math.sin(angle) * waveAmpY

          const dx = p.x - mouse.sx
          const dy = p.y - mouse.sy
          const distance = Math.hypot(dx, dy)
          const radius = cursorRadius + mouse.vs * 0.7
          const motion = mouse.vs

          if (distance < radius) {
            const strength = 1 - distance / radius
            const force = Math.cos(distance * 0.01) * strength
            p.cursor.vx +=
              Math.cos(mouse.a) *
              force *
              radius *
              motion *
              0.00075 *
              cursorInfluence *
              cursorStrength
            p.cursor.vy +=
              Math.sin(mouse.a) *
              force *
              radius *
              motion *
              0.00075 *
              cursorInfluence *
              cursorStrength
          }

          const restBoost = mouse.vs < 0.6 ? 0.014 : 0
          const decay = mouse.vs < 0.6 ? Math.max(0.82, friction - 0.08) : friction
          p.cursor.vx += (0 - p.cursor.x) * (tension + restBoost)
          p.cursor.vy += (0 - p.cursor.y) * (tension + restBoost)
          p.cursor.vx *= decay
          p.cursor.vy *= decay
          p.cursor.x += p.cursor.vx * 2
          p.cursor.y += p.cursor.vy * 2
          p.cursor.x = Math.min(maxCursorMove, Math.max(-maxCursorMove, p.cursor.x))
          p.cursor.y = Math.min(maxCursorMove, Math.max(-maxCursorMove, p.cursor.y))
        }
      }
    }

    const drawLines = () => {
      const ctx = ctxRef.current
      const { width, height } = boundsRef.current
      if (!ctx) return

      ctx.clearRect(0, 0, width, height)
      ctx.beginPath()
      const styles = getComputedStyle(container)
      const lineColorVarMatch = configRef.current.lineColor.match(/var\((--[^,)]+)/)
      const resolvedColor = lineColorVarMatch
        ? styles.getPropertyValue(lineColorVarMatch[1]).trim() || 'rgba(52, 74, 63, 1)'
        : configRef.current.lineColor
      ctx.strokeStyle = resolvedColor
      ctx.globalAlpha = configRef.current.lineOpacity
      ctx.lineWidth = configRef.current.lineWidth

      for (const points of linesRef.current) {
        const first = moved(points[0], false)
        ctx.moveTo(first.x, first.y)

        for (let i = 0; i < points.length; i++) {
          const isLast = i === points.length - 1
          const p1 = moved(points[i], !isLast)
          const p2 = moved(points[i + 1] ?? points[points.length - 1], !isLast)
          ctx.lineTo(p1.x, p1.y)
          if (isLast) ctx.moveTo(p2.x, p2.y)
        }
      }

      ctx.stroke()
      ctx.globalAlpha = 1
    }

    const tick = (time: number) => {
      const mouse = mouseRef.current
      mouse.sx += (mouse.x - mouse.sx) * 0.14
      mouse.sy += (mouse.y - mouse.sy) * 0.14
      const dx = mouse.x - mouse.lx
      const dy = mouse.y - mouse.ly
      const speed = Math.hypot(dx, dy)
      mouse.v = speed
      mouse.vs += (speed - mouse.vs) * 0.1
      mouse.vs = Math.min(100, mouse.vs)
      mouse.lx = mouse.x
      mouse.ly = mouse.y
      mouse.a = Math.atan2(dy, dx)

      container.style.setProperty('--x', `${mouse.sx}px`)
      container.style.setProperty('--y', `${mouse.sy}px`)

      movePoints(time)
      drawLines()
      frameRef.current = requestAnimationFrame(tick)
    }

    const updateMouse = (x: number, y: number) => {
      const mouse = mouseRef.current
      const bounds = boundsRef.current
      mouse.x = x - bounds.left
      mouse.y = y - bounds.top
      if (!mouse.set) {
        mouse.sx = mouse.x
        mouse.sy = mouse.y
        mouse.lx = mouse.x
        mouse.ly = mouse.y
        mouse.set = true
      }
    }

    const onResize = () => {
      setSize()
      setLines()
    }

    const onMouseMove = (event: MouseEvent) => {
      updateMouse(event.clientX, event.clientY)
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      updateMouse(touch.clientX, touch.clientY)
    }

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        onResize()
      })
      resizeObserver.observe(container)
    }

    setSize()
    setLines()
    frameRef.current = requestAnimationFrame(tick)

    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove, { passive: true })

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ backgroundColor, ...style }}
      className={`pointer-events-none absolute inset-0 h-full w-full overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {showCursorDot && (
        <div
          className="absolute left-0 top-0 h-2 w-2 rounded-full bg-[#160000]/90"
          style={{
            transform: 'translate3d(calc(var(--x) - 50%), calc(var(--y) - 50%), 0)',
            willChange: 'transform',
          }}
        />
      )}
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}

export default Waves
