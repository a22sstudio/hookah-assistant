'use client'

import { useEffect, useState, useCallback } from 'react'
import { ShiftInfo, ShiftsResponse } from '@/lib/types'
import { masterAvatarClass, masterColorClasses, shiftDurationShort, formatHHMM, initials } from '@/lib/master-utils'
import { Users, Cigarette, Loader2, Cigarette as CigIcon } from 'lucide-react'

interface SeniorShiftViewProps {
  refreshKey: number
  onRefresh: () => void
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Users; accent?: boolean }) {
  return (
    <div className={`border rounded-md p-5 flex flex-col gap-3 shadow-sm-soft transition-base ${accent ? 'frame-ember' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? 'text-ember' : 'text-muted-foreground/70'}`} />
      </div>
      <span
        className="font-mono font-bold leading-none tabular text-foreground"
        style={{ fontSize: 'clamp(40px, 6vw, 56px)' }}
      >
        {value}
      </span>
    </div>
  )
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
      <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Загрузка смен...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Заголовок + Live индикатор */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">Командный центр</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Live-смены
          </h2>
        </div>
        <div className="flex items-center gap-2 label-mono">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full bg-ember opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 bg-ember" />
          </span>
          <span className="text-ember live-pulse">LIVE</span>
        </div>
      </div>

      {/* Сводные карточки */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Мастеров на смене" value={shifts.length} icon={Users} accent={shifts.length > 0} />
        <StatCard label="Всего кальянов" value={totalHookahs} icon={Cigarette} />
        <StatCard
          label="Ср. на мастера"
          value={shifts.length > 0 ? Math.round(totalHookahs / shifts.length) : 0}
          icon={CigIcon}
        />
      </div>

      {/* Список смен */}
      {shifts.length === 0 ? (
        <div className="border border-border rounded-md p-12 text-center shadow-sm-soft">
          <Users className="h-8 w-8 mx-auto mb-4 text-muted-foreground/70" />
          <p className="body-sans text-sm font-bold tracking-tight text-foreground">Никого на смене.</p>
          <p className="body-sans text-sm text-muted-foreground mt-2">
            Когда мастера откроют смены, они появятся здесь.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
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
    <div
      className={`border rounded-md overflow-hidden shadow-sm-soft transition-base ${isMine ? 'frame-ember' : 'border-border'}`}
    >
      <div className={`h-[3px] ${classes.bg}`} />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-12 w-12 shrink-0 ${masterAvatarClass(
              shift.masterColor,
            )} flex items-center justify-center text-sm font-mono font-bold text-white rounded-md`}
          >
            {initials(shift.masterName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="body-sans text-sm font-bold tracking-tight truncate text-foreground">
                {shift.masterName}
              </p>
              {shift.masterRole === 'SENIOR' && (
                <span className="label-mono-sm font-bold border border-ember text-ember px-1 py-0.5 rounded-sm">
                  SENIOR
                </span>
              )}
              {isMine && (
                <span className="label-mono-sm font-bold border border-foreground text-foreground px-1 py-0.5 rounded-sm">
                  ВЫ
                </span>
              )}
            </div>
            <p className="label-mono mt-1.5">
              С {formatHHMM(shift.openedAt)} · {shiftDurationShort(shift.openedAt)}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`font-mono font-bold tabular leading-none ${classes.text}`}
              style={{ fontSize: 'clamp(32px, 5vw, 44px)' }}
            >
              {shift.hookahCount}
            </p>
            <p className="label-mono mt-1">кальянов</p>
          </div>
        </div>
      </div>
    </div>
  )
}
