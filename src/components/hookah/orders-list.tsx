'use client'

import { useEffect, useState, useCallback } from 'react'
import { Order, ORDER_STATUS_LABELS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, ShoppingCart, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_STYLE: Record<Order['status'], string> = {
  PENDING: 'border-ember text-ember bg-transparent',
  ORDERED: 'border-foreground text-foreground bg-transparent',
  RECEIVED: 'border-border text-muted-foreground bg-transparent',
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Clock; accent?: boolean }) {
  return (
    <div className={`border rounded-md p-4 flex flex-col gap-3 shadow-sm-soft transition-base ${accent ? 'frame-ember' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-ember' : 'text-muted-foreground/70'}`} />
      </div>
      <span
        className="font-mono font-bold leading-none tabular text-foreground"
        style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
      >
        {value}
      </span>
    </div>
  )
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
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">Закупки</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Заявки на закуп
          </h2>
        </div>
        <Button size="icon" variant="outline" onClick={load} title="Обновить">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Ожидают" value={pending.length} icon={Clock} accent={pending.length > 0} />
        <StatCard label="Заказано" value={ordered.length} icon={ShoppingCart} />
        <StatCard label="Получено" value={received.length} icon={CheckCircle2} />
      </div>

      {/* Список заявок */}
      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono">
            Загрузка...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            Заявок пока нет. Скажите ассистенту «напиши чего осталось мало».
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="stagger-children">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="p-4 border-b border-border last:border-b-0 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono uppercase text-sm font-bold tracking-tight truncate">
                        {o.tobacco
                          ? `${o.tobacco.brand} ${o.tobacco.line} ${o.tobacco.flavor}`
                          : '—'}
                      </div>
                      <div className="label-mono-sm mt-1">
                        Нужно: <span className="text-foreground font-bold">{o.gramsRequested}г</span>
                        {o.tobacco && (
                          <> · сейчас: <span className="text-foreground font-bold">{o.tobacco.currentGrams}г</span></>
                        )}
                      </div>
                      {o.note && (
                        <div className="text-sm text-muted-foreground italic mt-2 body-sans">
                          {o.note}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[o.status]}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </Badge>
                  </div>
                  {o.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      onClick={() => updateStatus(o.id, 'ORDERED')}
                    >
                      <ShoppingCart className="h-3 w-3" /> Заказал
                    </Button>
                  )}
                  {o.status === 'ORDERED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      onClick={() => updateStatus(o.id, 'RECEIVED')}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Получено
                    </Button>
                  )}
                  <div className="label-mono-sm">
                    {formatTime(o.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
