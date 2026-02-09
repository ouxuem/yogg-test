export function normalizeExtractedText(raw: string) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replaceAll('\0', '')
    .trim()
}
