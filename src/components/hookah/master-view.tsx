'use client'

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar, MobileNav, type NavItem } from '@/components/hookah/sidebar'
import { ThemeToggleButton } from '@/components/hookah/theme-toggle-button'
import { HomeDashboard } from '@/components/hookah/home-dashboard'
import { Dashboard } from '@/components/hookah/dashboard'
import { ConsumablesPanel } from '@/components/hookah/consumables-panel'
import { WishesPanel } from '@/components/hookah/wishes-panel'
import { MixesPanel } from '@/components/hookah/mixes-panel'
import { MyIncomePanel } from '@/components/hookah/my-income-panel'
import { AIChat } from '@/components/hookah/ai-chat'
import { ScheduleCalendar } from '@/components/hookah/schedule-calendar'
import { masterAvatarClass, initials } from '@/lib/master-utils'
import {
  MessageCircle,
  Star,
  Package,
  LogOut,
  CalendarRange,
  Layers,
  Home,
  Beaker,
  Wallet,
  Flame,
} from 'lucide-react'
import { toast } from 'sonner'
import { Tobacco } from '@/lib/types'

interface MasterViewProps {
  master: { id: string; name: string; role: 'SENIOR' | 'REGULAR'; color: string }
  onLogout: () => void
}

export function MasterView({ master, onLogout }: MasterViewProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('today')
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    toast.success('До встречи!')
    onLogout()
  }

  const navigate = (tab: string) => setActiveTab(tab)

  const handleOrderItem = useCallback((t: Tobacco) => {
    const itemName = `${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor}`.trim()
    toast.info(`Напиши боту: «закажи ${itemName}» или обратись к старшему`)
  }, [])

  const navItems: NavItem[] = useMemo(
    () => [
      { value: 'today', label: 'Сегодня', icon: Home },
      { value: 'schedule', label: 'График', icon: CalendarRange },
      { value: 'stock', label: 'Склад', icon: Package },
      { value: 'consumables', label: 'Расход', icon: Layers },
      { value: 'mixes', label: 'Миксы', icon: Beaker },
      { value: 'income', label: 'Доход', icon: Wallet },
      { value: 'wishes', label: 'Хотелки', icon: Star },
    ],
    [],
  )

  const activeLabel = navItems.find((i) => i.value === activeTab)?.label ?? 'Сегодня'

  return (
    <div className="min-h-screen flex bg-background theme-transition">
      {/* Sidebar (desktop) */}
      <Sidebar
        items={navItems}
        active={activeTab}
        onNavigate={navigate}
        masterName={master.name}
        masterInitials={initials(master.name)}
        masterColor={master.color}
        role="REGULAR"
      />

      {/* Mobile bottom nav */}
      <MobileNav items={navItems} active={activeTab} onNavigate={navigate} />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="sticky top-0 z-30 h-[60px] border-b border-border bg-background/95 backdrop-blur-md flex items-center gap-3 px-4 sm:px-6">
          <div className="md:hidden h-9 w-9 rounded-md gradient-ember flex items-center justify-center">
            <Flame className="h-5 w-5 text-ember-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="label-mono leading-none">Привет,</p>
            <h1 className="font-mono font-bold text-[15px] leading-tight truncate text-foreground mt-0.5">
              {master.name} · {activeLabel}
            </h1>
          </div>

          <ThemeToggleButton />

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={handleLogout}
            title="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-y-auto pb-[80px] md:pb-6">
          <div className="mx-auto max-w-[1280px] w-full px-4 sm:px-6 py-6 fade-in">
            {/* Greeting banner — only on Today tab */}
            {activeTab === 'today' && (
              <div className="mb-6">
                <p className="label-mono-ember mb-2">Смена · {master.name}</p>
                <h2 className="heading-display text-3xl sm:text-4xl text-foreground">
                  Обзор смены
                </h2>
              </div>
            )}

            {activeTab === 'today' && <HomeDashboard refreshKey={refreshKey} onNavigate={navigate} />}
            {activeTab === 'schedule' && (
              <ScheduleCalendar canEdit={false} refreshKey={refreshKey} onRefresh={refresh} />
            )}
            {activeTab === 'stock' && (
              <Dashboard
                readOnly
                refreshKey={refreshKey}
                onRefresh={refresh}
                onOrderItem={handleOrderItem}
              />
            )}
            {activeTab === 'consumables' && (
              <ConsumablesPanel readOnly refreshKey={refreshKey} onRefresh={refresh} />
            )}
            {activeTab === 'mixes' && (
              <MixesPanel
                role="REGULAR"
                masterId={master.id}
                refreshKey={refreshKey}
                onRefresh={refresh}
              />
            )}
            {activeTab === 'income' && (
              <MyIncomePanel
                masterName={master.name}
                masterColor={master.color}
                refreshKey={refreshKey}
                onRefresh={refresh}
              />
            )}
            {activeTab === 'wishes' && (
              <WishesPanel role="REGULAR" refreshKey={refreshKey} onRefresh={refresh} />
            )}
          </div>
        </main>
      </div>

      {/* AI Chat — floating button + Sheet */}
      <Sheet open={mobileChatOpen} onOpenChange={setMobileChatOpen}>
        <SheetTrigger asChild>
          <Button
            className="fixed bottom-[80px] md:bottom-6 right-4 z-40 h-12 w-12 rounded-full gradient-ember ember-glow hover:opacity-90 transition-base"
            size="icon"
            aria-label="AI ассистент"
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <div className="flex-1 min-h-0 p-3">
            <AIChat onAction={refresh} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
