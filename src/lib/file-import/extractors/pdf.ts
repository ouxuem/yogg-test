interface PdfTextLike {
  str?: string
  hasEOL?: boolean
  transform?: number[]
  width?: number
}

let workerConfigured = false
let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function loadPdfJs() {
  if (pdfJsPromise == null)
    pdfJsPromise = import('pdfjs-dist')
  return pdfJsPromise
}

function ensurePdfWorker(pdfJs: typeof import('pdfjs-dist')) {
  if (workerConfigured)
    return
  pdfJs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  workerConfigured = true
}

function isPdfTextLike(value: unknown): value is PdfTextLike {
  if (value == null || typeof value !== 'object')
    return false
  return 'str' in value
}

function isAsciiAlphaNumeric(char: string | undefined) {
  return char != null && /[a-z0-9]/i.test(char)
}

function isCjk(char: string | undefined) {
  return char != null && /[\u4E00-\u9FFF]/.test(char)
}

function xPos(item: PdfTextLike) {
  const transform = item.transform
  if (!Array.isArray(transform))
    return null
  const value = transform[4]
  return typeof value === 'number' ? value : null
}

function yPos(item: PdfTextLike) {
  const transform = item.transform
  if (!Array.isArray(transform))
    return null
  const value = transform[5]
  return typeof value === 'number' ? value : null
}

function isLineBreak(prev: PdfTextLike, next: PdfTextLike) {
  const prevY = yPos(prev)
  const nextY = yPos(next)
  if (prevY == null || nextY == null)
    return false
  return Math.abs(prevY - nextY) > 2
}

function shouldInsertSpaceByGap(prev: PdfTextLike, next: PdfTextLike) {
  const prevX = xPos(prev)
  const nextX = xPos(next)
  const prevWidth = typeof prev.width === 'number' ? prev.width : null
  const prevText = prev.str ?? ''
  if (prevX == null || nextX == null || prevWidth == null || prevText.length === 0)
    return null

  const prevEnd = prevX + prevWidth
  const gap = nextX - prevEnd
  const avgCharWidth = prevWidth / Math.max(1, prevText.length)
  const threshold = Math.max(0.6, avgCharWidth * 0.35)
  return gap > threshold
}

function shouldAttachWithoutSpace(prevText: string, nextText: string) {
  const left = prevText.trimEnd()
  const right = nextText.trimStart()
  if (left.length === 0 || right.length === 0)
    return true

  const leftLast = left[left.length - 1]
  const rightFirst = right[0]
  if (leftLast == null || rightFirst == null)
    return true

  if (/[([{'"`/\\-]/.test(leftLast))
    return true
  if (/[)\]},.:;!?%]/.test(rightFirst))
    return true
  if (isCjk(leftLast) && isCjk(rightFirst))
    return true
  return false
}

function shouldInsertFallbackSpace(prevText: string, nextText: string) {
  const left = prevText.trimEnd()
  const right = nextText.trimStart()
  if (left.length === 0 || right.length === 0)
    return false

  const leftLast = left[left.length - 1]
  const rightFirst = right[0]
  if (leftLast == null || rightFirst == null)
    return false

  return isAsciiAlphaNumeric(leftLast) && isAsciiAlphaNumeric(rightFirst)
}

function separatorBetween(prev: PdfTextLike, next: PdfTextLike) {
  const prevText = prev.str ?? ''
  const nextText = next.str ?? ''

  if (prevText.endsWith(' ') || /^\s/.test(nextText))
    return ''

  if (prev.hasEOL || isLineBreak(prev, next))
    return '\n'

  if (shouldAttachWithoutSpace(prevText, nextText))
    return ''

  const gapHint = shouldInsertSpaceByGap(prev, next)
  if (gapHint === true)
    return ' '
  if (gapHint === false)
    return ''

  return shouldInsertFallbackSpace(prevText, nextText) ? ' ' : ''
}

function compactPageText(raw: string) {
  return raw
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function buildPageText(items: unknown[]) {
  const chunks: string[] = []
  let previous: PdfTextLike | null = null

  for (const item of items) {
    if (!isPdfTextLike(item))
      continue

    const text = (item.str ?? '').replaceAll('\0', '')
    if (text.length === 0)
      continue

    if (previous != null) {
      const sep = separatorBetween(previous, item)
      if (sep.length > 0)
        chunks.push(sep)
    }

    chunks.push(text)

    if (item.hasEOL === true)
      chunks.push('\n')

    previous = item
  }

  return compactPageText(chunks.join(''))
}

export async function extractPdfFile(file: File) {
  if (typeof window === 'undefined')
    throw new Error('PDF extraction only runs in browser.')

  const pdfJs = await loadPdfJs()
  ensurePdfWorker(pdfJs)

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfJs.getDocument({ data })
  const pdf = await loadingTask.promise

  try {
    const pageTexts: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const line = buildPageText(textContent.items)

      if (line.length > 0)
        pageTexts.push(line)
    }

    return pageTexts.join('\n\n')
  }
  finally {
    await pdf.destroy()
  }
}
