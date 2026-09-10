'use client'

import { useEffect, useState, useCallback } from 'react'
import { Operation, OPERATION_LABELS, SOURCE_LABELS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, ArrowUpRight, ArrowDownRight, Edit3 } from 'lucide-react'
import { toast } from 'sonner'

const TYPE_STYLES: Record<Operation['type'], string> = {
  INCOMING: 'text-emerald-600 dark:text-emerald-400',
  ADJUSTMENT: 'text-sky-600 dark:text-sky-400',
  ORDER: 'text-amber-600 dark:text-amber-400',
  CORRECTION: 'text-violet-600 dark:text-violet-400',
}

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
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">История операций</CardTitle>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Загрузка...
          </div>
        ) : operations.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Пока нет операций
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="divide-y">
              {operations.map((op) => {
                const isPositive = op.delta > 0
                const Icon =
                  op.type === 'INCOMING'
                    ? ArrowUpRight
                    : op.type === 'ORDER'
                      ? ArrowDownRight
                      : Edit3
                return (
                  <div key={op.id} className="flex items-start gap-3 p-3">
                    <div
                      className={`rounded-lg p-1.5 mt-0.5 ${op.type === 'INCOMING' ? 'bg-emerald-100 dark:bg-emerald-950' : op.type === 'ORDER' ? 'bg-amber-100 dark:bg-amber-950' : 'bg-muted'}`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${TYPE_STYLES[op.type]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {op.tobacco
                            ? `${op.tobacco.brand} ${op.tobacco.flavor}`
                            : '—'}
                        </span>
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                          {OPERATION_LABELS[op.type]}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span className={TYPE_STYLES[op.type]}>
                          {op.gramsBefore}г → {op.gramsAfter}г
                        </span>
                        <span className="mx-1">·</span>
                        {SOURCE_LABELS[op.source]}
                        {op.note && (
                          <>
                            <span className="mx-1">·</span>
                            <span className="italic">{op.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatTime(op.createdAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
