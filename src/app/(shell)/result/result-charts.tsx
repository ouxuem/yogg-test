'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'

export interface ResultChartDatum {
  ep: string
  emotion: number
  conflict: number
  conflictExt: number
  conflictInt: number
  rawEmotion: number
  rawConflict: number
  rawConflictExt: number
  rawConflictInt: number
}

export default function ResultCharts({ chartData }: { chartData: ResultChartDatum[] }) {
  const renderEmotionTooltip = ({ active, payload, label }: { active?: boolean, payload?: Array<{ payload?: ResultChartDatum }>, label?: string }) => {
    if (!active || payload == null || payload.length === 0)
      return null
    const datum = payload[0]?.payload
    if (datum == null)
      return null

    return (
      <div className="bg-background/95 border-border/70 rounded-md border px-3 py-2 text-xs shadow-sm">
        <p className="text-foreground font-medium">{label}</p>
        <p className="text-muted-foreground">
          {`normalized: ${datum.emotion}`}
        </p>
        <p className="text-muted-foreground">
          {`raw count: ${datum.rawEmotion}`}
        </p>
      </div>
    )
  }

  const renderConflictTooltip = ({ active, payload, label }: { active?: boolean, payload?: Array<{ payload?: ResultChartDatum }>, label?: string }) => {
    if (!active || payload == null || payload.length === 0)
      return null
    const datum = payload[0]?.payload
    if (datum == null)
      return null

    return (
      <div className="bg-background/95 border-border/70 rounded-md border px-3 py-2 text-xs shadow-sm">
        <p className="text-foreground font-medium">{label}</p>
        <p className="text-muted-foreground">
          {`normalized total: ${datum.conflict}`}
        </p>
        <p className="text-muted-foreground">
          {`raw total: ${datum.rawConflict}`}
        </p>
        <p className="text-muted-foreground">
          {`raw ext/int: ${datum.rawConflictExt}/${datum.rawConflictInt}`}
        </p>
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
            config={{ emotion: { label: 'Emotion', color: 'var(--chart-1)' } }}
            className="aspect-auto h-[220px] w-full"
          >
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="ep" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis hide domain={[0, 100]} />
                <Tooltip cursor={{ stroke: 'var(--border)' }} content={renderEmotionTooltip} />
                <Area
                  type="monotone"
                  dataKey="emotion"
                  stroke="var(--color-emotion)"
                  fill="color-mix(in oklab, var(--color-emotion) 22%, transparent)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
          <p className="text-muted-foreground mt-3 text-xs leading-5">
            Preview only, relative scale. Hover to view normalized and raw counts.
          </p>
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
                <span className="bg-chart-1 size-2 rounded-full" aria-hidden="true" />
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
              conflictExt: { label: 'Ext', color: 'var(--chart-1)' },
              conflictInt: { label: 'Int', color: 'color-mix(in oklab, var(--muted-foreground) 28%, var(--muted) 72%)' },
            }}
            className="aspect-auto h-[220px] w-full"
          >
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="ep" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: 'color-mix(in oklab, var(--muted) 60%, transparent)' }}
                  content={renderConflictTooltip}
                />
                <Bar dataKey="conflictExt" stackId="conflict" fill="var(--color-conflictExt)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="conflictInt" stackId="conflict" fill="var(--color-conflictInt)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <p className="text-muted-foreground mt-3 text-xs leading-5">
            Preview only, relative scale. Hover to inspect raw ext/int hit counts.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
