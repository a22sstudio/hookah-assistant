'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Wallet, TrendingUp, Calendar, Gift, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { masterAvatarClass, initials } from '@/lib/master-utils'

const SHIFT_LABELS: Record<string, string> = { full: 'Полная', morning: 'Утренняя', evening: 'Вечерняя' }
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
function fmtMoney(v: number): string {
  return v.toLocaleString('ru-RU') + ' ₽'
}

interface IncomeData {
  currentMonth: {
    year: number
    month: number
    monthName: string
    today: number
    daysInMonth: number
    isFirstHalfFrozen: boolean
    isSecondHalfFrozen: boolean
    isClosed: boolean
  }
  firstHalf: {
    amount: number
    shiftCount: number
    breakdown: Record<string, { count: number; rate: number; sum: number }>
    shifts: Array<{ date: string; shiftType: string; rate: number }>
    frozen: boolean
    dueDate: string
  }
  secondHalf: {
    amount: number
    shiftCount: number
    breakdown: Record<string, { count: number; rate: number; sum: number }>
    shifts: Array<{ date: string; shiftType: string; rate: number }>
    frozen: boolean
    dueDate: string
  }
  currentIncome: number
  currentShifts: Array<{ date: string; shiftType: string; rate: number }>
  bonus: { amount: number; note: string | null } | null
  monthTotal: number
  payslips: Array<{
    id: string
    year: number
    month: number
    monthName: string
    firstHalfAmount: number
    secondHalfAmount: number
    bonusAmount: number
    totalAmount: number
    createdAt: string
  }>
  rates: Record<string, number>
}

interface MyIncomePanelProps {
  masterName: string
  masterColor: string
  refreshKey: number
  onRefresh: () => void
}

export function MyIncomePanel({ masterName, masterColor, refreshKey, onRefresh }: MyIncomePanelProps) {
  const [data, setData] = useState<IncomeData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/my-income')
      if (!res.ok) {
        toast.error('Не удалось загрузить доход')
        return
      }
      const d = await res.json()
      setData(d)
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center py-12 text-muted-foreground">Нет данных</div>
  }

  const cm = data.currentMonth

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-ember" />
          <h2 className="label-mono text-base sm:text-lg">Мой доход</h2>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Текущий месяц */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="label-mono">{cm.monthName} {cm.year}</span>
          <Badge variant="outline" className="label-mono-sm">день {cm.today} из {cm.daysInMonth}</Badge>
        </div>

        {/* Если месяц закрыт с премией — показываем итоговый лист */}
        {cm.isClosed && data.bonus ? (
          <ClosedMonthCard data={data} />
        ) : (
          <>
            {/* Текущий накапливающийся доход */}
            {!cm.isSecondHalfFrozen && (
              <div className="rounded-lg border border-ember/30 bg-ember/5 p-4 space-y-2">
                <div className="flex items-center gap-2 label-mono-sm text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Текущий доход ({cm.isFirstHalfFrozen ? '2-я половина' : '1-я половина'})
                </div>
                <div className="font-mono font-bold tabular text-ember" style={{ fontSize: 'clamp(28px, 5vw, 40px)' }}>
                  {fmtMoney(data.currentIncome)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.currentShifts.length} смен
                </div>
                {/* Список смен текущего периода */}
                {data.currentShifts.length > 0 && (
                  <div className="pt-2 border-t border-border/50 space-y-1">
                    {data.currentShifts.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{fmtDate(s.date)}</span>
                        <span className="text-muted-foreground">{SHIFT_LABELS[s.shiftType] || s.shiftType}</span>
                        <span className="font-mono tabular font-bold">{s.rate}₽</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Первая половина — зафиксирована */}
            {cm.isFirstHalfFrozen && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 label-mono-sm text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    К выплате 25 числа
                  </div>
                  <Badge variant="outline" className="label-mono-sm border-emerald-500/30 text-emerald-600">
                    зафиксировано
                  </Badge>
                </div>
                <div className="font-mono font-bold tabular text-foreground" style={{ fontSize: 'clamp(24px, 4vw, 32px)' }}>
                  {fmtMoney(data.firstHalf.amount)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.firstHalf.shiftCount} смен · 1-15 {cm.monthName.toLowerCase()}
                </div>
                {Object.entries(data.firstHalf.breakdown).filter(([, v]) => v.count > 0).map(([st, v]) => (
                  <div key={st} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{SHIFT_LABELS[st]}: {v.count} × {v.rate}₽</span>
                    <span className="font-mono tabular">{v.sum}₽</span>
                  </div>
                ))}
              </div>
            )}

            {/* Вторая половина — зафиксирована */}
            {cm.isSecondHalfFrozen && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 label-mono-sm text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    К выплате 10 числа (без премии)
                  </div>
                  <Badge variant="outline" className="label-mono-sm border-emerald-500/30 text-emerald-600">
                    зафиксировано
                  </Badge>
                </div>
                <div className="font-mono font-bold tabular text-foreground" style={{ fontSize: 'clamp(24px, 4vw, 32px)' }}>
                  {fmtMoney(data.secondHalf.amount)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.secondHalf.shiftCount} смен · 16-{cm.daysInMonth} {cm.monthName.toLowerCase()}
                </div>
              </div>
            )}

            {/* Премия (если есть) */}
            {data.bonus && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 label-mono-sm text-muted-foreground">
                  <Gift className="h-3.5 w-3.5" />
                  Премия
                </div>
                <div className="font-mono font-bold tabular text-foreground text-xl">
                  {fmtMoney(data.bonus.amount)}
                </div>
                {data.bonus.note && <p className="text-xs text-muted-foreground">{data.bonus.note}</p>}
              </div>
            )}

            {/* Итог за месяц (если обе половины зафиксированы) */}
            {cm.isSecondHalfFrozen && (
              <div className="rounded-lg border-2 border-ember bg-ember/10 p-4 space-y-2">
                <div className="label-mono-sm text-muted-foreground">Итого за месяц</div>
                <div className="font-mono font-bold tabular text-ember" style={{ fontSize: 'clamp(28px, 5vw, 40px)' }}>
                  {fmtMoney(data.monthTotal)}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="label-mono-sm">1-15: {fmtMoney(data.firstHalf.amount)}</Badge>
                  <Badge variant="outline" className="label-mono-sm">16-{cm.daysInMonth}: {fmtMoney(data.secondHalf.amount)}</Badge>
                  {data.bonus && <Badge variant="outline" className="label-mono-sm">Премия: {fmtMoney(data.bonus.amount)}</Badge>
                  }
                </div>
                {!data.bonus && (
                  <p className="text-xs text-muted-foreground italic mt-1">
                    Расчётный лист будет сформирован после назначения премии старшим мастером
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Закрытые расчётные листы */}
      {data.payslips.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-border">
          <span className="label-mono text-muted-foreground">Закрытые расчётные листы</span>
          {data.payslips.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm">{p.monthName} {p.year}</span>
                <Badge variant="outline" className="label-mono-sm border-emerald-500/30 text-emerald-600">закрыт</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="label-mono-sm">1-15: {fmtMoney(p.firstHalfAmount)}</Badge>
                <Badge variant="outline" className="label-mono-sm">16-конец: {fmtMoney(p.secondHalfAmount)}</Badge>
                {p.bonusAmount > 0 && <Badge variant="outline" className="label-mono-sm">Премия: {fmtMoney(p.bonusAmount)}</Badge>}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="label-mono-sm text-muted-foreground">Итого:</span>
                <span className="font-mono font-bold tabular text-ember">{fmtMoney(p.totalAmount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ставки */}
      <div className="border border-border rounded-md p-3 space-y-1">
        <span className="label-mono text-muted-foreground text-xs">Ставки по типам смен:</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.rates).map(([st, rate]) => (
            <Badge key={st} variant="outline" className="label-mono-sm">
              {SHIFT_LABELS[st] || st}: {rate}₽
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Карточка закрытого месяца (с премией) ───
function ClosedMonthCard({ data }: { data: IncomeData }) {
  return (
    <div className="rounded-lg border-2 border-ember bg-ember/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="label-mono">Расчётный лист · {data.currentMonth.monthName} {data.currentMonth.year}</span>
        <Badge className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10">закрыт</Badge>
      </div>
      <div className="font-mono font-bold tabular text-ember" style={{ fontSize: 'clamp(32px, 6vw, 48px)' }}>
        {fmtMoney(data.monthTotal)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-md border border-border p-2 bg-card">
          <p className="label-mono-sm text-muted-foreground">Выплата 25 числа (1-15)</p>
          <p className="font-mono font-bold tabular">{fmtMoney(data.firstHalf.amount)}</p>
          <p className="text-xs text-muted-foreground">{data.firstHalf.shiftCount} смен</p>
        </div>
        <div className="rounded-md border border-border p-2 bg-card">
          <p className="label-mono-sm text-muted-foreground">Выплата 10 числа (16-конец)</p>
          <p className="font-mono font-bold tabular">{fmtMoney(data.secondHalf.amount)}</p>
          <p className="text-xs text-muted-foreground">{data.secondHalf.shiftCount} смен</p>
        </div>
      </div>
      {data.bonus && (
        <div className="rounded-md border border-border p-2 bg-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-ember" />
            <span className="label-mono-sm">Премия</span>
          </div>
          <span className="font-mono font-bold tabular">{fmtMoney(data.bonus.amount)}</span>
        </div>
      )}
      {/* Подробный отчёт по сменам */}
      <div className="border-t border-border pt-2">
        <p className="label-mono-sm text-muted-foreground mb-1">Все смены за месяц:</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {[...data.firstHalf.shifts, ...data.secondHalf.shifts].map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-0.5">
              <span className="font-mono">{fmtDate(s.date)}</span>
              <span className="text-muted-foreground">{SHIFT_LABELS[s.shiftType] || s.shiftType}</span>
              <span className="font-mono tabular">{s.rate}₽</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
