const CJK_CHAR_REGEX = /[\u3400-\u9FFF\uF900-\uFAFF]/

export function containsCjk(text: string) {
  return CJK_CHAR_REGEX.test(text)
}

export function assertEnglishStructuredOutput(value: unknown, allowFields: string[] = []) {
  const allowSet = new Set(allowFields)
  walk(value, '$', allowSet)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function walk(value: unknown, path: string, allowSet: Set<string>) {
  if (typeof value === 'string') {
    if (!isAllowedPath(path, allowSet) && containsCjk(value))
      throw new Error(`Non-English text detected at ${path}.`)
    return
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++)
      walk(value[index], `${path}[${index}]`, allowSet)
    return
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value))
      walk(child, `${path}.${key}`, allowSet)
  }
}

function isAllowedPath(path: string, allowSet: Set<string>) {
  if (allowSet.size === 0)
    return false
  if (allowSet.has(path))
    return true
  const lastDot = path.lastIndexOf('.')
  if (lastDot < 0)
    return false
  const key = path.slice(lastDot + 1)
  return allowSet.has(key)
}
