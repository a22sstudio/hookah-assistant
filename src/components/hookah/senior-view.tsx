'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ShiftPanel } from '@/components/hookah/shift-panel'
import { SeniorShiftView } from '@/components/hookah/senior-shift-view'
import { Dashboard } from '@/components/hookah/dashboard'
import { MasterRequests } from '@/components/hookah/master-requests'
import { WishesPanel } from '@/components/hookah/wishes-panel'
import { TobaccosManager } from '@/components/hookah/tobaccos-manager'
import { OperationsList } from '@/components/hookah/operations-list'
import { MastersManager } from '@/components/hookah/masters-manager'
import { NotificationsBell } from '@/components/hookah/notifications-bell'
import { AIChat } from '@/components/hookah/ai-chat'
import { Leaf } from 'lucide-react'
import { MessageCircle, LayoutDashboard, History, ShoppingCart, Star, BookOpen, Clock, LogOut, Users } from 'lucide-react'
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

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2 shadow-sm">
            <Leaf className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground leading-none">Старший мастер</p>
            <h1 className="font-bold text-base sm:text-lg leading-tight truncate">
              {master.name}
            </h1>
          </div>

          {/* Уведомления */}
          <NotificationsBell refreshKey={refreshKey} />

          {/* Аватар старшего */}
          <div
            className={`h-9 w-9 shrink-0 rounded-full ${masterAvatarClass(
              master.color,
            )} flex items-center justify-center text-xs font-bold text-white`}
            title={master.name}
          >
            {initials(master.name)}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={handleLogout}
            title="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-4">
        <div className="grid lg:grid-cols-[1fr_440px] gap-4">
          {/* Левая колонка */}
          <div className="min-w-0">
            <Tabs defaultValue="shift" className="w-full">
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 h-auto mb-4">
                <TabsTrigger
                  value="shift"
                  className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:gap-1.5"
                >
                  <Clock className="h-4 w-4" />
                  <span>Смена</span>
                </TabsTrigger>
                <TabsTrigger
                  value="dashboard"
                  className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:gap-1.5"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Склад</span>
                </TabsTrigger>
                <TabsTrigger
                  value="requests"
                  className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:gap-1.5"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>Заявки</span>
                </TabsTrigger>
                <TabsTrigger
                  value="wishes"
                  className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:gap-1.5"
                >
                  <Star className="h-4 w-4" />
                  <span>Хотелки</span>
                </TabsTrigger>
                <TabsTrigger
                  value="masters"
                  className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:gap-1.5"
                >
                  <Users className="h-4 w-4" />
                  <span>Мастера</span>
                </TabsTrigger>
                <TabsTrigger
                  value="catalog"
                  className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:gap-1.5"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Справочник</span>
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:gap-1.5"
                >
                  <History className="h-4 w-4" />
                  <span>История</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="shift" className="space-y-4">
                <SeniorShiftView refreshKey={refreshKey} onRefresh={refresh} />
                <ShiftPanel
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                  masterName={master.name}
                />
              </TabsContent>
              <TabsContent value="dashboard">
                <Dashboard refreshKey={refreshKey} onRefresh={refresh} />
              </TabsContent>
              <TabsContent value="requests">
                <MasterRequests
                  role="SENIOR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="wishes">
                <WishesPanel
                  role="SENIOR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="masters">
                <MastersManager refreshKey={refreshKey} onRefresh={refresh} />
              </TabsContent>
              <TabsContent value="catalog">
                <TobaccosManager refreshKey={refreshKey} onRefresh={refresh} />
              </TabsContent>
              <TabsContent value="history">
                <OperationsList refreshKey={refreshKey} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Правая колонка — чат (десктоп) */}
          <aside className="hidden lg:block">
            <div className="sticky top-[81px] h-[calc(100vh-105px)]">
              <AIChat onAction={refresh} />
            </div>
          </aside>
        </div>
      </main>

      {/* Мобильный чат */}
      <Sheet open={mobileChatOpen} onOpenChange={setMobileChatOpen}>
        <SheetTrigger asChild>
          <Button
            className="lg:hidden fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-700"
            size="icon"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <div className="flex-1 min-h-0 p-3">
            <AIChat onAction={refresh} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Footer */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Кальянный ассистент · <span className="font-medium text-foreground">Старший: {master.name}</span>
          </span>
          <span className="hidden sm:inline">
            🍃 AI-учёт табака · powered by Z.ai
          </span>
        </div>
      </footer>
    </div>
  )
}
