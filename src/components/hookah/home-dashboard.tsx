'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { masterAvatarClass, initials } from '@/lib/master-utils'
import {
  CalendarCheck,
  CalendarOff,
  CalendarRange,
  AlertTriangle,
  ShoppingCart,
  Star,
  Package,
  Layers,
  Loader2,
  ChevronRight,
} from 'lucide-react'

interface DashboardEntry {
  id: string
  masterId: string
  masterName: string
  masterColor: string
  masterRole: string
  isMine: boolean
  note: string | null
}

interface HomeDashboardData {
  isSenior: boolean
  today: {
    date: string
    label: string
    short: string
    entries: DashboardEntry[]
  }
  tomorrow: {
    date: string
    label: string
    short: string
    entries: DashboardEntry[]
  }
  myTodayEntry: { id: string; note: string | null } | null
  myNextShift: { date: string; dateLabel: string } | null
  lowStockCount: number
  lowConsumablesCount: number
  pendingRequestsCount: number
  pendingWishesCount: number
  myMonthShifts: number
}

interface HomeDashboardProps {
  refreshKey: number
  onNavigate?: (tab: string) => void
}

export function HomeDashboard({ refreshKey, onNavigate }: HomeDashboardProps) {
  const [data, setData] = useState<HomeDashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) return
      const d = await res.json()
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

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 label-mono">
          <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
        </div>
      </div>
    )
  }

  const isSenior = data.isSenior

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="border-b border-border pb-3">
        <span className="label-mono">Сегодня</span>
        <h2
          className="heading-mono text-foreground leading-none mt-1"
          style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
        >
          {data.today.label}
        </h2>
      </div>

      {/* Главный блок — статус сегодня */}
      <div
        className={`frame rounded-md p-5 space-y-3 ${
          data.myTodayEntry ? 'frame-ember' : 'border-border'
        }`}
      >
        {isSenior ? (
          <SeniorTodayBlock data={data} />
        ) : data.myTodayEntry ? (
          <RegularOnShiftBlock data={data} />
        ) : (
          <RegularOffShiftBlock data={data} />
        )}
      </div>

      {/* Завтра — для старшего */}
      {isSenior && (
        <div className="frame border-border rounded-md p-5 space-y-3">
          <div className="flex items-center gap-2 label-mono">
            <CalendarRange className="h-3.5 w-3.5" />
            Завтра
          </div>
          <p className="label-mono-sm">{data.tomorrow.label}</p>
          {data.tomorrow.entries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.tomorrow.entries.map((e) => (
                <MasterChip key={e.id} entry={e} />
              ))}
            </div>
          ) : (
            <p className="body-sans text-sm text-muted-foreground">Выходной.</p>
          )}
        </div>
      )}

      {/* Внимание — actionable cards */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 label-mono">
          <AlertTriangle className="h-3.5 w-3.5 text-ember" />
          Внимание
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActionCard
            icon={Package}
            label="Мало табака"
            value={data.lowStockCount}
            accent={data.lowStockCount > 0}
            onClick={() => onNavigate?.('stock')}
            cta="К складу"
          />
          {isSenior && (
            <ActionCard
              icon={Layers}
              label="Мало расходников"
              value={data.lowConsumablesCount}
              accent={data.lowConsumablesCount > 0}
              onClick={() => onNavigate?.('consumables')}
              cta="К расходникам"
            />
          )}
          <ActionCard
            icon={ShoppingCart}
            label="Заявки ожидают"
            value={data.pendingRequestsCount}
            accent={data.pendingRequestsCount > 0}
            onClick={() => onNavigate?.('purchase')}
            cta="К закупу"
          />
          <ActionCard
            icon={Star}
            label="Хотелки ожидают"
            value={data.pendingWishesCount}
            accent={data.pendingWishesCount > 0}
            onClick={() => onNavigate?.('wishes')}
            cta="К хотелкам"
          />
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
          <CalendarCheck className="h-4 w-4 text-muted-foreground/70" />
          <div>
            <p className="font-mono text-2xl font-bold leading-none tabular text-foreground">
              {data.myMonthShifts}
            </p>
            <p className="label-mono mt-1">смен в этом месяце</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MasterChip({ entry }: { entry: DashboardEntry }) {
  return (
    <div
      className={`flex items-center gap-2 ${entry.isMine ? 'frame-ember' : 'border border-border'} rounded-md px-2.5 py-1.5`}
      title={entry.note ?? undefined}
    >
      <span
        className={`h-5 w-5 ${masterAvatarClass(entry.masterColor)} flex items-center justify-center text-[8px] font-mono font-bold text-white rounded-sm`}
      >
        {initials(entry.masterName)}
      </span>
      <span className="font-mono text-sm font-bold tracking-tight text-foreground">
        {entry.masterName}
      </span>
      {entry.isMine && (
        <span className="label-mono-sm text-ember">ты</span>
      )}
    </div>
  )
}

function SeniorTodayBlock({ data }: { data: HomeDashboardData }) {
  if (data.today.entries.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 label-mono">
          <CalendarOff className="h-3.5 w-3.5" />
          Сегодня выходной
        </div>
        <p className="body-sans text-sm text-muted-foreground">Никто не запланирован.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 label-mono">
        <CalendarCheck className="h-3.5 w-3.5 text-ember" />
        Сегодня работают
      </div>
      <div className="flex flex-wrap gap-2">
        {data.today.entries.map((e) => (
          <MasterChip key={e.id} entry={e} />
        ))}
      </div>
    </div>
  )
}

function RegularOnShiftBlock({ data }: { data: HomeDashboardData }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 label-mono">
        <CalendarCheck className="h-3.5 w-3.5 text-ember" />
        Сегодня твоя смена
      </div>
      {data.today.entries.length > 1 && (
        <p className="body-sans text-sm text-muted-foreground">
          За стойкой также:{' '}
          {data.today.entries
            .filter((e) => !e.isMine)
            .map((e) => e.masterName)
            .join(', ')}
        </p>
      )}
    </div>
  )
}

function RegularOffShiftBlock({ data }: { data: HomeDashboardData }) {
  const others = data.today.entries.filter((e) => !e.isMine)
  const otherNames = others.map((e) => e.masterName)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 label-mono">
        <CalendarOff className="h-3.5 w-3.5" />
        Сегодня выходной
      </div>
      {otherNames.length > 0 ? (
        <p className="body-sans text-sm text-foreground">
          За стойкой:{' '}
          <span className="font-mono font-bold">{otherNames.join(', ')}</span>
        </p>
      ) : (
        <p className="body-sans text-sm text-muted-foreground">
          Сегодня никто не работает.
        </p>
      )}
      {data.myNextShift ? (
        <p className="body-sans text-sm text-foreground">
          Твоя следующая смена:{' '}
          <span className="font-mono font-bold">{data.myNextShift.dateLabel}</span>
        </p>
      ) : (
        <p className="body-sans text-sm text-muted-foreground">
          Ближайших смен нет.
        </p>
      )}
    </div>
  )
}

function ActionCard({
  icon: Icon,
  label,
  value,
  accent,
  onClick,
  cta,
}: {
  icon: typeof Package
  label: string
  value: number
  accent?: boolean
  onClick?: () => void
  cta?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`group text-left border rounded-md p-4 transition-base transition-colors hover:bg-muted/50 ${
        accent ? 'frame-ember' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-ember' : 'text-muted-foreground/70'}`} />
      </div>
      <div className="flex items-baseline justify-between mt-2 gap-3">
        <span
          className="font-mono font-bold tabular text-foreground leading-none"
          style={{ fontSize: 'clamp(28px, 4vw, 36px)' }}
        >
          {value}
        </span>
        {cta && (
          <span className="label-mono-sm flex items-center gap-1 text-foreground">
            {cta}
            <ChevronRight className="h-3 w-3 transition-base group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </button>
  )
}
