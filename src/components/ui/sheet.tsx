"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RiCloseLine } from "@remixicon/react"
import { getModalContentVariant, getModalOverlayVariant } from "@/lib/motion/variants"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  const isReduced = useReducedMotion() === true
  const variants = getModalOverlayVariant(isReduced)

  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn("bg-black/10 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50", className)}
      render={(renderProps, state) => (
        <motion.div
          {...(renderProps as any)}
          initial="hidden"
          animate={state.open ? "visible" : "exit"}
          variants={variants}
        />
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const isReduced = useReducedMotion() === true
  const modalVariants = getModalContentVariant(isReduced)
  const sideVariants = isReduced
    ? modalVariants
    : {
        hidden: {
          opacity: 0,
          x: side === "left" ? -24 : side === "right" ? 24 : 0,
          y: side === "top" ? -24 : side === "bottom" ? 24 : 0,
        },
        visible: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: { type: "spring", stiffness: 300, damping: 35 },
        },
        exit: {
          opacity: 0,
          x: side === "left" ? -12 : side === "right" ? 12 : 0,
          y: side === "top" ? -12 : side === "bottom" ? 12 : 0,
          transition: { duration: 0.18, ease: [0, 0, 0.2, 1] },
        },
      }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn("bg-background fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm", className)}
        render={(renderProps, state) => (
          <motion.div
            {...(renderProps as any)}
            initial="hidden"
            animate={state.open ? "visible" : "exit"}
            variants={sideVariants as any}
          />
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-4 right-4"
                size="icon-sm"
              />
            }
          >
            <RiCloseLine
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("gap-1.5 p-4 flex flex-col", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("gap-2 p-4 mt-auto flex flex-col", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
