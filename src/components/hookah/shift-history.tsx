'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Download, RefreshCw, Loader2, History } from 'lucide-react'
import { toast } from 'sonner'
import { masterAvatarClass, initials } from '@/lib/master-utils'

interface ShiftRow {
  id: string
  masterId: string
  masterName: string
  masterColor: string
  masterRole: string
  status: string
  openedAt: string
  closedAt: string | null
  hookahCount: number
  requestsCount: number
  wishesCount: number
  note: string | null
}

interface Totals {
  shifts: number
  hookahs: number
  requests: number
  wishes: number
}

interface Master {
  id: string
  name: string
  role: string
  color: string
}

interface ShiftHistoryProps {
  refreshKey: number
  onRefresh?: () => void
}

type PeriodKey = 'week' | 'month' | 'custom'
type SortKey = 'date_desc' | 'date_asc' | 'hookah_desc' | 'hookah_asc'

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
function fmtDuration(from: string, to: string | null): string {
  const start = new Date(from).getTime()
  const end = to ? new Date(to).getTime() : Date.now()
  const diffMin = Math.max(0, Math.floor((end - start) / 60000))
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  if (h === 0) return `${m}м`
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`
}
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function downloadCSV(filename: string, rows: string[][]) {
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
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ShiftHistory({ refreshKey, onRefresh }: ShiftHistoryProps) {
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [masters, setMasters] = useState<Master[]>([])
  const [loading, setLoading] = useState(true)

  const [masterId, setMasterId] = useState<string>('all')
  const [period, setPeriod] = useState<PeriodKey>('week')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sort, setSort] = useState<SortKey>('date_desc')

  // Даты по умолчанию
  useEffect(() => {
    const today = new Date()
    const weekAgo = new Date()
    weekAgo.setDate(today.getDate() - 7)
    setFromDate(isoDate(weekAgo))
    setToDate(isoDate(today))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (masterId !== 'all') params.set('masterId', masterId)
      params.set('sort', sort)

      // Период
      if (period === 'week') {
        const today = new Date()
        const weekAgo = new Date()
        weekAgo.setDate(today.getDate() - 7)
        params.set('from', isoDate(weekAgo))
        params.set('to', isoDate(today))
      } else if (period === 'month') {
        const today = new Date()
        const monthAgo = new Date()
        monthAgo.setDate(today.getDate() - 30)
        params.set('from', isoDate(monthAgo))
        params.set('to', isoDate(today))
      } else if (fromDate && toDate) {
        params.set('from', fromDate)
        params.set('to', toDate)
      }

      const res = await fetch(`/api/shifts/history?${params.toString()}`)
      if (!res.ok) {
        toast.error('Не удалось загрузить историю')
        return
      }
      const data = await res.json()
      setShifts(data.shifts ?? [])
      setTotals(data.totals ?? null)
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }, [masterId, period, fromDate, toDate, sort])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Загрузка мастеров для фильтра
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/masters')
        if (res.ok) {
          const data = await res.json()
          setMasters(data.masters ?? [])
        }
      } catch {
        // ignore — фильтр просто не будет иметь списка
      }
    })()
  }, [refreshKey])

  const exportCsv = () => {
    if (shifts.length === 0) {
      toast.error('Нет данных для экспорта')
      return
    }
    const header = [
      'Дата',
      'Открыта',
      'Закрыта',
      'Мастер',
      'Роль',
      'Статус',
      'Кальяны',
      'Заявки',
      'Хотелки',
      'Длительность',
    ]
    const rows: string[][] = [header]
    for (const s of shifts) {
      rows.push([
        new Date(s.openedAt).toLocaleDateString('ru-RU'),
        fmtTime(s.openedAt),
        s.closedAt ? fmtTime(s.closedAt) : '—',
        s.masterName,
        s.masterRole,
        s.status === 'OPEN' ? 'Открыта' : 'Закрыта',
        String(s.hookahCount),
        String(s.requestsCount),
        String(s.wishesCount),
        fmtDuration(s.openedAt, s.closedAt),
      ])
    }
    // Итоги
    if (totals) {
      rows.push([])
      rows.push(['ИТОГО', '', '', '', '', '', String(totals.hookahs), String(totals.requests), String(totals.wishes), ''])
    }
    downloadCSV(`shifts-history-${isoDate(new Date())}.csv`, rows)
    toast.success('CSV выгружен')
  }

  const visibleFromDate = period === 'custom'

  const sortedMasters = useMemo(() => {
    return [...masters].sort((a, b) => {
      if (a.role === 'SENIOR' && b.role !== 'SENIOR') return -1
      if (b.role === 'SENIOR' && a.role !== 'SENIOR') return 1
      return a.name.localeCompare(b.name)
    })
  }, [masters])

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3 flex-wrap">
        <div>
          <span className="label-mono flex items-center gap-1.5">
            <History className="h-3 w-3" /> Аналитика
          </span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            История смен
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              load()
              onRefresh?.()
            }}
            title="Обновить"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Обновить
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            title="Экспортировать CSV"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="space-y-1">
          <span className="label-mono block">Мастер</span>
          <Select value={masterId} onValueChange={setMasterId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Все мастера" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все мастера</SelectItem>
              {sortedMasters.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} {m.role === 'SENIOR' ? '⭐' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="label-mono block">Период</span>
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v as PeriodKey)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Неделя</SelectItem>
              <SelectItem value="month">Месяц</SelectItem>
              <SelectItem value="custom">Период</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {visibleFromDate ? (
          <div className="space-y-1">
            <span className="label-mono block">С даты</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="font-mono"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <span className="label-mono block">Сортировка</span>
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortKey)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_desc">По дате ↓</SelectItem>
                <SelectItem value="date_asc">По дате ↑</SelectItem>
                <SelectItem value="hookah_desc">По кальянам ↓</SelectItem>
                <SelectItem value="hookah_asc">По кальянам ↑</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {visibleFromDate ? (
          <div className="space-y-1">
            <span className="label-mono block">По дату</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="font-mono"
            />
          </div>
        ) : (
          <div className="space-y-1 flex flex-col justify-end">
            <span className="label-mono block">Итого</span>
            <div className="border border-border rounded-md px-3 py-2 h-9 flex items-center font-mono text-xs tabular text-foreground shadow-sm-soft">
              {totals ? `${totals.shifts} смен · ${totals.hookahs} кальян.` : '—'}
            </div>
          </div>
        )}
      </div>

      {/* Таблица */}
      <div className="border border-border rounded-md overflow-x-auto shadow-sm-soft">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border">
              <th className="label-mono text-left py-2.5 px-3 border-r border-border">Дата</th>
              <th className="label-mono text-left py-2.5 px-3 border-r border-border">Мастер</th>
              <th className="label-mono text-right py-2.5 px-3 border-r border-border">Кальяны</th>
              <th className="label-mono text-right py-2.5 px-3 border-r border-border">Длит.</th>
              <th className="label-mono text-right py-2.5 px-3 border-r border-border">Заяв.</th>
              <th className="label-mono text-right py-2.5 px-3 border-r border-border">Хот.</th>
              <th className="label-mono text-left py-2.5 px-3">Смена</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-muted-foreground label-mono"
                >
                  <Loader2 className="h-3 w-3 animate-spin inline mr-2" />
                  Загрузка...
                </td>
              </tr>
            ) : shifts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-muted-foreground text-sm body-sans"
                >
                  Смен не найдено в выбранном периоде.
                </td>
              </tr>
            ) : (
              shifts.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/40 transition-base transition-colors"
                >
                  <td className="py-3 px-3 border-r border-border font-mono text-xs tabular text-muted-foreground whitespace-nowrap">
                    {fmtDateTime(s.openedAt)}
                  </td>
                  <td className="py-3 px-3 border-r border-border">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-6 w-6 shrink-0 ${masterAvatarClass(
                          s.masterColor,
                        )} flex items-center justify-center text-[10px] font-mono font-bold uppercase text-white rounded-sm`}
                      >
                        {initials(s.masterName)}
                      </span>
                      <span className="font-mono text-xs font-bold uppercase tracking-tight truncate">
                        {s.masterName}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 border-r border-border text-right">
                    <span
                      className="font-mono font-bold tabular text-foreground"
                      style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}
                    >
                      {s.hookahCount}
                    </span>
                  </td>
                  <td className="py-3 px-3 border-r border-border text-right font-mono text-xs tabular text-muted-foreground whitespace-nowrap">
                    {fmtDuration(s.openedAt, s.closedAt)}
                  </td>
                  <td className="py-3 px-3 border-r border-border text-right font-mono text-xs tabular text-muted-foreground">
                    {s.requestsCount}
                  </td>
                  <td className="py-3 px-3 border-r border-border text-right font-mono text-xs tabular text-muted-foreground">
                    {s.wishesCount}
                  </td>
                  <td className="py-3 px-3 font-mono text-[10px] uppercase tracking-tight whitespace-nowrap">
                    <span className="text-muted-foreground/70">
                      {fmtTime(s.openedAt)} — {s.closedAt ? fmtTime(s.closedAt) : 'сейчас'}
                    </span>
                    {s.status === 'OPEN' && (
                      <span className="ml-2 border border-ember text-ember px-1 py-0.5 font-bold rounded-sm live-pulse">
                        LIVE
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && totals && shifts.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-foreground bg-muted/30">
                <td className="py-3 px-3 border-r border-border label-mono" colSpan={2}>
                  ИТОГО: {totals.shifts} смен
                </td>
                <td className="py-3 px-3 border-r border-border text-right">
                  <span className="font-mono font-bold tabular text-foreground text-lg">
                    {totals.hookahs}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-border label-mono text-right">—</td>
                <td className="py-3 px-3 border-r border-border text-right font-mono text-xs tabular text-muted-foreground">
                  {totals.requests}
                </td>
                <td className="py-3 px-3 border-r border-border text-right font-mono text-xs tabular text-muted-foreground">
                  {totals.wishes}
                </td>
                <td className="py-3 px-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
