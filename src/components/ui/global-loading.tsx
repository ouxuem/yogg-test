import DotGrid from '@/components/ui/dot-grid'
import PrismaticBurst from '@/components/ui/prismatic-burst'

export default function GlobalLoading({
  message = 'Loading page...',
  testId,
}: {
  message?: string
  testId?: string
}) {
  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_55%)]" />
      <div className="absolute inset-0">
        <PrismaticBurst
          intensity={1.9}
          speed={0.34}
          animationType="hover"
          distort={12}
          hoverDampness={0.35}
          rayCount={11}
          colors={[
            'var(--primary)',
            'var(--accent)',
            'var(--ring)',
            'color-mix(in oklch, var(--primary) 80%, var(--background))',
            'color-mix(in oklch, var(--accent) 70%, var(--primary))',
            'color-mix(in oklch, var(--primary) 60%, transparent)',
            'color-mix(in oklch, var(--ring) 50%, var(--background))',
          ]}
          mixBlendMode="multiply"
        />
      </div>
      <div className="absolute inset-0 opacity-85">
        <DotGrid
          dotSize={2.8}
          gap={16}
          baseColor="var(--muted-foreground)"
          activeColor="var(--primary)"
          proximity={150}
          pushStrength={0.05}
          velocityInfluence={0.01}
          shockRadius={160}
          shockStrength={1}
          damping={0.9}
          spring={0.05}
          opacity={0.58}
          blur={1.7}
          maxDots={1500}
          fps={24}
        />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div
          className="bg-card/80 border-border text-card-foreground rounded-xl border px-6 py-4 text-sm backdrop-blur"
          data-testid={testId}
        >
          {message}
        </div>
      </div>
    </div>
  )
}
