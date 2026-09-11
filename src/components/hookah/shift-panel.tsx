'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShiftsResponse } from '@/lib/types'
import { formatHHMM, shiftDuration } from '@/lib/master-utils'
import { Plus, Undo, Play, Square, Loader2, Cigarette } from 'lucide-react'
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
      toast.success('Смена открыта')
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
      toast.success('Смена закрыта')
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
        toast.success(`+1 кальян · итого ${d.count}`)
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
        <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground text-xs font-mono uppercase tracking-tight">
          <Loader2 className="h-3 w-3 animate-spin" /> Загрузка смены...
        </CardContent>
      </Card>
    )
  }

  const myShift = data?.myShift ?? null

  // Нет открытой смены
  if (!myShift) {
    return (
      <Card className="frame-ink">
        <CardContent className="p-8 flex flex-col items-start text-left gap-6">
          <div className="flex items-center gap-2 label-mono">
            <span className="h-[6px] w-[6px] bg-ink-faint inline-block" />
            Нет открытой смены
          </div>
          <div>
            <h2
              className="heading-mono text-foreground leading-none"
              style={{ fontSize: 'clamp(24px, 4vw, 32px)' }}
            >
              Открыть смену
            </h2>
            <p className="body-sans text-sm text-ink-soft mt-2">
              {masterName}, открой смену, чтобы считать кальяны.
            </p>
          </div>

          <Button
            size="lg"
            className="h-12 px-6 text-sm"
            disabled={busy}
            onClick={openShift}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Открыть смену
          </Button>

          <p className="label-mono">/shift — в любое время</p>
        </CardContent>
      </Card>
    )
  }

  // Смена открыта
  return (
    <Card className="frame">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 label-mono">
            <span className="relative flex h-[6px] w-[6px]">
              <span className="animate-ping absolute inline-flex h-full w-full bg-[#dc2f02] opacity-75" />
              <span className="relative inline-flex h-[6px] w-[6px] bg-[#dc2f02]" />
            </span>
            <span className="text-[#dc2f02]">На смене</span>
          </div>
          <span className="label-mono">
            С {formatHHMM(myShift.openedAt)} · {shiftDuration(myShift.openedAt)}
          </span>
        </div>

        {/* Счётчик */}
        <div className="px-6 pb-6 border-b border-border">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col">
              <span className="label-mono mb-2">Кальянов</span>
              <span
                className="font-mono font-bold leading-none text-foreground tabular-nums"
                style={{ fontSize: 'clamp(56px, 12vw, 96px)' }}
              >
                {myShift.hookahCount}
              </span>
            </div>
            <Cigarette className="h-6 w-6 text-ink-faint mb-2" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex">
          <Button
            size="lg"
            className="flex-1 h-16 rounded-none border-0 border-r border-border bg-[#dc2f02] text-white hover:bg-[#dc2f02]/85 text-sm"
            disabled={busy}
            onClick={() => addHookah('add')}
          >
            <Plus className="h-5 w-5" /> Кальян
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1 h-16 rounded-none border-0 text-sm"
            disabled={busy || myShift.hookahCount === 0}
            onClick={() => addHookah('undo')}
            title="Отменить последний кальян"
          >
            <Undo className="h-5 w-5" /> Отменить
          </Button>
        </div>

        {/* Close */}
        <div className="p-4">
          <Button
            variant="outline"
            className="w-full h-10 text-xs"
            disabled={busy}
            onClick={closeShift}
          >
            <Square className="h-3.5 w-3.5" /> Закрыть смену
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
