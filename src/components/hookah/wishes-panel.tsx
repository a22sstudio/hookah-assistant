'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Wish, WISH_STATUS_LABELS } from '@/lib/types'
import { masterAvatarClass, timeAgo, initials } from '@/lib/master-utils'
import { Send, Loader2, Star, CheckCircle2, Inbox } from 'lucide-react'
import { toast } from 'sonner'

interface WishesPanelProps {
  role: 'SENIOR' | 'REGULAR'
  refreshKey: number
  onRefresh: () => void
}

const STATUS_STYLE: Record<Wish['status'], string> = {
  PENDING: 'border-ember text-ember bg-transparent',
  DONE: 'border-border text-muted-foreground bg-transparent',
}

export function WishesPanel({ role, refreshKey, onRefresh }: WishesPanelProps) {
  const [items, setItems] = useState<Wish[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const isSenior = role === 'SENIOR'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = isSenior ? '/api/wishes' : '/api/wishes?mine=1'
      const res = await fetch(url)
      if (!res.ok) return
      const d = await res.json()
      setItems(d.wishes ?? [])
    } catch {
      toast.error('Не удалось загрузить хотелки')
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
      const res = await fetch('/api/wishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success('Хотелка отправлена')
      setText('')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmitting(false)
    }
  }

  const markDone = async (id: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/wishes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'DONE' }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success('Отмечено выполненным')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setUpdatingId(null)
    }
  }

  const pendingCount = items.filter((w) => w.status === 'PENDING').length

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">{isSenior ? 'Все хотелки' : 'Мои хотелки'}</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            {isSenior ? 'Хотелки мастеров' : 'Хотелки'}
          </h2>
        </div>
      </div>

      {/* Форма добавления (только для обычных мастеров) */}
      {!isSenior && (
        <div className="frame p-5 space-y-3 rounded-md shadow-sm-soft">
          <div className="flex items-center gap-2 label-mono">
            <Star className="h-3.5 w-3.5 text-ember" />
            Оставить хотелку
          </div>
          <Textarea
            placeholder="Например: хочу новый шланг, уголь побольше, или tobacco extractor..."
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
            Отправить
          </Button>
        </div>
      )}

      {/* Сводка для старшего */}
      {isSenior && items.length > 0 && (
        <div className={`border rounded-md p-4 flex items-center gap-3 shadow-sm-soft transition-base ${pendingCount > 0 ? 'frame-ember' : 'border-border'}`}>
          <Inbox className={`h-4 w-4 ${pendingCount > 0 ? 'text-ember' : 'text-muted-foreground/70'}`} />
          <div>
            <p className="text-2xl font-mono font-bold leading-none tabular text-foreground">{pendingCount}</p>
            <p className="label-mono mt-1">активных хотелок</p>
          </div>
        </div>
      )}

      {/* Список */}
      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {isSenior ? 'Хотелок пока нет.' : 'Ты ещё ничего не попросил.'}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="stagger-children">
              {items.map((w) => (
                <div
                  key={w.id}
                  className="p-4 border-b border-border last:border-b-0 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    {isSenior && (
                      <div
                        className={`mt-0.5 h-9 w-9 shrink-0 ${masterAvatarClass(
                          w.master.color,
                        )} flex items-center justify-center text-[10px] font-mono font-bold text-white rounded-md`}
                      >
                        {initials(w.master.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {isSenior && (
                        <div className="label-mono-sm mb-1">
                          {w.master.name}
                          {w.isMine && (
                            <span className="ml-1.5 text-ember">· ты</span>
                          )}
                        </div>
                      )}
                      <p className="body-sans text-sm break-words">{w.text}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className={STATUS_STYLE[w.status]}>
                          {WISH_STATUS_LABELS[w.status]}
                        </Badge>
                        <span className="label-mono-sm">
                          {timeAgo(w.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isSenior && w.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] ml-12"
                      disabled={updatingId === w.id}
                      onClick={() => markDone(w.id)}
                    >
                      {updatingId === w.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Выполнено
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
