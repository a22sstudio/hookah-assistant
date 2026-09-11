'use client'

import { useEffect, useState, useCallback } from 'react'
import { Operation, OPERATION_LABELS, SOURCE_LABELS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowUpRight, ArrowDownRight, Edit3, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface OperationsListProps {
  refreshKey: number
}

export function OperationsList({ refreshKey }: OperationsListProps) {
  const [operations, setOperations] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/operations?limit=100')
      const data = await res.json()
      setOperations(data.operations ?? [])
    } catch {
      toast.error('Не удалось загрузить историю')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">Лог</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            История операций
          </h2>
        </div>
        <Button size="icon" variant="outline" onClick={load} title="Обновить">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono">
            Загрузка...
          </div>
        ) : operations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            Пока нет операций.
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="stagger-children">
              {operations.map((op) => {
                const isIncoming = op.type === 'INCOMING'
                const Icon =
                  op.type === 'INCOMING'
                    ? ArrowUpRight
                    : op.type === 'ORDER'
                      ? ArrowDownRight
                      : Edit3
                const deltaLabel =
                  op.delta > 0 ? `+${op.delta}г` : `${op.delta}г`
                return (
                  <div
                    key={op.id}
                    className="group flex items-start gap-4 p-4 border-b border-border last:border-b-0 hover:bg-muted/50 transition-base transition-colors"
                  >
                    <div
                      className={`mt-0.5 flex items-center justify-center h-7 w-7 shrink-0 border rounded-sm ${
                        isIncoming
                          ? 'border-ember text-ember'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-mono uppercase text-sm font-bold tracking-tight truncate">
                          {op.tobacco ? `${op.tobacco.brand} ${op.tobacco.flavor}` : '—'}
                        </span>
                        <span className="label-mono">{OPERATION_LABELS[op.type]}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 label-mono-sm">
                        <span className={isIncoming ? 'text-ember' : 'text-muted-foreground'}>
                          {op.gramsBefore}г → {op.gramsAfter}г
                        </span>
                        <span className="text-muted-foreground/70">·</span>
                        <span>{SOURCE_LABELS[op.source]}</span>
                        {op.note && (
                          <>
                            <span className="text-muted-foreground/70">·</span>
                            <span className="italic text-muted-foreground">{op.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-mono text-sm font-bold tabular text-foreground">
                        {deltaLabel}
                      </span>
                      <span className="label-mono-sm whitespace-nowrap">
                        {formatTime(op.createdAt)}
                      </span>
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
