'use client'

import { useEffect, useState, useCallback } from 'react'
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
  Flame,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardEntry {
  id: string
  masterId: string
  masterName: string
  masterColor: string
  masterRole: string
  shiftType: string
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-md shimmer" />
          ))}
        </div>
        <div className="flex items-center gap-2 label-mono py-12 justify-center">
          <Loader2 className="h-3 w-3 animate-spin" /> Загрузка данных...
        </div>
      </div>
    )
  }

  const isSenior = data.isSenior
  const totalAlerts =
    data.lowStockCount +
    (isSenior ? data.lowConsumablesCount : 0) +
    data.pendingRequestsCount +
    data.pendingWishesCount

  return (
    <div className="space-y-6">
      {/* Главный hero блок — статус сегодня */}
      <div
        className={cn(
          'relative overflow-hidden rounded-md border p-5 sm:p-6',
          data.myTodayEntry
            ? 'frame-ember ember-glow'
            : 'border-border surface-card',
        )}
      >
        {/* Decorative gradient */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 100% 0%, var(--ember-soft), transparent)',
          }}
        />

        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="label-mono-ember mb-1.5">Сегодня</p>
              <h3
                className="heading-display text-foreground"
                style={{ fontSize: 'clamp(22px, 3.5vw, 32px)' }}
              >
                {data.today.label}
              </h3>
            </div>
            <div className="text-right">
              <p className="label-mono-sm">{data.today.short}</p>
              <p className="label-mono mt-1">
                {data.today.entries.length} мастеров на смене
              </p>
            </div>
          </div>

          {isSenior ? (
            <SeniorTodayBlock data={data} />
          ) : data.myTodayEntry ? (
            <RegularOnShiftBlock data={data} />
          ) : (
            <RegularOffShiftBlock data={data} />
          )}
        </div>
      </div>

      {/* Завтра — для старшего */}
      {isSenior && (
        <div className="rounded-md border border-border surface-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <span className="label-mono">Завтра · {data.tomorrow.label}</span>
          </div>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 label-mono">
            <AlertTriangle className="h-3.5 w-3.5 text-ember" />
            Внимание
          </div>
          {totalAlerts > 0 && (
            <span className="label-mono-sm text-ember">
              {totalAlerts} {pluralize(totalAlerts, ['действие', 'действия', 'действий'])}
            </span>
          )}
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
            onClick={() => onNavigate?.('supply')}
            cta="К поставкам"
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

      {/* Quick stats — large stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={CalendarCheck}
          label="Смен в этом месяце"
          value={data.myMonthShifts}
          accent="ember"
        />
        <StatCard
          icon={TrendingUp}
          label="Мастеров на смене"
          value={data.today.entries.length}
          accent="success"
        />
        <StatCard
          icon={Flame}
          label="Активных действий"
          value={totalAlerts}
          accent="gold"
        />
      </div>
    </div>
  )
}

function pluralize(n: number, forms: [string, string, string]): string {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return forms[0]
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1]
  return forms[2]
}

const SHIFT_LABELS_FULL: Record<string, string> = {
  full: 'Полная',
  morning: 'Утро',
  evening: 'Вечер',
}

function MasterChip({ entry }: { entry: DashboardEntry }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-1.5 transition-base',
        entry.isMine
          ? 'frame-ember bg-ember-soft'
          : 'border border-border bg-muted',
      )}
      title={entry.note ?? undefined}
    >
      <span
        className={cn(
          'h-6 w-6 rounded-md flex items-center justify-center text-[9px] font-mono font-bold text-white',
        )}
        style={{ background: entry.masterColor }}
      >
        {initials(entry.masterName)}
      </span>
      <span className="font-mono text-sm font-bold tracking-tight text-foreground">
        {entry.masterName}
      </span>
      {entry.shiftType && (
        <span className="label-mono-sm text-muted-foreground">
          {SHIFT_LABELS_FULL[entry.shiftType] || entry.shiftType}
        </span>
      )}
      {entry.isMine && <span className="label-mono-sm text-ember">ты</span>}
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
  const others = data.today.entries.filter((e) => !e.isMine)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 label-mono">
        <CalendarCheck className="h-3.5 w-3.5 text-ember" />
        Сегодня твоя смена
      </div>
      {others.length > 0 && (
        <p className="body-sans text-sm text-muted-foreground">
          За стойкой также:{' '}
          {others.map((e, i) => (
            <span key={e.id}>
              <span className="font-mono font-bold text-foreground">{e.masterName}</span>
              {e.shiftType && (
                <span className="text-muted-foreground">
                  {' '}
                  ({SHIFT_LABELS_FULL[e.shiftType] || e.shiftType})
                </span>
              )}
              {i < others.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function RegularOffShiftBlock({ data }: { data: HomeDashboardData }) {
  const others = data.today.entries.filter((e) => !e.isMine)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 label-mono">
        <CalendarOff className="h-3.5 w-3.5" />
        Сегодня выходной
      </div>
      {others.length > 0 ? (
        <p className="body-sans text-sm text-foreground">
          За стойкой:{' '}
          {others.map((e, i) => (
            <span key={e.id}>
              <span className="font-mono font-bold">{e.masterName}</span>
              {e.shiftType && (
                <span className="text-muted-foreground">
                  {' '}
                  ({SHIFT_LABELS_FULL[e.shiftType] || e.shiftType})
                </span>
              )}
              {i < others.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      ) : (
        <p className="body-sans text-sm text-muted-foreground">Сегодня никто не работает.</p>
      )}
      {data.myNextShift ? (
        <p className="body-sans text-sm text-foreground">
          Твоя следующая смена:{' '}
          <span className="font-mono font-bold text-ember">{data.myNextShift.dateLabel}</span>
        </p>
      ) : (
        <p className="body-sans text-sm text-muted-foreground">Ближайших смен нет.</p>
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
      className={cn(
        'group text-left rounded-md p-4 transition-base transition-all hover-lift',
        accent
          ? 'frame-ember bg-ember-soft'
          : 'border border-border surface-card hover:border-border-strong',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="label-mono">{label}</span>
        <Icon
          className={cn(
            'h-4 w-4 transition-colors',
            accent ? 'text-ember' : 'text-muted-foreground',
          )}
        />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'font-mono font-bold tabular leading-none',
            accent ? 'text-ember' : 'text-foreground',
          )}
          style={{ fontSize: 'clamp(28px, 4vw, 36px)' }}
        >
          {value}
        </span>
        {cta && (
          <span
            className={cn(
              'label-mono-sm flex items-center gap-1 transition-base',
              accent ? 'text-ember' : 'text-muted-foreground group-hover:text-foreground',
            )}
          >
            {cta}
            <ChevronRight className="h-3 w-3 transition-base group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </button>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Package
  label: string
  value: number
  accent: 'ember' | 'success' | 'gold'
}) {
  const accentColors = {
    ember: { text: 'text-ember', bg: 'bg-ember-soft' },
    success: { text: 'text-success', bg: 'bg-success/10' },
    gold: { text: 'text-gold', bg: 'bg-gold/10' },
  }
  const colors = accentColors[accent]

  return (
    <div className="rounded-md border border-border surface-card p-4 hover-lift">
      <div className="flex items-center justify-between mb-3">
        <span className="label-mono">{label}</span>
        <div
          className={cn(
            'h-8 w-8 rounded-md flex items-center justify-center',
            colors.bg,
          )}
        >
          <Icon className={cn('h-4 w-4', colors.text)} />
        </div>
      </div>
      <span
        className={cn(
          'font-mono font-bold tabular leading-none',
          colors.text,
        )}
        style={{ fontSize: 'clamp(32px, 4.5vw, 42px)' }}
      >
        {value}
      </span>
    </div>
  )
}
