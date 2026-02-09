export function normalizeRid(value: string | null | undefined): string | null {
  if (value == null)
    return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolveRunTitle(rawTitle: unknown, fallback = 'Untitled') {
  if (typeof rawTitle !== 'string')
    return fallback
  const trimmed = rawTitle.trim()
  return trimmed.length > 0 ? trimmed : fallback
}
