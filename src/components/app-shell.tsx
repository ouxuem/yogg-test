'use client'

import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { RiFileTextLine, RiHome5Line, RiSearchLine, RiShieldKeyholeLine } from '@remixicon/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

interface NavigationItem {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavigationItem[] = [
  { href: '/', label: 'Home', icon: RiHome5Line },
  { href: '/discover', label: 'Search', icon: RiSearchLine },
  { href: '/scripts', label: 'Scripts', icon: RiFileTextLine },
  { href: '/cors-test', label: 'CORS Test', icon: RiShieldKeyholeLine },
]

const SIDEBAR_STYLE = {
  '--sidebar-width': '17rem',
  '--sidebar-width-icon': '3.5rem',
} as CSSProperties

function isItemActive(pathname: string, href: string) {
  if (href === '/')
    return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <SidebarProvider defaultOpen style={SIDEBAR_STYLE}>
      <Sidebar className="border-sidebar-border/60 border-r" collapsible="icon">
        <SidebarHeader className="border-sidebar-border/60 gap-3 border-b p-2">
          <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
            <Link
              href="/"
              className="flex items-center gap-2.5 group-data-[collapsible=icon]:hidden"
            >
              <span className="from-primary to-secondary grid size-7 place-items-center rounded-md bg-gradient-to-br text-white">
                L
              </span>
              <span className="text-sidebar-foreground text-base font-semibold tracking-tight">Demo</span>
            </Link>
            <SidebarTrigger className="shrink-0" />
          </div>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarGroup className="p-0">
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isItemActive(pathname, item.href)}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <Icon />
                      <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-h-svh">
        <header className="border-border/60 bg-background/80 flex items-center gap-2 border-b px-4 py-3 backdrop-blur md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">Demo</span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
