import html2canvas from 'html2canvas-pro'
import { jsPDF as JsPdf } from 'jspdf'

const PDF_MARGIN_PT = 24
const DEFAULT_CHART_WAIT_MS = 3000
const FRAME_WAIT_COUNT = 2
const MIN_CHART_SURFACES = 2
const EXPORT_ROOT_ATTR = 'data-export-pdf-root'

export interface ExportResultPdfOptions {
  root: HTMLElement
  title: string
  rid?: string
}

async function sleep(ms: number) {
  await new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function raf() {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

async function waitAnimationFrames(count: number) {
  for (let i = 0; i < count; i += 1)
    await raf()
}

function formatDate(now: Date) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function sanitizeFilename(title: string) {
  let cleaned = ''
  for (const char of title) {
    const code = char.charCodeAt(0)
    cleaned += code >= 32 && code !== 127 ? char : ' '
  }

  const sanitized = cleaned
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (sanitized.length > 80)
    return sanitized.slice(0, 80).trim()
  return sanitized
}

export function buildPdfFilename(title: string, now = new Date()) {
  const safeTitle = sanitizeFilename(title) || 'Untitled'
  return `ScriptAI-${safeTitle}-${formatDate(now)}.pdf`
}

async function waitForFonts() {
  const maybeFonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
  if (maybeFonts?.ready == null)
    return

  await Promise.race([
    maybeFonts.ready.then(() => undefined).catch(() => undefined),
    sleep(2000),
  ])
}

async function waitForCharts(root: HTMLElement, timeoutMs: number) {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    const chartCount = root.querySelectorAll('svg.recharts-surface').length
    if (chartCount >= MIN_CHART_SURFACES)
      return
    await sleep(80)
  }
}

export async function waitForRenderableState(root: HTMLElement) {
  await waitForFonts()
  await waitAnimationFrames(FRAME_WAIT_COUNT)
  await waitForCharts(root, DEFAULT_CHART_WAIT_MS)
  await waitAnimationFrames(1)
}

export async function captureElement(root: HTMLElement) {
  const scale = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1))
  const rect = root.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(rect.width))
  const height = Math.max(1, Math.ceil(root.scrollHeight))

  const applyCloneBaseLayout = (clonedDocument: Document) => {
    const clonedRoot = clonedDocument.querySelector<HTMLElement>(`[${EXPORT_ROOT_ATTR}="1"]`)
    if (clonedRoot == null)
      return null

    // Keep the original report width so the layout does not collapse in clone document.
    clonedRoot.style.setProperty('width', `${width}px`)
    clonedRoot.style.setProperty('min-width', `${width}px`)
    clonedRoot.style.setProperty('max-width', `${width}px`)
    clonedRoot.style.setProperty('margin', '0')
    return clonedRoot
  }

  const renderOptions = {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: Math.max(document.documentElement.clientWidth, width),
    windowHeight: Math.max(document.documentElement.clientHeight, height),
    scrollX: 0,
    scrollY: -window.scrollY,
  } as const

  root.setAttribute(EXPORT_ROOT_ATTR, '1')
  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(root, {
      ...renderOptions,
      onclone: (clonedDocument) => {
        applyCloneBaseLayout(clonedDocument)
      },
    })
  }
  catch (error) {
    if (!isUnsupportedColorError(error))
      throw error

    canvas = await html2canvas(root, {
      ...renderOptions,
      onclone: (clonedDocument) => {
        const clonedRoot = applyCloneBaseLayout(clonedDocument)
        if (clonedRoot == null)
          return
        stripStylesheets(clonedDocument)
        applyComputedStyleFallbacks(root, clonedRoot)
      },
    })
  }
  finally {
    root.removeAttribute(EXPORT_ROOT_ATTR)
  }

  if (canvas.width === 0 || canvas.height === 0)
    throw new Error('Failed to capture non-empty canvas for PDF export.')

  return canvas
}

function isUnsupportedColorError(error: unknown) {
  if (!(error instanceof Error))
    return false

  const message = error.message.toLowerCase()
  return message.includes('unsupported color function')
    || message.includes('"lab"')
    || message.includes('"oklab"')
    || message.includes('color-mix')
}

function applyComputedStyleFallbacks(originalRoot: HTMLElement, clonedRoot: HTMLElement) {
  const originalNodes = [originalRoot, ...originalRoot.querySelectorAll<HTMLElement>('*')]
  const clonedNodes = [clonedRoot, ...clonedRoot.querySelectorAll<HTMLElement>('*')]
  const count = Math.min(originalNodes.length, clonedNodes.length)

  for (let i = 0; i < count; i += 1) {
    const original = originalNodes[i]
    const cloned = clonedNodes[i]
    if (original == null || cloned == null)
      continue

    // Clear inline styles first; some nodes contain color-mix/oklab in style attributes.
    cloned.removeAttribute('style')

    const computed = window.getComputedStyle(original)
    for (let j = 0; j < computed.length; j += 1) {
      const property = computed.item(j)
      if (property.length === 0 || property.startsWith('--'))
        continue

      const value = computed.getPropertyValue(property).trim()
      if (value.length === 0 || hasUnsupportedColorToken(value))
        continue

      const priority = computed.getPropertyPriority(property)
      cloned.style.setProperty(property, value, priority)
    }

    // Avoid parser crashes from advanced shadow/filter color functions.
    cloned.style.setProperty('box-shadow', 'none')
    cloned.style.setProperty('text-shadow', 'none')
    cloned.style.setProperty('filter', 'none')
    cloned.style.setProperty('backdrop-filter', 'none')
    cloned.style.setProperty('animation', 'none')
    cloned.style.setProperty('transition', 'none')
  }
}

function hasUnsupportedColorToken(value: string) {
  const lower = value.toLowerCase()
  return lower.includes('lab(')
    || lower.includes('oklab(')
    || lower.includes('lch(')
    || lower.includes('oklch(')
    || lower.includes('color-mix(')
}

function stripStylesheets(clonedDocument: Document) {
  for (const styleEl of clonedDocument.querySelectorAll('style'))
    styleEl.remove()

  for (const linkEl of clonedDocument.querySelectorAll('link[rel="stylesheet"]'))
    linkEl.remove()
}

export function renderCanvasToA4Pdf(canvas: HTMLCanvasElement) {
  const pdf = new JsPdf({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const contentWidth = pageWidth - PDF_MARGIN_PT * 2
  const contentHeight = pdf.internal.pageSize.getHeight() - PDF_MARGIN_PT * 2
  const pixelsPerPoint = canvas.width / contentWidth
  const pageHeightPx = Math.max(1, Math.floor(contentHeight * pixelsPerPoint))
  const sliceCanvas = document.createElement('canvas')
  const sliceCtx = sliceCanvas.getContext('2d')
  if (sliceCtx == null)
    throw new Error('Failed to initialize PDF slice canvas context.')

  let offsetPx = 0
  let pageIndex = 0
  while (offsetPx < canvas.height) {
    if (pageIndex > 0)
      pdf.addPage()

    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - offsetPx)
    sliceCanvas.width = canvas.width
    sliceCanvas.height = sliceHeightPx
    sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height)
    sliceCtx.drawImage(
      canvas,
      0,
      offsetPx,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      sliceCanvas.width,
      sliceCanvas.height,
    )

    const slicePtHeight = sliceHeightPx / pixelsPerPoint
    const imageData = sliceCanvas.toDataURL('image/jpeg', 0.94)
    pdf.addImage(
      imageData,
      'JPEG',
      PDF_MARGIN_PT,
      PDF_MARGIN_PT,
      contentWidth,
      slicePtHeight,
      undefined,
      'FAST',
    )

    offsetPx += sliceHeightPx
    pageIndex += 1
  }

  return pdf
}

export async function exportResultPdf(options: ExportResultPdfOptions) {
  const { root, title, rid } = options
  const fallbackTitle = rid == null || rid.length === 0 ? title : `${title || 'Untitled'}-${rid.slice(0, 8)}`

  await waitForRenderableState(root)
  const canvas = await captureElement(root)
  const pdf = renderCanvasToA4Pdf(canvas)
  pdf.save(buildPdfFilename(fallbackTitle))
}
