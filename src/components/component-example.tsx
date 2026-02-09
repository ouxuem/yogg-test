'use client'

import type { ChangeEvent } from 'react'
import type { UploadError } from '@/lib/file-import/types'
import { RiFileTextLine, RiPaletteLine } from '@remixicon/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createRid, writeRunInput } from '@/lib/analysis/run-store'
import { extractTextFromFile, IMPORT_FILE_ACCEPT } from '@/lib/file-import/extract-text'
import { isRecord } from '@/lib/type-guards'

const creativeTextureSrc = '/assets/creative-space-texture.png'
const PREFLIGHT_ERRORS_KEY = 'sdicap:preflight_errors'

interface PreflightError {
  code: string
  message: string
}

function isPreflightError(value: unknown): value is PreflightError {
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

export function ComponentExample() {
  const [input, setInput] = useState('')
  const [uploadErrors, setUploadErrors] = useState<UploadError[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importedFileName, setImportedFileName] = useState<string | null>(null)
  const [preflightErrors, setPreflightErrors] = useState<PreflightError[]>(() => {
    if (typeof window === 'undefined')
      return []

    const raw = window.sessionStorage.getItem(PREFLIGHT_ERRORS_KEY)
    if (raw == null || raw.length === 0)
      return []

    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed))
        return parsed.filter(isPreflightError)
    }
    catch {
      return [{ code: 'ERR_UNKNOWN', message: 'Input validation failed. Please try again.' }]
    }

    return []
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canAnalyze = useMemo(() => input.trim().length > 0, [input])
  const router = useRouter()

  useEffect(() => {
    window.sessionStorage.removeItem(PREFLIGHT_ERRORS_KEY)
  }, [])

  const onAnalyze = () => {
    if (!canAnalyze || isImporting)
      return
    setUploadErrors([])
    setPreflightErrors([])
    window.sessionStorage.removeItem(PREFLIGHT_ERRORS_KEY)
    const rid = createRid()
    writeRunInput(rid, withFileTitleFallback(input, importedFileName))
    router.push(`/analyze?rid=${encodeURIComponent(rid)}`)
  }

  const onOpenFilePicker = () => {
    if (isImporting)
      return
    fileInputRef.current?.click()
  }

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file == null)
      return

    if (input.trim().length > 0) {
      // eslint-disable-next-line no-alert -- 用原生确认框做覆盖确认，避免引入额外弹层状态与样式改动。
      const shouldReplace = window.confirm('Import will replace current text. Continue?')
      if (!shouldReplace)
        return
    }

    setIsImporting(true)
    setUploadErrors([])
    try {
      const result = await extractTextFromFile(file)
      if (!result.ok) {
        setImportedFileName(null)
        setUploadErrors([result.error])
        return
      }

      setInput(result.text)
      setImportedFileName(result.fileName)
      setUploadErrors([])
      setPreflightErrors([])
      window.sessionStorage.removeItem(PREFLIGHT_ERRORS_KEY)
    }
    finally {
      setIsImporting(false)
    }
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
          uploadErrors={uploadErrors}
          onOpenFilePicker={onOpenFilePicker}
          onAnalyze={onAnalyze}
          errors={preflightErrors}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_FILE_ACCEPT}
          className="hidden"
          data-testid="analysis-file-input"
          onChange={(event) => {
            void onFileSelected(event)
          }}
        />
      </div>
    </section>
  )
}

function HeroHeading() {
  return (
    <header className="space-y-3">
      <h1 className="text-foreground text-[36px] leading-[45px] font-normal tracking-[-0.9px]">Hello,</h1>
      <p className="text-muted-foreground text-[17px] leading-[25.5px] tracking-[-0.425px]">
        Start with a chapter. We&apos;ll find the signals.
      </p>
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
  errors,
  uploadErrors,
}: {
  value: string
  onChange: (nextValue: string) => void
  canAnalyze: boolean
  isImporting: boolean
  importedFileName: string | null
  onOpenFilePicker: () => void
  onAnalyze: () => void
  errors: PreflightError[]
  uploadErrors: UploadError[]
}) {
  const combinedErrors = [...uploadErrors, ...errors].slice(0, 3)
  const isActionable = canAnalyze && !isImporting

  return (
    <div className="relative w-full max-w-[816px]">
      <div className="absolute inset-x-[11px] -bottom-[15px] top-[8px] rotate-[-0.5deg] rounded-[32px] border border-border/60 bg-muted/60 shadow-xs" />
      <div className="absolute inset-x-[5px] -bottom-[8px] top-[4px] rotate-[0.3deg] rounded-[32px] border border-border/60 bg-muted/55 shadow-2xs" />
      <div className="relative rounded-[32px] border border-border/70 bg-background/80 p-[10px] shadow-sm backdrop-blur-[2px]">
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
                Imported:
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
                  placeholder="Start with the simplest idea..."
                  className="hero-scroll min-h-0! h-full field-sizing-fixed resize-none overflow-y-auto border-0 bg-transparent font-mono text-[30px] leading-[20.63px] text-foreground shadow-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 md:text-[15px]"
                />
              </div>
              <div className="action-row flex h-[52px] items-center justify-end gap-2">
                <Button
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  className="bg-background text-foreground hover:bg-muted/40 size-10 rounded-full border-border/70 shadow-xs"
                  aria-label="Open palette"
                >
                  <RiPaletteLine className="size-[18px]" />
                </Button>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  className="bg-background text-foreground hover:bg-muted/40 size-10 rounded-full border-border/70 shadow-xs"
                  aria-label="Import file"
                  data-testid="analysis-file-button"
                  disabled={isImporting}
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
                  disabled={!canAnalyze || isImporting}
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
      </div>
    </div>
  )
}
