'use client'

import type { ReactNode } from 'react'
import RoutePresence from '@/components/motion/route-presence'

export default function ShellTemplate({ children }: { children: ReactNode }) {
  return <RoutePresence>{children}</RoutePresence>
}
