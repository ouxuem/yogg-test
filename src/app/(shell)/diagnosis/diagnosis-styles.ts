export type EpisodeState = 'optimal' | 'issue' | 'neutral' | 'empty'

export function stateStyles(state: EpisodeState) {
  if (state === 'optimal') {
    const accent = 'var(--chart-4)'
    return {
      backgroundColor: `color-mix(in oklab, ${accent} 12%, var(--background))`,
      borderColor: 'transparent',
      color: `color-mix(in oklab, ${accent} 85%, var(--foreground))`,
    }
  }

  if (state === 'issue') {
    const accent = 'var(--destructive)'
    return {
      backgroundColor: `color-mix(in oklab, ${accent} 10%, var(--background))`,
      borderColor: `color-mix(in oklab, ${accent} 40%, var(--border))`,
      color: `color-mix(in oklab, ${accent} 80%, var(--foreground))`,
    }
  }

  if (state === 'empty') {
    return {
      backgroundColor: `color-mix(in oklab, var(--muted) 35%, var(--background))`,
      borderColor: `color-mix(in oklab, var(--border) 70%, transparent)`,
      color: `color-mix(in oklab, var(--muted-foreground) 65%, var(--foreground))`,
    }
  }

  return {
    backgroundColor: `color-mix(in oklab, var(--muted) 25%, var(--background))`,
    borderColor: `color-mix(in oklab, var(--muted-foreground) 25%, var(--border))`,
    color: `color-mix(in oklab, var(--muted-foreground) 75%, var(--foreground))`,
  }
}
