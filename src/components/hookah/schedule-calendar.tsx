'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { masterAvatarClass } from '@/lib/master-utils'

interface ScheduleEntry {
  id: string
  date: string
  masterId: string
  masterName: string
  masterColor: string
  masterRole: string
  startHour: number
  endHour: number
  note: string | null
  isMine?: boolean
}

interface Master {
  id: string
  name: string
  role: string
  color: string
}

interface ScheduleCalendarProps {
  canEdit: boolean
  refreshKey: number
  onRefresh?: () => void
}

const WEEKDAYS_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ScheduleCalendar({
  canEdit,
  refreshKey,
  onRefresh,
}: ScheduleCalendarProps) {
  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()))
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [masters, setMasters] = useState<Master[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEntries, setSelectedEntries] = useState<ScheduleEntry[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = toISODate(startOfMonth(cursor))
      const to = toISODate(endOfMonth(cursor))
      const res = await fetch(`/api/schedule?from=${from}&to=${to}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries ?? [])
      } else {
        toast.error('Не удалось загрузить график')
      }
      if (canEdit) {
        const mres = await fetch('/api/masters')
        if (mres.ok) {
          const mData = await mres.json()
          setMasters(mData.masters ?? [])
        }
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }, [cursor, canEdit])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Сетка месяца
  const grid = useMemo(() => {
    const first = startOfMonth(cursor)
    const last = endOfMonth(cursor)
    // 0=Sun, 1=Mon. Хотим ПН=0
    const firstDow = (first.getDay() + 6) % 7
    const totalDays = last.getDate()
    const cells: Array<{ date: Date | null; iso: string | null }> = []
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, iso: null })
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d)
      cells.push({ date, iso: toISODate(date) })
    }
    // дополнить до кратного 7
    while (cells.length % 7 !== 0) cells.push({ date: null, iso: null })
    return cells
  }, [cursor])

  const entriesByDate = useMemo(() => {
    const map: Record<string, ScheduleEntry[]> = {}
    for (const e of entries) {
      const key = toISODate(new Date(e.date))
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [entries])

  const todayIso = toISODate(new Date())

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
  const goToday = () => setCursor(startOfMonth(new Date()))

  const openDay = (iso: string) => {
    setSelectedDate(iso)
    setSelectedEntries(entriesByDate[iso] ?? [])
  }

  const closeDay = () => {
    setSelectedDate(null)
    setSelectedEntries([])
  }

  const refreshAll = () => {
    load()
    onRefresh?.()
  }

  return (
    <div className="space-y-4">
      {/* Заголовок + навигация */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3 flex-wrap">
        <div>
          <span className="label-mono">График</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            {MONTHS_NOM[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={goToday}
            className="hidden sm:flex"
          >
            Сегодня
          </Button>
          <Button size="icon" variant="outline" onClick={prevMonth} title="Предыдущий месяц">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={nextMonth} title="Следующий месяц">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* День недели заголовки */}
      <div className="border border-border">
        <div className="grid grid-cols-7">
          {WEEKDAYS_SHORT.map((d) => (
            <div
              key={d}
              className="label-mono text-center py-2 border-b border-r border-border last:border-r-0"
            >
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-xs font-mono uppercase tracking-tight flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {grid.map((cell, i) => {
              if (!cell.date || !cell.iso) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="border-b border-r border-border last:border-r-0 min-h-[88px] sm:min-h-[110px] bg-muted/30"
                  />
                )
              }
              const dayEntries = entriesByDate[cell.iso] ?? []
              const isToday = cell.iso === todayIso
              const dow = cell.date.getDay()
              const isWeekend = dow === 0 || dow === 6
              return (
                <button
                  type="button"
                  key={cell.iso}
                  onClick={() => openDay(cell.iso!)}
                  className={`group text-left border-b border-r border-border last:border-r-0 min-h-[88px] sm:min-h-[110px] p-1.5 sm:p-2 hover:bg-muted/40 transition-colors flex flex-col gap-1 ${
                    isToday ? 'frame' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isWeekend
                          ? 'text-[#dc2f02] font-bold'
                          : 'text-ink-soft'
                      } ${isToday ? 'font-bold' : ''}`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayEntries.length === 0 && (
                      <Plus className="h-3 w-3 text-ink-faint opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                  <div className="space-y-0.5 min-h-0 overflow-hidden">
                    {dayEntries.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center gap-1 text-[10px] sm:text-[11px] font-mono uppercase tracking-tight truncate"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 ${masterAvatarClass(
                            e.masterColor,
                          )}`}
                        />
                        <span className="truncate text-foreground">
                          {e.masterName}
                        </span>
                        <span className="text-ink-faint shrink-0">
                          {e.startHour}-{e.endHour}
                        </span>
                      </div>
                    ))}
                    {dayEntries.length > 3 && (
                      <div className="text-[10px] font-mono uppercase tracking-tight text-ink-faint">
                        +{dayEntries.length - 3} ещё
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Легенда */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="label-mono">Легенда:</span>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 frame" />
          <span className="text-[11px] font-mono uppercase tracking-tight text-ink-soft">
            сегодня
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-[#dc2f02] font-bold">•</span>
          <span className="text-[11px] font-mono uppercase tracking-tight text-ink-soft">
            выходной
          </span>
        </div>
        <span className="text-[11px] text-ink-faint font-mono uppercase tracking-tight ml-auto hidden sm:inline">
          Клик по дню — {canEdit ? 'редактировать' : 'посмотреть'}
        </span>
      </div>

      {/* Диалог дня */}
      <DayDialog
        iso={selectedDate}
        entries={selectedEntries}
        masters={masters}
        canEdit={canEdit}
        onClose={closeDay}
        onChanged={refreshAll}
      />
    </div>
  )
}

function DayDialog({
  iso,
  entries,
  masters,
  canEdit,
  onClose,
  onChanged,
}: {
  iso: string | null
  entries: ScheduleEntry[]
  masters: Master[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [masterId, setMasterId] = useState<string>('')
  const [startHour, setStartHour] = useState('12')
  const [endHour, setEndHour] = useState('23')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (iso) {
      setMasterId(masters[0]?.id ?? '')
      setStartHour('12')
      setEndHour('23')
      setNote('')
    }
  }, [iso, masters])

  if (!iso) return null

  const dateLabel = (() => {
    const d = new Date(iso)
    const wd = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][d.getDay()]
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
    return `${wd}, ${d.getDate()} ${months[d.getMonth()]}`
  })()

  const handleAdd = async () => {
    if (!masterId) {
      toast.error('Выберите мастера')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterId,
          date: iso,
          startHour: Number(startHour) || 12,
          endHour: Number(endHour) || 23,
          note: note.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Не удалось добавить')
      } else {
        toast.success(data.message || 'Добавлено')
        setNote('')
        onChanged()
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Не удалось удалить')
      } else {
        toast.success('Удалено')
        onChanged()
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={iso !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <span className="label-mono flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3" /> Смена
          </span>
          <DialogTitle>{dateLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-ink-soft body-sans py-2">
              {canEdit ? 'Нет запланированных смен. Добавьте ниже.' : 'Смен нет.'}
            </p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 border border-border p-2.5"
              >
                <span
                  className={`h-3 w-3 shrink-0 ${masterAvatarClass(
                    e.masterColor,
                  )}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-bold uppercase tracking-tight truncate">
                    {e.masterName}
                  </p>
                  <p className="label-mono">
                    {e.startHour}:00 — {e.endHour}:00
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-[#dc2f02] hover:bg-[#dc2f02] hover:text-white"
                    onClick={() => handleDelete(e.id)}
                    disabled={deletingId === e.id}
                    title="Удалить смену"
                  >
                    {deletingId === e.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {canEdit && (
          <div className="border-t border-border pt-4 space-y-3">
            <span className="label-mono block">Добавить мастера</span>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="label-mono">Мастер</Label>
                <Select value={masterId} onValueChange={setMasterId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите мастера" />
                  </SelectTrigger>
                  <SelectContent>
                    {masters.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.role === 'SENIOR' ? '⭐' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="label-mono">С часа</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={startHour}
                    onChange={(e) => setStartHour(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="label-mono">До часа</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={endHour}
                    onChange={(e) => setEndHour(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="label-mono">Заметка (необязательно)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="например, замена"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          {canEdit && (
            <Button onClick={handleAdd} disabled={saving || !masterId}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Добавить смену
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
