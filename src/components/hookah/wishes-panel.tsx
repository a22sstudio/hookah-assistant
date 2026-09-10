'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  PENDING:
    'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400',
  DONE:
    'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400',
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
    <div className="space-y-4">
      {/* Форма добавления (только для обычных мастеров) */}
      {!isSenior && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-violet-500" />
              Оставить хотелку
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Например: хочу новый шланг, уголь побольше, или烟草 extractor..."
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
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={!text.trim() || submitting}
              onClick={submit}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Отправить
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Сводка для старшего */}
      {isSenior && items.length > 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-950 p-2">
              <Inbox className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{pendingCount}</p>
              <p className="text-xs text-muted-foreground mt-1">активных хотелок</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Список */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isSenior ? 'Хотелки мастеров' : 'Мои хотелки'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {isSenior ? 'Хотелок пока нет' : 'Ты ещё ничего не попросил'}
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {items.map((w) => (
                  <div key={w.id} className="p-3 space-y-2">
                    <div className="flex items-start gap-3">
                      {isSenior && (
                        <div
                          className={`mt-0.5 h-8 w-8 shrink-0 rounded-full ${masterAvatarClass(
                            w.master.color,
                          )} flex items-center justify-center text-[10px] font-bold text-white`}
                        >
                          {initials(w.master.name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {isSenior && (
                          <div className="text-xs font-medium text-muted-foreground mb-0.5">
                            {w.master.name}
                            {w.isMine && (
                              <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                                · ты
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-sm break-words">{w.text}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[w.status]}`}>
                            {WISH_STATUS_LABELS[w.status]}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {timeAgo(w.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isSenior && w.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs ml-11"
                        disabled={updatingId === w.id}
                        onClick={() => markDone(w.id)}
                      >
                        {updatingId === w.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        Выполнено
                      </Button>
                    )}
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
