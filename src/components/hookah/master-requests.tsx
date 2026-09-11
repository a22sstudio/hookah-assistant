'use client'

import { useEffect, useState, useCallback } from 'react'
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
  PENDING: 'border-[#dc2f02] text-[#dc2f02] bg-transparent',
  ORDERED: 'border-foreground text-foreground bg-transparent',
  DONE: 'border-border text-ink-faint bg-transparent',
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
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">{isSenior ? 'Все заявки' : 'Мои заявки'}</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            {isSenior ? 'Заявки мастеров' : 'Заявки на закуп'}
          </h2>
        </div>
      </div>

      {/* Форма добавления (только для обычных мастеров) */}
      {!isSenior && (
        <div className="frame p-5 space-y-3">
          <div className="flex items-center gap-2 label-mono">
            <Package className="h-3.5 w-3.5" />
            Новая заявка
          </div>
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
            className="w-full"
            disabled={!text.trim() || submitting}
            onClick={submit}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Отправить старшему
          </Button>
        </div>
      )}

      {/* Сводка для старшего */}
      {isSenior && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className={`border ${pendingCount > 0 ? 'frame' : 'border-border'} p-4 flex items-center gap-3`}>
            <Inbox className={`h-4 w-4 ${pendingCount > 0 ? 'text-[#dc2f02]' : 'text-ink-faint'}`} />
            <div>
              <p className="text-2xl font-mono font-bold leading-none tabular-nums text-foreground">{pendingCount}</p>
              <p className="label-mono mt-1">ожидают</p>
            </div>
          </div>
          <div className="border border-border p-4 flex items-center gap-3">
            <ShoppingCart className="h-4 w-4 text-ink-faint" />
            <div>
              <p className="text-2xl font-mono font-bold leading-none tabular-nums text-foreground">{orderedCount}</p>
              <p className="label-mono mt-1">заказано</p>
            </div>
          </div>
        </div>
      )}

      {/* Список заявок */}
      <div className="border border-border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs font-mono uppercase tracking-tight flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {isSenior
              ? 'Заявок от мастеров пока нет.'
              : 'Ты ещё не оставил заявок.'}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div>
              {items.map((r) => {
                const next = NEXT_STATUS[r.status]
                const NextIcon = NEXT_ICON[r.status]
                return (
                  <div
                    key={r.id}
                    className="p-4 border-b border-border last:border-b-0 space-y-2"
                  >
                    <div className="flex items-start gap-3">
                      {/* Аватар мастера — только для старшего */}
                      {isSenior && (
                        <div
                          className={`mt-0.5 h-9 w-9 shrink-0 ${masterAvatarClass(
                            r.master.color,
                          )} flex items-center justify-center text-[10px] font-mono font-bold uppercase text-white`}
                        >
                          {initials(r.master.name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {isSenior && (
                          <div className="text-[11px] font-mono uppercase tracking-tight text-ink-soft mb-1">
                            {r.master.name}
                            {r.isMine && (
                              <span className="ml-1.5 text-[#dc2f02]">· ты</span>
                            )}
                          </div>
                        )}
                        <p className="body-sans text-sm break-words">{r.text}</p>
                        {r.grams != null && (
                          <p className="text-[11px] text-ink-faint mt-1 font-mono uppercase tracking-tight">
                            Нужно: <span className="text-foreground font-bold">{r.grams}г</span>
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                            {REQUEST_STATUS_LABELS[r.status]}
                          </Badge>
                          <span className="text-[10px] text-ink-faint font-mono uppercase tracking-tight">
                            {timeAgo(r.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isSenior && next && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] ml-12"
                        disabled={updatingId === r.id}
                        onClick={() => changeStatus(r.id, next)}
                      >
                        {updatingId === r.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <NextIcon className="h-3 w-3" />
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
      </div>
    </div>
  )
}
