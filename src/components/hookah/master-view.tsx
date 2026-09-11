'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShiftPanel } from '@/components/hookah/shift-panel'
import { MasterRequests } from '@/components/hookah/master-requests'
import { WishesPanel } from '@/components/hookah/wishes-panel'
import { AIChat } from '@/components/hookah/ai-chat'
import { Tobacco } from '@/lib/types'
import { masterAvatarClass, initials } from '@/lib/master-utils'
import {
  MessageCircle,
  ShoppingCart,
  Star,
  Package,
  LogOut,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface MasterViewProps {
  master: { id: string; name: string; role: 'SENIOR' | 'REGULAR'; color: string }
  onLogout: () => void
}

export function MasterView({ master, onLogout }: MasterViewProps) {
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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-[60px] flex items-center gap-4">
          <div
            className={`h-9 w-9 shrink-0 ${masterAvatarClass(
              master.color,
            )} flex items-center justify-center text-xs font-mono font-bold uppercase text-white`}
          >
            {initials(master.name)}
          </div>
          <div className="flex-1 min-w-0">
            <span className="label-mono">Привет,</span>
            <h1 className="font-mono uppercase font-bold tracking-tight text-sm sm:text-base leading-tight truncate text-foreground">
              {master.name}
            </h1>
          </div>
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
            {/* Смена — всегда сверху */}
            <ShiftPanel
              refreshKey={refreshKey}
              onRefresh={refresh}
              masterName={master.name}
            />

            {/* Табы */}
            <Tabs defaultValue="requests" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-auto">
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
              </TabsList>

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
                <MasterStockReadOnly refreshKey={refreshKey} />
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
            className="lg:hidden fixed bottom-20 right-4 z-40 h-12 w-12 bg-[#dc2f02] hover:bg-[#dc2f02]/85"
            size="icon"
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
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex items-center justify-between text-[11px] text-ink-faint font-mono uppercase tracking-tight">
          <span>
            Кальянный ассистент · <span className="font-bold text-foreground">{master.name}</span>
          </span>
          <span className="hidden sm:inline">удачной смены</span>
        </div>
      </footer>
    </div>
  )
}

// Read-only склад для обычного мастера
function MasterStockReadOnly({ refreshKey }: { refreshKey: number }) {
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tobaccos')
      const data = await res.json()
      setTobaccos(data.tobaccos ?? [])
    } catch {
      toast.error('Не удалось загрузить остатки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const lowCount = tobaccos.filter((t) => t.isLow).length

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">Инвентарь</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Остатки склада
          </h2>
        </div>
        <Button size="icon" variant="outline" onClick={load} title="Обновить">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="label-mono">Позиций</span>
            <Package className="h-3.5 w-3.5 text-ink-faint" />
          </div>
          <span
            className="font-mono font-bold leading-none tabular-nums text-foreground"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
          >
            {tobaccos.length}
          </span>
        </div>
        <div className={`border ${lowCount > 0 ? 'frame' : 'border-border'} p-4 flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="label-mono">Мало</span>
            <AlertTriangle className={`h-3.5 w-3.5 ${lowCount > 0 ? 'text-[#dc2f02]' : 'text-ink-faint'}`} />
          </div>
          <span
            className="font-mono font-bold leading-none tabular-nums text-foreground"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
          >
            {lowCount}
          </span>
        </div>
      </div>

      <div className="border border-border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs font-mono uppercase tracking-tight flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : tobaccos.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            Справочник пуст.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div>
              {tobaccos.map((t) => {
                const percent = Math.min(
                  100,
                  Math.round((t.currentGrams / t.defaultJarGrams) * 100),
                )
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-4 p-4 border-b border-border last:border-b-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-mono uppercase text-sm font-bold tracking-tight truncate">
                          {t.brand}
                        </span>
                        <span className="font-sans text-xs text-ink-soft truncate">
                          {t.line}
                        </span>
                        <span className="font-sans text-sm truncate">{t.flavor}</span>
                        {t.isLow && (
                          <Badge className="border-[#dc2f02] text-[#dc2f02] bg-transparent">
                            мало
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <Progress
                          value={percent}
                          className={`h-[2px] flex-1 ${t.isLow ? '[&>[data-slot=progress-indicator]]:bg-[#dc2f02]' : ''}`}
                        />
                        <span className="text-[11px] text-ink-faint font-mono tabular-nums whitespace-nowrap">
                          {t.currentGrams} / {t.defaultJarGrams}г
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
