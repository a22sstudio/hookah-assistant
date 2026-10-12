'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Download,
  RefreshCw,
  Loader2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { masterAvatarClass, initials } from '@/lib/master-utils'

interface SalaryShift {
  id: string
  date: string
  shiftType: string
  rate: number
  note: string | null
}

interface ShiftBreakdown {
  count: number
  rate: number
  sum: number
}

interface SalaryResponse {
  master: {
    id: string
    name: string
    role: string
    color: string
  }
  period: { from: string; to: string }
  shifts: SalaryShift[]
  count: number
  shiftBreakdown: Record<string, ShiftBreakdown>
  rates: Record<string, number>
  total: number
}

interface Master {
  id: string
  name: string
  role: string
  color: string
}

interface SalaryCalculatorProps {
  refreshKey: number
  onRefresh?: () => void
}

const WEEKDAYS_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const SHIFT_LABELS: Record<string, string> = {
  full: 'Полная',
  morning: 'Утренняя',
  evening: 'Вечерняя',
}
const SHIFT_SHORT: Record<string, string> = {
  full: 'П',
  morning: 'У',
  evening: 'В',
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateDay(iso: string): string {
  const d = new Date(iso)
  const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()]
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${wd}`
}

export function SalaryCalculator({ refreshKey }: SalaryCalculatorProps) {
  const [masters, setMasters] = useState<Master[]>([])
  const [masterId, setMasterId] = useState<string>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [data, setData] = useState<SalaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [mastersLoading, setMastersLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    setFromDate(toISODate(startOfMonth(now)))
    setToDate(toISODate(endOfMonth(now)))
  }, [])

  useEffect(() => {
    ;(async () => {
      setMastersLoading(true)
      try {
        const res = await fetch('/api/masters')
        if (res.ok) {
          const d = await res.json()
          const list: Master[] = d.masters ?? []
          setMasters(list)
          if (!masterId && list.length > 0) {
            const senior = list.find((m) => m.role === 'SENIOR') ?? list[0]
            setMasterId(senior.id)
          }
        }
      } catch {
        // ignore
      } finally {
        setMastersLoading(false)
      }
    })()
  }, [refreshKey, masterId])

  const load = useCallback(async () => {
    if (!masterId || !fromDate || !toDate) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/salary?masterId=${masterId}&from=${fromDate}&to=${toDate}`,
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Не удалось загрузить данные')
        return
      }
      const d: SalaryResponse = await res.json()
      setData(d)
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }, [masterId, fromDate, toDate])

  useEffect(() => {
    if (masterId && fromDate && toDate) {
      load()
    }
  }, [load, masterId, fromDate, toDate, refreshKey])

  // Календарь месяца
  const calendar = useMemo(() => {
    if (!fromDate) return []
    const start = startOfMonth(new Date(fromDate))
    const first = startOfMonth(start)
    const firstDow = (first.getDay() + 6) % 7
    const last = endOfMonth(start)
    const totalDays = last.getDate()
    const cells: Array<{ date: Date | null; iso: string | null }> = []
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, iso: null })
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), d)
      cells.push({ date, iso: toISODate(date) })
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, iso: null })
    return cells
  }, [fromDate, toDate])

  // Дни со сменами + тип смены для подсветки
  const workedDays = useMemo(() => {
    const map = new Map<string, string>() // iso → shiftType
    if (!data) return map
    for (const s of data.shifts) {
      const dayIso = toISODate(new Date(s.date))
      map.set(dayIso, s.shiftType || 'full')
    }
    return map
  }, [data])

  const sortedMasters = useMemo(() => {
    return [...masters].sort((a, b) => {
      if (a.role === 'SENIOR' && b.role !== 'SENIOR') return -1
      if (b.role === 'SENIOR' && a.role !== 'SENIOR') return 1
      return a.name.localeCompare(b.name)
    })
  }, [masters])

  const currentMaster = masters.find((m) => m.id === masterId)

  const exportCsv = () => {
    if (!data) {
      toast.error('Нет данных для экспорта')
      return
    }
    const header = ['Дата', 'День недели', 'Тип смены', 'Ставка (₽)', 'Заметка']
    const rows: string[][] = [header]
    for (const s of data.shifts) {
      const d = new Date(s.date)
      const wd = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][d.getDay()]
      rows.push([
        d.toLocaleDateString('ru-RU'),
        wd,
        SHIFT_LABELS[s.shiftType] || s.shiftType,
        String(s.rate),
        s.note ?? '',
      ])
    }
    rows.push([])
    // Итоги по типам
    if (data.shiftBreakdown) {
      for (const [st, info] of Object.entries(data.shiftBreakdown)) {
        if (info.count > 0) {
          rows.push([
            `Итого ${SHIFT_LABELS[st] || st}:`,
            `${info.count} смен`,
            '',
            `× ${info.rate}₽`,
            `= ${info.sum}₽`,
          ])
        }
      }
    }
    rows.push([])
    rows.push([`ВСЕГО: ${data.count} смен = ${data.total}₽`, '', '', '', ''])
    rows.push([`Мастер: ${data.master.name}`, '', '', '', ''])
    rows.push([`Период: ${fmtDateShort(data.period.from)} — ${fmtDateShort(data.period.to)}`, '', '', '', ''])

    const escape = (s: string | number | null | undefined) => {
      const v = s === null || s === undefined ? '' : String(s)
      if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`
      return v
    }
    const csv = rows.map((r) => r.map(escape).join(';')).join('\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `salary-${data.master.name}-${toISODate(new Date())}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('CSV выгружен')
  }

  const exportText = () => {
    if (!data) return
    const breakdownStr = data.shiftBreakdown
      ? Object.entries(data.shiftBreakdown)
          .filter(([, info]) => info.count > 0)
          .map(([st, info]) => `${info.count}× ${SHIFT_LABELS[st]}(${info.rate}₽)`)
          .join(' + ')
      : ''
    const text = `Зарплата ${data.master.name}: ${data.count} смен (${breakdownStr}) = ${data.total}₽. Период: ${fmtDateShort(data.period.from)} — ${fmtDateShort(data.period.to)}`
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `salary-${data.master.name}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Сводка выгружена')
  }

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3 flex-wrap">
        <div>
          <span className="label-mono flex items-center gap-1.5">
            <Wallet className="h-3 w-3" /> Аналитика
          </span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Зарплата
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading || !masterId} title="Обновить">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Обновить</span>
          </Button>
          <Button size="sm" variant="outline" onClick={exportText} disabled={!data}>
            Сводка
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <span className="label-mono block">Мастер</span>
          {mastersLoading ? (
            <div className="border border-border rounded-md px-3 py-2 h-9 flex items-center label-mono-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin mr-2" /> Загрузка...
            </div>
          ) : (
            <Select value={masterId} onValueChange={setMasterId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите мастера" />
              </SelectTrigger>
              <SelectContent>
                {sortedMasters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} {m.role === 'SENIOR' ? '⭐' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <span className="label-mono block">От</span>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="font-mono" />
        </div>
        <div className="space-y-1">
          <span className="label-mono block">До</span>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="font-mono" />
        </div>
      </div>

      {/* Календарь с подсветкой */}
      <div className="border border-border rounded-md shadow-sm-soft overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/40 border-b border-border">
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="label-mono text-center py-2 border-r border-border last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        {fromDate && (
          <div className="grid grid-cols-7">
            {calendar.map((cell, i) => {
              if (!cell.date || !cell.iso) {
                return (
                  <div key={`empty-${i}`} className="border-b border-r border-border last:border-r-0 min-h-[64px] sm:min-h-[80px] bg-muted/30" />
                )
              }
              const shiftType = workedDays.get(cell.iso)
              const worked = !!shiftType
              const inRange = cell.iso >= fromDate && cell.iso <= toDate
              return (
                <div
                  key={cell.iso}
                  className={`border-b border-r border-border last:border-r-0 min-h-[64px] sm:min-h-[80px] p-1.5 sm:p-2 flex flex-col gap-1 ${
                    !inRange ? 'bg-muted/20' : ''
                  } ${worked ? 'frame-ember' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-xs tabular ${worked ? 'text-ember font-bold' : 'text-muted-foreground'}`}>
                      {cell.date.getDate()}
                    </span>
                    {worked && shiftType && (
                      <span className="label-mono-sm text-[9px] px-1 rounded bg-muted text-foreground">
                        {SHIFT_SHORT[shiftType] || '?'}
                      </span>
                    )}
                  </div>
                  {worked && currentMaster && (
                    <div className="flex items-center gap-1 mt-auto">
                      <span className={`h-2 w-2 ${masterAvatarClass(currentMaster.color)} rounded-sm`} />
                      <span className="label-mono-sm text-foreground truncate">
                        {currentMaster.name}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="border-t border-border px-3 py-2 flex items-center gap-3 flex-wrap">
          <span className="label-mono">Легенда:</span>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 frame-ember rounded-sm" />
            <span className="label-mono-sm text-muted-foreground">смена отработана</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant="outline" className="label-mono-sm text-[10px] py-0">П — полная</Badge>
            <Badge variant="outline" className="label-mono-sm text-[10px] py-0">У — утренняя</Badge>
            <Badge variant="outline" className="label-mono-sm text-[10px] py-0">В — вечерняя</Badge>
          </div>
        </div>
      </div>

      {/* Итоги */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-border rounded-md p-4 flex flex-col gap-2 shadow-sm-soft">
            <span className="label-mono">Смен</span>
            <span className="font-mono font-bold leading-none tabular text-foreground" style={{ fontSize: 'clamp(24px, 3vw, 32px)' }}>
              {data.count}
            </span>
          </div>
          {data.shiftBreakdown && Object.entries(data.shiftBreakdown).filter(([, info]) => info.count > 0).map(([st, info]) => (
            <div key={st} className="border border-border rounded-md p-4 flex flex-col gap-2 shadow-sm-soft">
              <span className="label-mono">{SHIFT_LABELS[st] || st}</span>
              <span className="font-mono font-bold leading-none tabular text-foreground" style={{ fontSize: 'clamp(20px, 2.5vw, 28px)' }}>
                {info.count}
                <span className="text-muted-foreground text-sm ml-1">× {info.rate}₽</span>
              </span>
              <span className="label-mono-sm text-muted-foreground">{info.sum}₽</span>
            </div>
          ))}
          <div className="border rounded-md p-4 flex flex-col gap-2 shadow-sm-soft frame-ember">
            <span className="label-mono">Итого</span>
            <span className="font-mono font-bold leading-none tabular text-ember" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
              {data.total}
              <span className="text-ember/70 text-base ml-1">₽</span>
            </span>
          </div>
        </div>
      )}

      {/* Детальный отчёт по дням */}
      {data && data.shifts.length > 0 && (
        <div className="border border-border rounded-md shadow-sm-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/40">
            <span className="label-mono">Детальный отчёт по сменам</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-muted-foreground label-mono-sm">
                  <th className="text-left font-normal py-2 px-3">Дата</th>
                  <th className="text-left font-normal py-2 px-3">Тип смены</th>
                  <th className="text-right font-normal py-2 px-3">Ставка</th>
                  <th className="text-left font-normal py-2 px-3">Заметка</th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s, i) => (
                  <tr key={s.id || i} className="border-t border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono tabular">
                      {fmtDateDay(s.date)}
                    </td>
                    <td className="py-2 px-3">
                      <span className="label-mono-sm px-1.5 py-0.5 rounded bg-muted text-foreground">
                        {SHIFT_SHORT[s.shiftType] || '?'} {SHIFT_LABELS[s.shiftType] || s.shiftType}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular font-bold">
                      {s.rate}₽
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {s.note || '—'}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/30">
                  <td className="py-2 px-3 font-bold" colSpan={2}>ИТОГО ({data.count} смен)</td>
                  <td className="py-2 px-3 text-right font-mono tabular font-bold text-ember">{data.total}₽</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Текстовая сводка */}
      {data && (
        <div className="border border-border rounded-md p-4 shadow-sm-soft">
          <div className="flex items-center gap-2 mb-2">
            {currentMaster && (
              <span className={`h-7 w-7 shrink-0 ${masterAvatarClass(currentMaster.color)} flex items-center justify-center text-[10px] font-mono font-bold uppercase text-white rounded-md`}>
                {initials(currentMaster.name)}
              </span>
            )}
            <div>
              <p className="font-mono text-sm font-bold tracking-tight">{data.master.name}</p>
              <p className="label-mono-sm text-muted-foreground">
                Период: {fmtDateShort(data.period.from)} — {fmtDateShort(data.period.to)}
              </p>
            </div>
          </div>
          {data.shiftBreakdown && (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(data.shiftBreakdown).filter(([, info]) => info.count > 0).map(([st, info]) => (
                <Badge key={st} variant="outline" className="label-mono-sm">
                  {info.count}× {SHIFT_LABELS[st]} ({info.rate}₽) = {info.sum}₽
                </Badge>
              ))}
            </div>
          )}
          <p className="body-sans text-sm text-foreground">
            Зарплата: <span className="font-bold">{data.count} смен</span> ={' '}
            <span className="font-mono font-bold text-ember text-lg">{data.total}₽</span>
          </p>
        </div>
      )}
    </div>
  )
}
