'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useEffect, useCallback } from 'react'

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
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div
            className={`h-9 w-9 shrink-0 rounded-full ${masterAvatarClass(
              master.color,
            )} flex items-center justify-center text-xs font-bold text-white`}
          >
            {initials(master.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground leading-none">Привет,</p>
            <h1 className="font-bold text-base sm:text-lg leading-tight truncate">
              {master.name} 👋
            </h1>
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
          <div className="min-w-0 space-y-4">
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
                  className="flex flex-col gap-1 py-2 text-xs sm:text-sm sm:flex-row sm:gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>Заявки</span>
                </TabsTrigger>
                <TabsTrigger
                  value="wishes"
                  className="flex flex-col gap-1 py-2 text-xs sm:text-sm sm:flex-row sm:gap-2"
                >
                  <Star className="h-4 w-4" />
                  <span>Хотелки</span>
                </TabsTrigger>
                <TabsTrigger
                  value="stock"
                  className="flex flex-col gap-1 py-2 text-xs sm:text-sm sm:flex-row sm:gap-2"
                >
                  <Package className="h-4 w-4" />
                  <span>Склад</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="requests">
                <MasterRequests
                  role="REGULAR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="wishes">
                <WishesPanel
                  role="REGULAR"
                  refreshKey={refreshKey}
                  onRefresh={refresh}
                />
              </TabsContent>
              <TabsContent value="stock">
                <MasterStockReadOnly refreshKey={refreshKey} />
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
            Кальянный ассистент · <span className="font-medium text-foreground">{master.name}</span>
          </span>
          <span className="hidden sm:inline">🍃 удачной смены</span>
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950 p-2">
              <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{tobaccos.length}</p>
              <p className="text-xs text-muted-foreground mt-1">позиций</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-950 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{lowCount}</p>
              <p className="text-xs text-muted-foreground mt-1">заканчивается</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Остатки на складе</CardTitle>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
            </div>
          ) : tobaccos.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Справочник пуст
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {tobaccos.map((t) => {
                  const percent = Math.min(
                    100,
                    Math.round((t.currentGrams / t.defaultJarGrams) * 100),
                  )
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate text-sm">
                            {t.brand}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {t.line}
                          </span>
                          <span className="text-sm truncate">{t.flavor}</span>
                          {t.isLow && (
                            <Badge
                              variant="outline"
                              className="text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 text-[10px]"
                            >
                              мало
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Progress value={percent} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
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
        </CardContent>
      </Card>
    </div>
  )
}
