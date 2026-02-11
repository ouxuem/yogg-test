'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'

interface EmotionSeriesPoint {
  episode: number
  value: number
}

interface EmotionAnchorPoint {
  slot: 'Start' | 'Mid' | 'End'
  episode: number
  value: number
}

interface ConflictPhasePoint {
  phase: 'Start' | 'Inc.' | 'Rise' | 'Climax' | 'Fall' | 'Res.'
  ext: number
  int: number
}

interface ResultChartsProps {
  emotion: {
    series: EmotionSeriesPoint[]
    anchors: EmotionAnchorPoint[]
    caption: string
  }
  conflict: {
    phases: ConflictPhasePoint[]
    caption: string
  }
}

interface EmotionChartDatum {
  episode: number
  epLabel: string
  value: number
}

interface ConflictChartDatum {
  phase: ConflictPhasePoint['phase']
  ext: number
  int: number
}

function pickSparseEmotionTicks(data: EmotionChartDatum[]): string[] {
  const count = data.length
  if (count === 0)
    return []

  if (count === 1) {
    const first = data[0]
    if (first == null)
      return []
    return [first.epLabel]
  }

  if (count === 2) {
    const first = data[0]
    const second = data[1]
    if (first == null)
      return []
    if (second == null)
      return [first.epLabel]
    return [first.epLabel, second.epLabel]
  }

  if (count === 3) {
    const middle = data[1]
    if (middle == null)
      return []
    return [middle.epLabel]
  }

  if (count === 4) {
    const second = data[1]
    const third = data[2]
    if (second == null)
      return []
    if (third == null)
      return [second.epLabel]
    return [second.epLabel, third.epLabel]
  }

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const maxIndex = count - 1
  const rawIndices = [
    Math.round((1 * maxIndex) / 4),
    Math.round((2 * maxIndex) / 4),
    Math.round((3 * maxIndex) / 4),
  ]
  const interiorIndices = [...new Set(rawIndices.map(index => clamp(index, 1, count - 2)))]
    .sort((a, b) => a - b)

  const ticks: string[] = []
  for (const index of interiorIndices) {
    const point = data[index]
    if (point != null)
      ticks.push(point.epLabel)
  }
  return ticks
}

export default function ResultCharts({ emotion, conflict }: ResultChartsProps) {
  const emotionData: EmotionChartDatum[] = emotion.series.map(item => ({
    episode: item.episode,
    epLabel: `Ep ${String(item.episode).padStart(2, '0')}`,
    value: item.value,
  }))
  const emotionTicks = pickSparseEmotionTicks(emotionData)

  const anchorByEpisode = new Map(
    emotion.anchors.map(anchor => [anchor.episode, anchor.slot]),
  )

  const conflictData: ConflictChartDatum[] = conflict.phases.map(item => ({
    phase: item.phase,
    ext: item.ext,
    int: item.int,
  }))

  const renderEmotionTooltip = ({ active, payload, label }: { active?: boolean, payload?: Array<{ payload?: EmotionChartDatum }>, label?: string }) => {
    if (!active || payload == null || payload.length === 0)
      return null
    const datum = payload[0]?.payload
    if (datum == null)
      return null

    const anchor = anchorByEpisode.get(datum.episode)

    return (
      <div className="bg-background/95 border-border/70 rounded-md border px-3 py-2 text-xs shadow-sm">
        <p className="text-foreground font-medium">{label}</p>
        <p className="text-muted-foreground">{`intensity: ${datum.value}`}</p>
        {anchor != null && (
          <p className="text-primary">{`anchor: ${anchor}`}</p>
        )}
      </div>
    )
  }

  const renderConflictTooltip = ({ active, payload, label }: { active?: boolean, payload?: Array<{ payload?: ConflictChartDatum }>, label?: string }) => {
    if (!active || payload == null || payload.length === 0)
      return null
    const datum = payload[0]?.payload
    if (datum == null)
      return null

    return (
      <div className="bg-background/95 border-border/70 rounded-md border px-3 py-2 text-xs shadow-sm">
        <p className="text-foreground font-medium">{label}</p>
        <p className="text-muted-foreground">{`Ext: ${datum.ext}`}</p>
        <p className="text-muted-foreground">{`Int: ${datum.int}`}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 pt-6 lg:grid-cols-2">
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-xs font-semibold tracking-[0.7px] uppercase">
              Emotional intensity
            </p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.25px]">
              Episode breakdown
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ emotion: { label: 'Emotion', color: 'var(--chart-4)' } }}
            className="aspect-auto h-[220px] w-full"
          >
            <ResponsiveContainer>
              <AreaChart data={emotionData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="epLabel"
                  ticks={emotionTicks}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  padding={{ left: 12, right: 12 }}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip cursor={{ stroke: 'var(--border)' }} content={renderEmotionTooltip} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-emotion)"
                  fill="color-mix(in oklab, var(--color-emotion) 22%, transparent)"
                  strokeWidth={2}
                />
                {emotion.anchors.map(anchor => (
                  <ReferenceDot
                    key={`${anchor.slot}-${anchor.episode}`}
                    x={`Ep ${String(anchor.episode).padStart(2, '0')}`}
                    y={anchor.value}
                    r={6}
                    fill="var(--background)"
                    stroke="var(--color-emotion)"
                    strokeWidth={3}
                    ifOverflow="visible"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
          <p className="text-muted-foreground mt-3 text-xs leading-5">{emotion.caption}</p>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-xs font-semibold tracking-[0.7px] uppercase">
              Conflict frequency
            </p>
            <div className="flex items-center gap-4">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span className="bg-chart-4 size-2 rounded-full" aria-hidden="true" />
                <span>Ext</span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span
                  className="size-2 rounded-full bg-[color-mix(in_oklab,var(--muted-foreground)_28%,var(--muted)_72%)]"
                  aria-hidden="true"
                />
                <span>Int</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              ext: { label: 'Ext', color: 'var(--chart-4)' },
              int: { label: 'Int', color: 'color-mix(in oklab, var(--muted-foreground) 28%, var(--muted) 72%)' },
            }}
            className="aspect-auto h-[220px] w-full"
          >
            <ResponsiveContainer>
              <BarChart data={conflictData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="phase" tickLine={false} axisLine={false} interval={0} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: 'color-mix(in oklab, var(--muted) 60%, transparent)' }}
                  content={renderConflictTooltip}
                />
                <Bar dataKey="ext" stackId="conflict" fill="var(--color-ext)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="int" stackId="conflict" fill="var(--color-int)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <p className="text-muted-foreground mt-3 text-xs leading-5">{conflict.caption}</p>
        </CardContent>
      </Card>
    </div>
  )
}
