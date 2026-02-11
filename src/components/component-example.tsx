'use client'

import type { ChangeEvent } from 'react'
import { RiFileTextLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import GlobalLoading from '@/components/ui/global-loading'
import SplitText from '@/components/ui/split-text'
import { Textarea } from '@/components/ui/textarea'
import { createRid } from '@/lib/analysis/run-store'
import { getStreamSessionSnapshot, startStreamSession, subscribeStreamSession } from '@/lib/analysis/stream-session'
import { IMPORT_FILE_ACCEPT } from '@/lib/file-import/extract-text'
import { isRecord } from '@/lib/type-guards'

const creativeTextureSrc = '/assets/creative-space-texture.png'
const PREFLIGHT_ERRORS_KEY = 'sdicap:preflight_errors'
const DEFAULT_SCORE_API_ORIGIN = 'https://worker.1143434456qq.workers.dev'
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt']
const ALLOWED_FILE_MIME_TYPES = ['application/pdf', 'text/plain', 'text/markdown']
const HERO_EASE = [0.22, 1, 0.36, 1] as const

interface UiError {
  code: string
  message: string
}

function isUiError(value: unknown): value is UiError {
  if (!isRecord(value))
    return false
  return typeof value.code === 'string' && typeof value.message === 'string'
}

function hasExplicitTitle(value: string) {
  return /(?:^|\n)\s*TITLE\s*:/i.test(value)
}

function inferTitleFromFileName(fileName: string | null) {
  if (fileName == null)
    return null
  const trimmed = fileName.trim()
  if (trimmed.length === 0)
    return null
  const dot = trimmed.lastIndexOf('.')
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed
  const normalized = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

function withFileTitleFallback(input: string, fileName: string | null) {
  if (hasExplicitTitle(input))
    return input
  const inferredTitle = inferTitleFromFileName(fileName)
  if (inferredTitle == null)
    return input
  return `TITLE: ${inferredTitle}\n${input}`
}

function createPersistedMeta(title: string | null) {
  return {
    createdAt: new Date().toISOString(),
    language: 'en' as const,
    tokenizer: 'whitespace' as const,
    title: title ?? undefined,
    isCompleted: true,
  }
}

function toFileExtension(fileName: string) {
  const lower = fileName.toLowerCase()
  const match = ALLOWED_FILE_EXTENSIONS.find(ext => lower.endsWith(ext))
  return match ?? null
}

function validateUploadFile(file: File): UiError | null {
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return {
      code: 'ERR_FILE_TOO_LARGE',
      message: 'File is too large. Maximum supported size is 10MB.',
    }
  }

  const hasAllowedExtension = toFileExtension(file.name) != null
  const normalizedMimeType = file.type.trim().toLowerCase()
  const hasAllowedMimeType = normalizedMimeType.length > 0 && ALLOWED_FILE_MIME_TYPES.includes(normalizedMimeType)
  if (!hasAllowedExtension && !hasAllowedMimeType) {
    return {
      code: 'ERR_UNSUPPORTED_TYPE',
      message: 'Unsupported file type. Use txt, md, markdown, or pdf.',
    }
  }

  return null
}

function resolveUiErrors(baseErrors: UiError[], streamSnapshot: ReturnType<typeof getStreamSessionSnapshot>) {
  const errors = [...baseErrors]
  if (streamSnapshot?.status === 'error') {
    const message = streamSnapshot.error ?? 'AI scoring failed.'
    errors.unshift({ code: 'ERR_AI_EVAL', message })
  }
  return errors
}

export function ComponentExample() {
  const [input, setInput] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importedFileName, setImportedFileName] = useState<string | null>(null)
  const [uiErrors, setUiErrors] = useState<UiError[]>(() => {
    if (typeof window === 'undefined')
      return []

    const raw = window.sessionStorage.getItem(PREFLIGHT_ERRORS_KEY)
    if (raw == null || raw.length === 0)
      return []

    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed))
        return parsed.filter(isUiError)
    }
    catch {
      return [{ code: 'ERR_UNKNOWN', message: 'Input validation failed. Please try again.' }]
    }

    return []
  })
  const [activeRid, setActiveRid] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canAnalyze = useMemo(() => input.trim().length > 0, [input])
  const router = useRouter()

  const streamSnapshot = useSyncExternalStore(
    (callback) => {
      if (activeRid == null)
        return () => {}
      return subscribeStreamSession(activeRid, callback)
    },
    () => {
      if (activeRid == null)
        return null
      return getStreamSessionSnapshot(activeRid)
    },
    () => null,
  )

  const isAwaitingResultNavigation = activeRid != null && streamSnapshot?.status === 'done'
  const isSubmitting = activeRid != null && (
    streamSnapshot == null
    || streamSnapshot.status === 'connecting'
    || streamSnapshot.status === 'done'
  )

  useEffect(() => {
    window.sessionStorage.removeItem(PREFLIGHT_ERRORS_KEY)
  }, [])

  useEffect(() => {
    if (activeRid == null || streamSnapshot == null)
      return

    if (streamSnapshot.status === 'done') {
      router.replace(`/result?rid=${encodeURIComponent(activeRid)}`)
    }
  }, [activeRid, router, streamSnapshot])

  const startTextStream = (nextInput: string, nextFileName: string | null) => {
    const normalized = withFileTitleFallback(nextInput.trim(), nextFileName)
    if (normalized.length === 0)
      return

    setUiErrors([])
    window.sessionStorage.removeItem(PREFLIGHT_ERRORS_KEY)

    const rid = createRid()
    setActiveRid(rid)
    startStreamSession({
      rid,
      apiOrigin: DEFAULT_SCORE_API_ORIGIN,
      text: normalized,
      persistedMeta: createPersistedMeta(inferTitleFromFileName(nextFileName)),
    })
  }

  const startFileStream = (file: File) => {
    setUiErrors([])
    window.sessionStorage.removeItem(PREFLIGHT_ERRORS_KEY)

    const rid = createRid()
    setActiveRid(rid)
    setImportedFileName(file.name)
    startStreamSession({
      rid,
      apiOrigin: DEFAULT_SCORE_API_ORIGIN,
      file,
      persistedMeta: createPersistedMeta(inferTitleFromFileName(file.name)),
    })
  }

  const onAnalyze = () => {
    if (!canAnalyze || isImporting || isSubmitting)
      return
    startTextStream(input, importedFileName)
  }

  const onOpenFilePicker = () => {
    if (isImporting || isSubmitting)
      return
    fileInputRef.current?.click()
  }

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file == null)
      return

    if (input.trim().length > 0) {
      // eslint-disable-next-line no-alert -- 用原生确认框做覆盖确认，避免引入额外弹层状态与样式改动。
      const shouldReplace = window.confirm('File upload starts analysis immediately. Continue?')
      if (!shouldReplace)
        return
    }

    setIsImporting(true)
    const validationError = validateUploadFile(file)
    if (validationError != null) {
      setUiErrors([validationError])
      setIsImporting(false)
      return
    }

    startFileStream(file)
    setIsImporting(false)
  }

  if (isSubmitting) {
    const message = isAwaitingResultNavigation
      ? 'Opening results...'
      : (streamSnapshot?.message?.trim().length ?? 0) > 0
          ? (streamSnapshot?.message ?? 'Analyzing script...')
          : 'Analyzing script...'
    return (
      <section className="fixed inset-0 z-120">
        <GlobalLoading message={message} testId="home-stream-loading" />
      </section>
    )
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-5xl overflow-hidden px-4 py-6 sm:px-6 lg:px-12">
      <div className="w-full max-w-[960px] space-y-4">
        <HeroHeading />
        <IdeaComposerCard
          value={input}
          onChange={setInput}
          canAnalyze={canAnalyze}
          isImporting={isImporting}
          importedFileName={importedFileName}
          uiErrors={resolveUiErrors(uiErrors, streamSnapshot)}
          onOpenFilePicker={onOpenFilePicker}
          onAnalyze={onAnalyze}
          isSubmitting={isSubmitting}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_FILE_ACCEPT}
          className="hidden"
          data-testid="analysis-file-input"
          onChange={onFileSelected}
        />
      </div>
    </section>
  )
}

function HeroHeading() {
  return (
    <header className="space-y-3">
      <SplitText
        text="Hello,"
        tag="h1"
        className="text-foreground text-[36px] leading-[45px] font-normal tracking-[-0.9px]"
        splitType="chars"
        delay={78}
        duration={1.2}
        ease={HERO_EASE}
        from={{ opacity: 0, y: 44, scale: 0.9, filter: 'blur(8px)' }}
        to={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        textAlign="left"
        threshold={0}
        rootMargin="0px"
      />
      <SplitText
        text="Start with a chapter. We'll find the signals."
        tag="h2"
        className="text-foreground/70 text-[17px] leading-[25.5px] tracking-[-0.425px]"
        splitType="words"
        delay={92}
        duration={1.05}
        ease={HERO_EASE}
        from={{ opacity: 0, y: 30, filter: 'blur(6px)' }}
        to={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        textAlign="left"
        threshold={0}
        rootMargin="0px"
      />
    </header>
  )
}

function IdeaComposerCard({
  value,
  onChange,
  canAnalyze,
  isImporting,
  importedFileName,
  onOpenFilePicker,
  onAnalyze,
  uiErrors,
  isSubmitting,
}: {
  value: string
  onChange: (nextValue: string) => void
  canAnalyze: boolean
  isImporting: boolean
  importedFileName: string | null
  onOpenFilePicker: () => void
  onAnalyze: () => void
  uiErrors: UiError[]
  isSubmitting: boolean
}) {
  const combinedErrors = uiErrors.slice(0, 3)
  const isActionable = canAnalyze && !isImporting && !isSubmitting

  return (
    <div className="relative w-full max-w-[816px]">
      <motion.div
        className="absolute inset-x-[11px] -bottom-[15px] top-[8px] rounded-[32px] border border-border/60 bg-muted/60 shadow-xs"
        initial={{ opacity: 0, x: -220, scale: 0.86, rotate: -12 }}
        animate={{
          opacity: [0, 0, 0.2, 0.9, 1],
          x: [-220, -220, -140, 0, 0],
          scale: [0.86, 0.86, 0.93, 0.995, 1],
          rotate: [-12, -12, -5.4, -1.1, -0.5],
        }}
        transition={{
          duration: 1.05,
          times: [0, 0.34, 0.62, 0.86, 1],
          ease: HERO_EASE,
        }}
      />
      <motion.div
        className="absolute inset-x-[5px] -bottom-[8px] top-[4px] rounded-[32px] border border-border/60 bg-muted/55 shadow-2xs"
        initial={{ opacity: 0, x: 220, scale: 0.86, rotate: 12 }}
        animate={{
          opacity: [0, 0, 0, 0.66, 0.86, 1],
          x: [220, 220, 140, 0, 0, 0],
          scale: [0.86, 0.86, 0.92, 0.99, 1, 1],
          rotate: [12, 12, 10, 2.7, 1.8, 0.3],
        }}
        transition={{
          duration: 1.15,
          delay: 0.06,
          times: [0, 0.28, 0.48, 0.72, 0.88, 1],
          ease: HERO_EASE,
        }}
      />
      <motion.div
        className="relative rounded-[32px] border border-border/70 bg-background/80 p-[10px] shadow-sm backdrop-blur-[2px]"
        initial={{ opacity: 0, y: 36, scale: 0.95 }}
        animate={{ opacity: [0, 0.25, 0.86, 1], y: [36, 22, 4, 0], scale: [0.95, 0.97, 0.995, 1] }}
        transition={{
          duration: 0.95,
          delay: 0.16,
          times: [0, 0.35, 0.75, 1],
          ease: HERO_EASE,
        }}
      >
        <div
          className="relative overflow-hidden rounded-[24px] border border-border/60 p-[2px]"
          style={{
            backgroundImage: 'linear-gradient(to bottom, color-mix(in oklab, var(--primary) 26%, transparent), color-mix(in oklab, var(--primary) 12%, transparent), color-mix(in oklab, var(--primary) 8%, transparent))',
          }}
        >
          <div className="relative rounded-[24px] bg-background/85 px-4 pb-3 pt-3 backdrop-blur-[0.5px]">
            {combinedErrors.length > 0 && (
              <div className="mb-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3">
                <p className="text-foreground text-sm font-semibold">Input needs attention</p>
                <ul className="text-muted-foreground mt-1 space-y-1 text-sm">
                  {combinedErrors.map(error => (
                    <li key={`${error.code}:${error.message}`} className="leading-5">
                      {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importedFileName != null && (
              <p className="text-muted-foreground mb-3 text-xs leading-5">
                Ready file:
                {' '}
                <span className="text-foreground font-medium">{importedFileName}</span>
              </p>
            )}
            <div className="h-[min(52svh,560px)] grid grid-rows-[1fr_52px] gap-2">
              <div className="hero-scroll-window overflow-hidden">
                <Textarea
                  data-testid="analysis-input"
                  value={value}
                  onChange={event => onChange(event.target.value)}
                  placeholder="Paste your script or describe your story..."
                  className="hero-scroll min-h-0! h-full field-sizing-fixed resize-none overflow-y-auto border-0 bg-transparent font-mono text-[30px] leading-[20.63px] text-foreground shadow-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 md:text-[15px]"
                />
              </div>
              <div className="action-row flex h-[52px] items-center justify-end gap-2">
                <Button
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  className="bg-background text-foreground hover:bg-muted/40 size-10 rounded-full border-border/70 shadow-xs"
                  aria-label="Import file"
                  data-testid="analysis-file-button"
                  disabled={isImporting || isSubmitting}
                  onClick={onOpenFilePicker}
                >
                  <RiFileTextLine className={isImporting ? 'size-[18px] animate-pulse' : 'size-[18px]'} />
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className={[
                    'text-primary-foreground relative h-10 overflow-hidden rounded-full border border-border px-3 text-sm leading-[22.5px] font-semibold shadow-xs sm:px-4 sm:text-[15px]',
                    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'transition-[transform,box-shadow,filter,opacity] duration-150',
                    isActionable
                      ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-xs'
                      : 'cursor-not-allowed opacity-55',
                  ].join(' ')}
                  data-testid="analysis-submit"
                  aria-label="New Project"
                  disabled={!canAnalyze || isImporting || isSubmitting}
                  onClick={onAnalyze}
                >
                  <span
                    className={`absolute inset-0 ${isActionable ? 'opacity-100' : 'opacity-70'}`}
                    style={{
                      backgroundImage: 'linear-gradient(to right, var(--primary), color-mix(in oklab, var(--primary) 72%, var(--background)))',
                    }}
                  />
                  <span
                    className="absolute inset-0 mix-blend-screen transition-opacity duration-150"
                    style={{
                      backgroundImage: `url(${creativeTextureSrc})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      opacity: isActionable ? 0.22 : 0.14,
                    }}
                  />
                  <span className="relative">New Project</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-linear-to-b from-background/12 to-background/18" />
      </motion.div>
    </div>
  )
}
