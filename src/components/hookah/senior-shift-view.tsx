'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ShiftInfo, ShiftsResponse } from '@/lib/types'
import { masterAvatarClass, masterColorClasses, shiftDurationShort, formatHHMM, initials } from '@/lib/master-utils'
import { Users, Cigarette, Loader2, Cigarette as CigIcon } from 'lucide-react'

interface SeniorShiftViewProps {
  refreshKey: number
  onRefresh: () => void
}

export function SeniorShiftView({ refreshKey, onRefresh }: SeniorShiftViewProps) {
  const [data, setData] = useState<ShiftsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shifts')
      if (!res.ok) return
      const d: ShiftsResponse = await res.json()
      setData(d)
    } catch {
      // тихо
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // авто-рефреш каждые 10 секунд
  useEffect(() => {
    const t = setInterval(() => {
      setTick((x) => x + 1)
      void load()
    }, 10000)
    return () => clearInterval(t)
  }, [load])

  // тикер для обновления длительности смены
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // подавляем неиспользуемое предупреждение
  void tick
  void onRefresh

  const shifts = data?.shifts ?? []
  const totalHookahs = shifts.reduce((sum, s) => sum + s.hookahCount, 0)

  if (loading && !data) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка смен...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Live индикатор */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          live · обновление каждые 10с
        </div>
      </div>

      {/* Сводные карточки */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950 p-2">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{shifts.length}</p>
              <p className="text-xs text-muted-foreground mt-1">мастеров на смене</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-sky-100 dark:bg-sky-950 p-2">
              <Cigarette className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{totalHookahs}</p>
              <p className="text-xs text-muted-foreground mt-1">всего кальянов</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 dark:bg-violet-950 p-2">
              <CigIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">
                {shifts.length > 0
                  ? Math.round(totalHookahs / shifts.length)
                  : 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">ср. на мастера</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Список смен */}
      {shifts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Никого на смене</p>
            <p className="text-sm mt-1">Когда мастера откроют смены, они появятся здесь</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {shifts.map((s: ShiftInfo) => (
            <ShiftCard key={s.id} shift={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function ShiftCard({ shift }: { shift: ShiftInfo }) {
  const classes = masterColorClasses(shift.masterColor)
  const isMine = shift.isMine

  return (
    <Card
      className={`overflow-hidden ${isMine ? 'ring-2 ' + classes.ring : ''}`}
    >
      <div className={`h-1 ${classes.bg}`} />
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-12 w-12 shrink-0 rounded-full ${masterAvatarClass(
              shift.masterColor,
            )} flex items-center justify-center text-sm font-bold text-white shadow-sm`}
          >
            {initials(shift.masterName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold truncate">{shift.masterName}</p>
              {shift.masterRole === 'SENIOR' && (
                <span className="text-[9px] rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-1 py-0.5 font-bold">
                  СТАРШИЙ
                </span>
              )}
              {isMine && (
                <span className={`text-[9px] rounded ${classes.soft} ${classes.text} px-1 py-0.5 font-bold`}>
                  ВЫ
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              на смене с {formatHHMM(shift.openedAt)} · {shiftDurationShort(shift.openedAt)}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold tabular-nums leading-none ${classes.text}`}>
              {shift.hookahCount}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">кальянов</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
