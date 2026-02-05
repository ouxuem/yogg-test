'use client'

import { RiFileTextLine, RiPaletteLine } from '@remixicon/react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const creativeTextureSrc = '/assets/creative-space-texture.png'
const INPUT_STORAGE_KEY = 'sdicap:v2:input'

export function ComponentExample() {
  const [input, setInput] = useState('')
  const canAnalyze = useMemo(() => input.trim().length > 0, [input])
  const router = useRouter()

  const onAnalyze = () => {
    if (!canAnalyze)
      return
    window.sessionStorage.setItem(INPUT_STORAGE_KEY, input)
    router.push('/analyze')
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-5xl overflow-hidden px-4 py-6 sm:px-6 lg:px-12">
      <div className="w-full max-w-[960px] space-y-4">
        <HeroHeading />
        <IdeaComposerCard
          value={input}
          onChange={setInput}
          canAnalyze={canAnalyze}
          onAnalyze={onAnalyze}
        />
      </div>
    </section>
  )
}

function HeroHeading() {
  return (
    <header className="space-y-3">
      <h1 className="text-[36px] leading-[45px] font-normal tracking-[-0.9px] text-[#293b1f]">Hello,</h1>
      <p className="text-[17px] leading-[25.5px] tracking-[-0.425px] text-[#65725e]">
        Start with a chapter. We&apos;ll find the signals.
      </p>
    </header>
  )
}

function IdeaComposerCard({
  value,
  onChange,
  canAnalyze,
  onAnalyze,
}: {
  value: string
  onChange: (nextValue: string) => void
  canAnalyze: boolean
  onAnalyze: () => void
}) {
  return (
    <div className="relative w-full max-w-[816px]">
      <div className="absolute inset-x-[11px] -bottom-[15px] top-[8px] rotate-[-0.5deg] rounded-[32px] border border-[#e2e6e0] bg-[#f2f3f0] shadow-[2px_2px_4px_rgba(0,0,0,0.05)]" />
      <div className="absolute inset-x-[5px] -bottom-[8px] top-[4px] rotate-[0.3deg] rounded-[32px] border border-[#e2e6e0] bg-[#f2f3f0] shadow-[1px_1px_3px_rgba(0,0,0,0.05)]" />
      <div className="relative rounded-[32px] border border-border/70 bg-background/80 p-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-[2px]">
        <div className="relative overflow-hidden rounded-[24px] border border-[#e2e6e0] bg-gradient-to-b from-[rgba(74,109,71,0.25)] via-[rgba(74,109,71,0.12)] to-[rgba(74,109,71,0.08)] p-[2px] shadow-[inset_0_2px_6px_rgba(74,109,71,0.15),inset_0_1px_3px_rgba(0,0,0,0.08),inset_0_4px_12px_rgba(74,109,71,0.1)]">
          <div className="relative rounded-[24px] bg-background/85 px-4 pb-3 pt-3 backdrop-blur-[0.5px]">
            <div className="h-[min(52svh,560px)] grid grid-rows-[1fr_52px] gap-2">
              <div className="hero-scroll-window overflow-hidden">
                <Textarea
                  data-testid="analysis-input"
                  value={value}
                  onChange={event => onChange(event.target.value)}
                  placeholder="Start with the simplest idea..."
                  className="hero-scroll !min-h-0 h-full [field-sizing:fixed] resize-none overflow-y-auto border-0 bg-transparent font-mono text-[30px] leading-[20.63px] text-foreground shadow-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 md:text-[15px]"
                />
              </div>
              <div className="action-row flex h-[52px] items-center justify-end gap-2">
                <Button
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  className="size-10 rounded-full border-[#e2e6e0] bg-[#fdfefb] text-[#334930] shadow-[0_0.5px_1px_rgba(0,0,0,0.08)] hover:bg-[#f6f8f3]"
                  aria-label="Open palette"
                >
                  <RiPaletteLine className="size-[18px]" />
                </Button>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  className="size-10 rounded-full border-[#e2e6e0] bg-[#fdfefb] text-[#334930] shadow-[0_0.5px_1px_rgba(0,0,0,0.08)] hover:bg-[#f6f8f3]"
                  aria-label="Open file options"
                >
                  <RiFileTextLine className="size-[18px]" />
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="relative h-10 overflow-hidden rounded-full px-3 text-sm leading-[22.5px] font-semibold text-white shadow-[0_0.5px_1px_rgba(0,0,0,0.08)] sm:px-4 sm:text-[15px]"
                  data-testid="analysis-submit"
                  aria-label="New Project"
                  disabled={!canAnalyze}
                  onClick={onAnalyze}
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-[#526c4b] to-[#74896e]" />
                  <span
                    className="absolute inset-0 opacity-35 mix-blend-screen"
                    style={{ backgroundImage: `url(${creativeTextureSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                  />
                  <span className="relative">New Project</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-gradient-to-b from-background/12 to-background/18" />
      </div>
    </div>
  )
}
