'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
// (Tooltip не нужен — кнопка всегда активна)
import { ShiftsResponse } from '@/lib/types'
import { formatHHMM, shiftDuration } from '@/lib/master-utils'
import { Plus, Undo, Play, Square, Clock, Loader2, Cigarette } from 'lucide-react'
import { toast } from 'sonner'

interface ShiftPanelProps {
  refreshKey: number
  onRefresh: () => void
  masterName: string
}

export function ShiftPanel({ refreshKey, onRefresh, masterName }: ShiftPanelProps) {
  const [data, setData] = useState<ShiftsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shifts')
      if (res.status === 401) return
      const d: ShiftsResponse = await res.json()
      setData(d)
    } catch {
      toast.error('Не удалось загрузить смену')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const openShift = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Не удалось открыть смену')
        return
      }
      toast.success('Смена открыта! Удачной работы 🍃')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setBusy(false)
    }
  }

  const closeShift = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/shifts', { method: 'PATCH' })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Не удалось закрыть смену')
        return
      }
      toast.success('Смена закрыта. Отдыхай!')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setBusy(false)
    }
  }

  const addHookah = async (action: 'add' | 'undo') => {
    setBusy(true)
    try {
      const res = await fetch('/api/shifts/hookah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      if (action === 'add') {
        toast.success(`+1 кальян · итого ${d.count}`, {
          icon: '🚬',
        })
      } else {
        toast(`−1 кальян · итого ${d.count}`)
      }
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка смены...
        </CardContent>
      </Card>
    )
  }

  const myShift = data?.myShift ?? null

  // Нет открытой смены
  if (!myShift) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6 flex flex-col items-center text-center gap-4">
          <div className="rounded-full bg-muted p-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Смена не открыта</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {masterName}, открой смену, чтобы считать кальяны
            </p>
          </div>

          <Button
            size="lg"
            className="h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-base"
            disabled={busy}
            onClick={openShift}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Play className="h-5 w-5 mr-2" />
            )}
            Открыть смену
          </Button>

          <p className="text-xs text-muted-foreground">
            Смену можно открыть в любое время
          </p>
        </CardContent>
      </Card>
    )
  }

  // Смена открыта
  return (
    <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              НА СМЕНЕ
            </div>
            <p className="text-sm text-muted-foreground mt-1.5">
              С {formatHHMM(myShift.openedAt)} · {shiftDuration(myShift.openedAt)}
            </p>
          </div>
          <div className="text-right">
            <Cigarette className="h-5 w-5 text-emerald-600 dark:text-emerald-400 inline" />
          </div>
        </div>

        <div className="mt-4 flex items-end justify-center gap-2">
          <span className="text-6xl font-bold tabular-nums leading-none text-emerald-700 dark:text-emerald-400">
            {myShift.hookahCount}
          </span>
          <span className="text-lg text-muted-foreground mb-1.5">кальянов</span>
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            size="lg"
            className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-base font-semibold"
            disabled={busy}
            onClick={() => addHookah('add')}
          >
            <Plus className="h-5 w-5 mr-1.5" /> Кальян
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 px-4"
            disabled={busy || myShift.hookahCount === 0}
            onClick={() => addHookah('undo')}
            title="Отменить последний кальян"
          >
            <Undo className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <CardContent className="p-3">
        <Button
          variant="outline"
          className="w-full h-10"
          disabled={busy}
          onClick={closeShift}
        >
          <Square className="h-4 w-4 mr-2" /> Закрыть смену
        </Button>
      </CardContent>
    </Card>
  )
}
