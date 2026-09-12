'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme-toggle'
import { HomeDashboard } from '@/components/hookah/home-dashboard'
import { MasterRequests } from '@/components/hookah/master-requests'
import { WishesPanel } from '@/components/hookah/wishes-panel'
import { Dashboard } from '@/components/hookah/dashboard'
import { ConsumablesPanel } from '@/components/hookah/consumables-panel'
import { OrderComposer } from '@/components/hookah/order-composer'
import { AIChat } from '@/components/hookah/ai-chat'
import { ScheduleCalendar } from '@/components/hookah/schedule-calendar'
import { masterAvatarClass, initials } from '@/lib/master-utils'
import {
  MessageCircle,
  ShoppingCart,
  Star,
  Package,
  LogOut,
  CalendarRange,
  Boxes,
  Home,
  ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'

interface MasterViewProps {
  master: { id: string; name: string; role: 'SENIOR' | 'REGULAR'; color: string }
  onLogout: () => void
}

export function MasterView({ master, onLogout }: MasterViewProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [tab, setTab] = useState<string>('home')
  const refresh = () => setRefreshKey((k) => k + 1)

  // Слушаем события переключения табов от HomeDashboard
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail) {
        setTab(detail)
        // Прокрутить к началу страницы (чтобы увидеть таб)
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }
    }
    window.addEventListener('home-goto', handler as EventListener)
    return () => window.removeEventListener('home-goto', handler as EventListener)
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    toast.success('До встречи!')
    onLogout()
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header — sticky, opaque, z-40 */}
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-[60px] flex items-center gap-4">
          <div
            className={`h-9 w-9 shrink-0 ${masterAvatarClass(
              master.color,
            )} flex items-center justify-center text-xs font-mono font-bold text-white rounded-md`}
          >
            {initials(master.name)}
          </div>
          <div className="flex-1 min-w-0">
            <span className="label-mono">Привет,</span>
            <h1 className="heading-mono font-bold tracking-tight text-sm sm:text-base leading-tight truncate text-foreground">
              {master.name}
            </h1>
          </div>
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={handleLogout}
            title="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 mx-auto max-w-[1400px] w-full px-4 sm:px-6 py-6">
        <div className="grid lg:grid-cols-[1fr_440px] gap-6">
          {/* Левая колонка */}
          <div className="min-w-0 space-y-6">
            {/* Табы */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid w-full grid-cols-7 h-auto">
                <TabsTrigger
                  value="home"
                  className="flex flex-col gap-1 py-2.5"
                >
                  <Home className="h-4 w-4" />
                  <span>Сегодня</span>
                </TabsTrigger>
                <TabsTrigger
                  value="schedule"
                  className="flex flex-col gap-1 py-2.5"
                >
                  <CalendarRange className="h-4 w-4" />
                  <span>График</span>
                </TabsTrigger>
                <TabsTrigger
                  value="requests"
                  className="flex flex-col gap-1 py-2.5"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>Заявки</span>
                </TabsTrigger>
                <TabsTrigger
                  value="wishes"
                  className="flex flex-col gap-1 py-2.5"
                >
                  <Star className="h-4 w-4" />
                  <span>Хотелки</span>
                </TabsTrigger>
                <TabsTrigger
                  value="stock"
                  className="flex flex-col gap-1 py-2.5"
                >
                  <Package className="h-4 w-4" />
                  <span>Склад</span>
                </TabsTrigger>
                <TabsTrigger
                  value="consumables"
                  className="flex flex-col gap-1 py-2.5"
                >
                  <Boxes className="h-4 w-4" />
                  <span>Расход</span>
                </TabsTrigger>
                <TabsTrigger
                  value="orders"
                  className="flex flex-col gap-1 py-2.5"
                >
                  <ClipboardList className="h-4 w-4" />
                  <span>Заказ</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="home" className="pt-4">
                <HomeDashboard
                  master={master}
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="schedule" className="pt-4">
                <ScheduleCalendar
                  canEdit={false}
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="requests" className="pt-4">
                <MasterRequests
                  role="REGULAR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="wishes" className="pt-4">
                <WishesPanel
                  role="REGULAR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="stock" className="pt-4">
                <Dashboard
                  readOnly
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="consumables" className="pt-4">
                <ConsumablesPanel
                  role="REGULAR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="orders" className="pt-4">
                <OrderComposer
                  role="REGULAR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Правая колонка — чат (десктоп) */}
          <aside className="hidden lg:block">
            <div className="sticky top-[76px] h-[calc(100vh-100px)]">
              <AIChat onAction={refresh} />
            </div>
          </aside>
        </div>
      </main>

      {/* Мобильный чат */}
      <Sheet open={mobileChatOpen} onOpenChange={setMobileChatOpen}>
        <SheetTrigger asChild>
          <Button
            className="lg:hidden fixed bottom-20 right-4 z-40 h-12 w-12"
            size="icon"
            variant="destructive"
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

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-background">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex items-center justify-between label-mono-sm">
          <span>
            Кальянный ассистент · <span className="font-bold text-foreground">{master.name}</span>
          </span>
          <span className="hidden sm:inline">удачной смены</span>
        </div>
      </footer>
    </div>
  )
}
