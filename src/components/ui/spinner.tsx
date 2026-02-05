import { cn } from "@/lib/utils"
import { RiLoaderLine } from "@remixicon/react"
import type { RemixiconComponentType } from "@remixicon/react"

function Spinner({ className, ...props }: React.ComponentProps<RemixiconComponentType>) {
  return (
    <RiLoaderLine role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
