'use client'

import { useEffect, useState, useCallback } from 'react'
import { Order, ORDER_STATUS_LABELS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, ShoppingCart, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_STYLE: Record<Order['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400',
  ORDERED: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-400',
  RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface OrdersListProps {
  refreshKey: number
  onRefresh: () => void
}

export function OrdersList({ refreshKey, onRefresh }: OrdersListProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/orders')
      const data = await res.json()
      setOrders(data.orders ?? [])
    } catch {
      toast.error('Не удалось загрузить заявки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const updateStatus = async (id: string, status: Order['status']) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) {
        toast.success(`Статус: ${ORDER_STATUS_LABELS[status]}`)
        load()
        onRefresh()
      }
    } catch {
      toast.error('Ошибка обновления')
    }
  }

  const pending = orders.filter((o) => o.status === 'PENDING')
  const ordered = orders.filter((o) => o.status === 'ORDERED')
  const received = orders.filter((o) => o.status === 'RECEIVED')

  return (
    <div className="space-y-4">
      {/* Сводка */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Ожидают</span>
            </div>
            <p className="text-2xl font-bold">{pending.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-sky-600" />
              <span className="text-xs text-muted-foreground">Заказано</span>
            </div>
            <p className="text-2xl font-bold">{ordered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground">Получено</span>
            </div>
            <p className="text-2xl font-bold">{received.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Заявки на закуп</CardTitle>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Загрузка...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Заявок пока нет. Скажите ассистенту «напиши чего осталось мало».
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {orders.map((o) => (
                  <div key={o.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {o.tobacco
                            ? `${o.tobacco.brand} ${o.tobacco.line} ${o.tobacco.flavor}`
                            : '—'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Нужно: <span className="font-medium">{o.gramsRequested}г</span>
                          {o.tobacco && (
                            <> · сейчас: {o.tobacco.currentGrams}г</>
                          )}
                        </div>
                        {o.note && (
                          <div className="text-xs text-muted-foreground italic mt-1">
                            {o.note}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[o.status]}`}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </Badge>
                    </div>
                    {o.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => updateStatus(o.id, 'ORDERED')}
                      >
                        <ShoppingCart className="h-3 w-3 mr-1" /> Заказал
                      </Button>
                    )}
                    {o.status === 'ORDERED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => updateStatus(o.id, 'RECEIVED')}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Получено
                      </Button>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      {formatTime(o.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
