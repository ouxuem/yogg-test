export type EpisodeState = 'optimal' | 'issue' | 'neutral' | 'empty'

export function stateStyles(state: EpisodeState) {
  if (state === 'optimal') {
    const accent = 'var(--chart-4)'
    return {
      backgroundColor: `color-mix(in oklab, ${accent} 10%, var(--background))`,
      borderColor: `color-mix(in oklab, ${accent} 26%, var(--border))`,
      color: `color-mix(in oklab, ${accent} 82%, var(--foreground))`,
    }
  }

  if (state === 'issue') {
    const accent = 'var(--chart-3)'
    return {
      backgroundColor: `color-mix(in oklab, ${accent} 11%, var(--background))`,
      borderColor: `color-mix(in oklab, ${accent} 30%, var(--border))`,
      color: `color-mix(in oklab, ${accent} 74%, var(--foreground))`,
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
    backgroundColor: `color-mix(in oklab, var(--background) 96%, var(--muted) 4%)`,
    borderColor: `color-mix(in oklab, var(--border) 65%, transparent)`,
    color: `color-mix(in oklab, var(--muted-foreground) 65%, var(--foreground))`,
  }
}
