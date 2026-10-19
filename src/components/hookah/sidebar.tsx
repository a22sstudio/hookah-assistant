'use client'

import { useState } from 'react'
import { Leaf, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface NavItem {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

interface SidebarProps {
  items: NavItem[]
  active: string
  onNavigate: (value: string) => void
  masterName: string
  masterInitials: string
  masterColor: string
  role: 'SENIOR' | 'REGULAR'
  footer?: React.ReactNode
}

export function Sidebar({
  items,
  active,
  onNavigate,
  masterName,
  masterInitials,
  masterColor,
  role,
  footer,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 border-r border-sidebar-border bg-sidebar',
          'transition-[width] var(--duration-base) var(--ease-out) theme-transition',
          collapsed ? 'w-[72px]' : 'w-[240px]',
        )}
      >
        {/* Logo / Brand */}
        <div className="h-[60px] flex items-center gap-3 px-4 border-b border-sidebar-border">
          <div className="h-9 w-9 shrink-0 rounded-md gradient-ember flex items-center justify-center ember-glow">
            <Leaf className="h-5 w-5 text-ember-foreground" />
          </div>
          {!collapsed && (
            <div className="min-w-0 fade-in">
              <p className="label-mono leading-none truncate">Кальянная</p>
              <p className="font-mono font-bold text-sm leading-tight mt-0.5 truncate">
                ASSISTANT
              </p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2">
          <div className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon
              const isActive = active === item.value
              const button = (
                <button
                  onClick={() => onNavigate(item.value)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 h-10 rounded-md text-left',
                    'transition-base transition-colors group',
                    'hover:bg-sidebar-accent hover:text-ember',
                    isActive && 'nav-active',
                    collapsed && 'justify-center px-0',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors',
                      isActive ? 'text-ember' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  {!collapsed && (
                    <>
                      <span
                        className={cn(
                          'flex-1 min-w-0 truncate text-[13px] font-medium transition-colors',
                          isActive ? 'text-ember' : 'text-foreground/85',
                        )}
                      >
                        {item.label}
                      </span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={cn(
                            'shrink-0 min-w-[18px] h-[18px] px-1 rounded-full',
                            'flex items-center justify-center text-[10px] font-bold tabular',
                            isActive
                              ? 'ember-bg'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full ember-bg" />
                  )}
                </button>
              )

              if (collapsed) {
                return (
                  <Tooltip key={item.value}>
                    <TooltipTrigger asChild>
                      <div className="relative">{button}</div>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      <span className="font-medium">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-2 text-ember font-bold">{item.badge}</span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              }
              return <div key={item.value} className="relative">{button}</div>
            })}
          </div>
        </nav>

        {/* User card */}
        <div className="border-t border-sidebar-border p-2">
          <div
            className={cn(
              'flex items-center gap-3 px-2 py-2 rounded-md',
              collapsed && 'justify-center px-0',
            )}
          >
            <div
              className={cn(
                'h-8 w-8 shrink-0 rounded-md flex items-center justify-center',
                'font-mono font-bold text-xs text-white ring-2 ring-offset-2 ring-offset-sidebar',
              )}
              style={{ background: masterColor }}
            >
              {masterInitials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 fade-in">
                <p className="text-[13px] font-semibold leading-tight truncate text-foreground">
                  {masterName}
                </p>
                <p className="label-mono-sm mt-0.5">
                  {role === 'SENIOR' ? 'Старший мастер' : 'Мастер'}
                </p>
              </div>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              'mt-2 w-full flex items-center justify-center h-8 rounded-md',
              'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent',
              'transition-base transition-colors',
            )}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {footer}
      </aside>
    </TooltipProvider>
  )
}

/* Mobile bottom navigation — fixed to bottom of screen */
interface MobileNavProps {
  items: NavItem[]
  active: string
  onNavigate: (value: string) => void
}

export function MobileNav({ items, active, onNavigate }: MobileNavProps) {
  // Show only first 5 items on mobile bottom nav, rest via "more"
  const visibleItems = items.slice(0, 5)

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-sidebar-border bg-sidebar/95 backdrop-blur-lg theme-transition">
      <div className="grid grid-cols-5 h-[60px] safe-area-inset-bottom">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = active === item.value
          return (
            <button
              key={item.value}
              onClick={() => onNavigate(item.value)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 relative',
                'transition-base transition-colors',
                isActive ? 'text-ember' : 'text-muted-foreground',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-[20px] w-[20px]" />
              <span className="text-[10px] font-medium leading-none truncate max-w-full px-1">
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1.5 right-[28%] h-1.5 w-1.5 rounded-full ember-bg" />
              )}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 ember-bg rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
