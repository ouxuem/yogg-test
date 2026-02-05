import { ComponentExample } from '@/components/component-example'
import Waves from '@/components/ui/waves'

export default function Page() {
  return (
    <main className="relative flex h-full min-h-0 flex-1 items-center overflow-hidden">
      <Waves
        lineColor="var(--muted-foreground)"
        lineOpacity={0.2}
        cursorInfluence={0.72}
        cursorRadius={220}
        cursorStrength={1.05}
        maxCursorMove={40}
      />
      <div className="relative z-10 w-full">
        <ComponentExample />
      </div>
    </main>
  )
}
