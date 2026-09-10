'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MasterRequest, REQUEST_STATUS_LABELS } from '@/lib/types'
import { masterAvatarClass, timeAgo, initials } from '@/lib/master-utils'
import { Send, Loader2, Inbox, ShoppingCart, CheckCircle2, Package } from 'lucide-react'
import { toast } from 'sonner'

interface MasterRequestsProps {
  role: 'SENIOR' | 'REGULAR'
  refreshKey: number
  onRefresh: () => void
}

const STATUS_STYLE: Record<MasterRequest['status'], string> = {
  PENDING:
    'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400',
  ORDERED:
    'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-400',
  DONE:
    'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400',
}

const NEXT_STATUS: Record<MasterRequest['status'], MasterRequest['status'] | null> = {
  PENDING: 'ORDERED',
  ORDERED: 'DONE',
  DONE: null,
}

const NEXT_LABEL: Record<MasterRequest['status'], string> = {
  PENDING: 'Заказать',
  ORDERED: 'Получено',
  DONE: '',
}

const NEXT_ICON = {
  PENDING: ShoppingCart,
  ORDERED: CheckCircle2,
  DONE: CheckCircle2,
}

export function MasterRequests({ role, refreshKey, onRefresh }: MasterRequestsProps) {
  const [items, setItems] = useState<MasterRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const isSenior = role === 'SENIOR'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = isSenior ? '/api/requests' : '/api/requests?mine=1'
      const res = await fetch(url)
      if (!res.ok) return
      const d = await res.json()
      setItems(d.requests ?? [])
    } catch {
      toast.error('Не удалось загрузить заявки')
    } finally {
      setLoading(false)
    }
  }, [isSenior])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const submit = async () => {
    const t = text.trim()
    if (!t) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success('Заявка отправлена старшему')
      setText('')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmitting(false)
    }
  }

  const changeStatus = async (id: string, status: MasterRequest['status']) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success(`Статус: ${REQUEST_STATUS_LABELS[status]}`)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setUpdatingId(null)
    }
  }

  const pendingCount = items.filter((r) => r.status === 'PENDING').length
  const orderedCount = items.filter((r) => r.status === 'ORDERED').length

  return (
    <div className="space-y-4">
      {/* Форма добавления (только для обычных мастеров) */}
      {!isSenior && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-600" />
              Новая заявка на закуп
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Что закупить? Например: BlackBurn Energy 2 банки, угли Cocourth 26мм..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void submit()
                }
              }}
            />
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={!text.trim() || submitting}
              onClick={submit}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Отправить старшему
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Сводка для старшего */}
      {isSenior && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-950 p-2">
                <Inbox className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-1">ожидают</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-sky-100 dark:bg-sky-950 p-2">
                <ShoppingCart className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{orderedCount}</p>
                <p className="text-xs text-muted-foreground mt-1">заказано</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Список заявок */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isSenior ? 'Заявки мастеров' : 'Мои заявки'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {isSenior
                ? 'Заявок от мастеров пока нет'
                : 'Ты ещё не оставил заявок'}
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {items.map((r) => {
                  const next = NEXT_STATUS[r.status]
                  const NextIcon = NEXT_ICON[r.status]
                  return (
                    <div key={r.id} className="p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        {/* Аватар мастера — только для старшего */}
                        {isSenior && (
                          <div
                            className={`mt-0.5 h-8 w-8 shrink-0 rounded-full ${masterAvatarClass(
                              r.master.color,
                            )} flex items-center justify-center text-[10px] font-bold text-white`}
                          >
                            {initials(r.master.name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {isSenior && (
                            <div className="text-xs font-medium text-muted-foreground mb-0.5">
                              {r.master.name}
                              {r.isMine && (
                                <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                                  · ты
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-sm break-words">{r.text}</p>
                          {r.grams != null && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Нужно: <span className="font-medium">{r.grams}г</span>
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[r.status]}`}>
                              {REQUEST_STATUS_LABELS[r.status]}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {timeAgo(r.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isSenior && next && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs ml-11"
                          disabled={updatingId === r.id}
                          onClick={() => changeStatus(r.id, next)}
                        >
                          {updatingId === r.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <NextIcon className="h-3 w-3 mr-1" />
                          )}
                          {NEXT_LABEL[r.status]}
                        </Button>
                      )}
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
