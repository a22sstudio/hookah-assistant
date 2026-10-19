'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar, MobileNav, type NavItem } from '@/components/hookah/sidebar'
import { HomeDashboard } from '@/components/hookah/home-dashboard'
import { Dashboard } from '@/components/hookah/dashboard'
import { ConsumablesPanel } from '@/components/hookah/consumables-panel'
import { SupplyPanel } from '@/components/hookah/supply-panel'
import { WishesPanel } from '@/components/hookah/wishes-panel'
import { MastersManager } from '@/components/hookah/masters-manager'
import { NotificationsBell } from '@/components/hookah/notifications-bell'
import { AIChat } from '@/components/hookah/ai-chat'
import { ScheduleCalendar } from '@/components/hookah/schedule-calendar'
import { SalaryCalculator } from '@/components/hookah/salary-calculator'
import { MixesPanel } from '@/components/hookah/mixes-panel'
import { MyIncomePanel } from '@/components/hookah/my-income-panel'
import { ThemeToggle } from '@/components/theme-toggle'
import { ThemeToggleButton } from '@/components/hookah/theme-toggle-button'
import {
  MessageCircle,
  LayoutDashboard,
  Star,
  LogOut,
  Users,
  CalendarRange,
  Wallet,
  Layers,
  Home,
  Truck,
  Beaker,
  Flame,
  Bell,
} from 'lucide-react'
import { masterAvatarClass, initials } from '@/lib/master-utils'
import { toast } from 'sonner'
import { Master } from '@/lib/types'

interface SeniorViewProps {
  master: Master
  onLogout: () => void
}

export function SeniorView({ master, onLogout }: SeniorViewProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('today')
  const refresh = () => setRefreshKey((k) => k + 1)

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

  const navItems: NavItem[] = useMemo(
    () => [
      { value: 'today', label: 'Сегодня', icon: Home },
      { value: 'schedule', label: 'График', icon: CalendarRange },
      { value: 'salary', label: 'Зарплата', icon: Wallet },
      { value: 'stock', label: 'Склад', icon: LayoutDashboard },
      { value: 'consumables', label: 'Расход', icon: Layers },
      { value: 'supply', label: 'Поставки', icon: Truck },
      { value: 'mixes', label: 'Миксы', icon: Beaker },
      { value: 'income', label: 'Доход', icon: Wallet },
      { value: 'wishes', label: 'Хотелки', icon: Star },
      { value: 'masters', label: 'Мастера', icon: Users },
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
        role="SENIOR"
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
            <p className="label-mono leading-none">Старший мастер</p>
            <h1 className="font-mono font-bold text-[15px] leading-tight truncate text-foreground mt-0.5">
              {activeLabel}
            </h1>
          </div>

          {/* Theme toggle */}
          <ThemeToggleButton />

          {/* Notifications */}
          <NotificationsBell refreshKey={refreshKey} />

          {/* Quick logout */}
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
              <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <p className="label-mono-ember mb-2">Старший · {master.name}</p>
                  <h2 className="heading-display text-3xl sm:text-4xl text-foreground">
                    Обзор смены
                  </h2>
                </div>
                <div className="flex items-center gap-2 label-mono-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-success live-pulse" />
                  Live · синхронизация каждые 10с
                </div>
              </div>
            )}

            {activeTab === 'today' && <HomeDashboard refreshKey={refreshKey} onNavigate={navigate} />}
            {activeTab === 'schedule' && (
              <ScheduleCalendar canEdit refreshKey={refreshKey} onRefresh={refresh} />
            )}
            {activeTab === 'salary' && (
              <SalaryCalculator refreshKey={refreshKey} onRefresh={refresh} />
            )}
            {activeTab === 'stock' && <Dashboard refreshKey={refreshKey} onRefresh={refresh} />}
            {activeTab === 'consumables' && (
              <ConsumablesPanel refreshKey={refreshKey} onRefresh={refresh} />
            )}
            {activeTab === 'supply' && <SupplyPanel refreshKey={refreshKey} onRefresh={refresh} />}
            {activeTab === 'mixes' && (
              <MixesPanel
                role="SENIOR"
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
              <WishesPanel role="SENIOR" refreshKey={refreshKey} onRefresh={refresh} />
            )}
            {activeTab === 'masters' && (
              <MastersManager refreshKey={refreshKey} onRefresh={refresh} />
            )}
          </div>
        </main>
      </div>

      {/* AI Chat — floating button + Sheet (no full-width block) */}
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
