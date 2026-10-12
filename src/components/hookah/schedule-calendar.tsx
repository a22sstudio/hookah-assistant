'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  CalendarDays,
  Plane,
  Trash2,
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
  shiftType: string // morning | evening | full
  note: string | null
  isMine?: boolean
}

// Метки и цвета типов смены
const SHIFT_TYPES: Record<string, { label: string; short: string; icon: string }> = {
  morning: { label: 'Утренняя смена', short: 'УТР', icon: '☀️' },
  evening: { label: 'Вечерняя смена', short: 'ВЕЧ', icon: '🌙' },
  full: { label: 'Полная смена', short: 'ПОЛН', icon: '🕐' },
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
  const [vacations, setVacations] = useState<Array<{ id: string; masterId: string; masterName: string; date: string; note: string | null }>>([])
  const [vacationDialogOpen, setVacationDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEntries, setSelectedEntries] = useState<ScheduleEntry[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = toISODate(startOfMonth(cursor))
      const to = toISODate(endOfMonth(cursor))
      const [schedRes, vacRes] = await Promise.all([
        fetch(`/api/schedule?from=${from}&to=${to}`),
        fetch(`/api/vacations?from=${from}&to=${to}`),
      ])
      if (schedRes.ok) {
        const data = await schedRes.json()
        setEntries(data.entries ?? [])
      } else {
        toast.error('Не удалось загрузить график')
      }
      if (vacRes.ok) {
        const vacData = await vacRes.json()
        setVacations(vacData.vacations ?? [])
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

  // Отпуска по дате (iso → массив masterId)
  const vacationsByDate = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const v of vacations) {
      const key = toISODate(new Date(v.date))
      if (!map[key]) map[key] = []
      map[key].push(v.masterId)
    }
    return map
  }, [vacations])

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
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVacationDialogOpen(true)}
              className="hidden sm:flex"
            >
              <Plane className="h-4 w-4" />
              Отпуск
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={goToday} className="hidden sm:flex">
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
      <div className="border border-border rounded-md shadow-sm-soft overflow-hidden">
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
          <div className="p-12 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
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
              // Пятница (5) и Суббота (6) — выходные дни кальянной
              const isWeekend = dow === 5 || dow === 6
              const visible = dayEntries.slice(0, 4)
              const more = dayEntries.length - visible.length
              return (
                <button
                  type="button"
                  key={cell.iso}
                  onClick={() => openDay(cell.iso!)}
                  className={`group text-left border-b border-r border-border last:border-r-0 min-h-[88px] sm:min-h-[110px] p-1.5 sm:p-2 hover:bg-muted/40 transition-base transition-colors flex flex-col gap-1 ${
                    isToday ? 'frame-ember' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs tabular ${
                        isWeekend
                          ? 'text-ember font-bold'
                          : 'text-muted-foreground'
                      } ${isToday ? 'font-bold' : ''}`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayEntries.length === 0 && (
                      <Plus className="h-3 w-3 text-muted-foreground/70 opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                  <div className="space-y-0.5 min-h-0 overflow-hidden">
                    {visible.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center gap-1 label-mono-sm truncate"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 ${masterAvatarClass(
                            e.masterColor,
                          )} rounded-sm`}
                        />
                        <span className="truncate text-foreground">
                          {e.masterName}{' '}
                          <span className="text-muted-foreground">
                            ({e.shiftType === 'morning' ? 'У' : e.shiftType === 'evening' ? 'В' : 'П'})
                          </span>
                        </span>
                      </div>
                    ))}
                    {more > 0 && (
                      <div className="label-mono-sm text-muted-foreground">
                        +{more} ещё
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
          <div className="h-3 w-3 frame-ember rounded-sm" />
          <span className="label-mono-sm text-muted-foreground">
            сегодня
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-ember font-bold">•</span>
          <span className="label-mono-sm text-muted-foreground">
            выходной
          </span>
        </div>
        <span className="label-mono-sm ml-auto hidden sm:inline">
          Клик по дню — {canEdit ? 'редактировать' : 'посмотреть'}
        </span>
      </div>

      {/* Диалог дня */}
      <DayDialog
        iso={selectedDate}
        entries={selectedEntries}
        masters={masters}
        vacationMasterIds={selectedDate ? (vacationsByDate[selectedDate] ?? []) : []}
        dayVacations={vacations.filter((v) => {
          if (!selectedDate) return false
          return toISODate(new Date(v.date)) === selectedDate
        }).map((v) => ({ id: v.id, masterId: v.masterId, masterName: v.masterName, note: v.note }))}
        canEdit={canEdit}
        onClose={closeDay}
        onChanged={refreshAll}
      />

      {/* Диалог отпусков */}
      {canEdit && vacationDialogOpen && (
        <VacationDialog
          open={vacationDialogOpen}
          onOpenChange={setVacationDialogOpen}
          masters={masters}
          vacations={vacations}
          cursor={cursor}
          onChanged={refreshAll}
        />
      )}
    </div>
  )
}

function DayDialog({
  iso,
  entries,
  masters,
  vacationMasterIds,
  dayVacations,
  canEdit,
  onClose,
  onChanged,
}: {
  iso: string | null
  entries: ScheduleEntry[]
  masters: Master[]
  vacationMasterIds: string[]
  dayVacations: Array<{ id: string; masterId: string; masterName: string; note: string | null }>
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [masterId, setMasterId] = useState<string>('')
  const [note, setNote] = useState('')
  const [shiftType, setShiftType] = useState<string>('full')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (iso) {
      setMasterId(masters[0]?.id ?? '')
      setNote('')
      setShiftType('full')
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
          shiftType,
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
            <p className="text-sm text-muted-foreground body-sans py-2">
              {canEdit ? 'Нет запланированных смен. Добавьте ниже.' : 'Смен нет.'}
            </p>
          ) : (
            entries.map((e) => {
              return (
              <div
                key={e.id}
                className="flex items-center gap-2 border border-border rounded-md p-2.5"
              >
                <span
                  className={`h-3 w-3 shrink-0 ${masterAvatarClass(
                    e.masterColor,
                  )} rounded-sm`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-mono text-sm font-bold tracking-tight truncate">
                      {e.masterName}{' '}
                      <span className="text-muted-foreground font-normal">
                        ({e.shiftType === 'morning' ? 'У' : e.shiftType === 'evening' ? 'В' : 'П'})
                      </span>
                    </p>
                  </div>
                  {e.note && (
                    <p className="label-mono-sm text-muted-foreground mt-0.5 truncate">
                      {e.note}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-ember hover:bg-ember hover:text-ember-foreground"
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
              )
            })
          )}
        </div>

        {/* Отпуска в этот день */}
        {dayVacations.length > 0 && (
          <div className="border-t border-border pt-3 space-y-2">
            <span className="label-mono flex items-center gap-1.5">
              <Plane className="h-3 w-3" /> В отпуске
            </span>
            {dayVacations.map((v) => (
              <div key={v.id} className="flex items-center gap-2 rounded-md border border-border p-2 bg-muted/20">
                <span className="text-xs">✈</span>
                <span className="font-mono text-sm font-bold">{v.masterName}</span>
                {v.note && <span className="label-mono-sm text-muted-foreground">{v.note}</span>}
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 ml-auto"
                    onClick={async () => {
                      try {
                        await fetch(`/api/vacations?id=${v.id}`, { method: 'DELETE' })
                        toast.success('Отпуск удалён')
                        onChanged()
                      } catch {
                        toast.error('Ошибка')
                      }
                    }}
                    title="Удалить отпуск"
                  >
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="border-t border-border pt-4 space-y-3">
            <span className="label-mono block">Добавить мастера</span>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label>Мастер</Label>
                <Select value={masterId} onValueChange={setMasterId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите мастера" />
                  </SelectTrigger>
                  <SelectContent>
                    {masters.map((m) => {
                      const onVacation = vacationMasterIds.includes(m.id)
                      return (
                      <SelectItem key={m.id} value={m.id} disabled={onVacation}>
                        {m.name} {m.role === 'SENIOR' ? '⭐' : ''} {onVacation ? '✈ отпуск' : ''}
                      </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Тип смены</Label>
                <Select value={shiftType} onValueChange={setShiftType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">🕐 Полная смена</SelectItem>
                    <SelectItem value="morning">☀️ Утренняя смена</SelectItem>
                    <SelectItem value="evening">🌙 Вечерняя смена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Заметка (необязательно)</Label>
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

// ─── Vacation Dialog ───
function VacationDialog({
  open,
  onOpenChange,
  masters,
  vacations,
  cursor,
  onChanged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  masters: Master[]
  vacations: Array<{ id: string; masterId: string; masterName: string; date: string; note: string | null }>
  cursor: Date
  onChanged: () => void
}) {
  const [selectedMaster, setSelectedMaster] = useState('')
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Сетка месяца для выбора дат
  const grid = useMemo(() => {
    const first = startOfMonth(cursor)
    const last = endOfMonth(cursor)
    const firstDow = (first.getDay() + 6) % 7
    const totalDays = last.getDate()
    const cells: Array<{ date: Date | null; iso: string | null }> = []
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, iso: null })
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d)
      cells.push({ date, iso: toISODate(date) })
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, iso: null })
    return cells
  }, [cursor])

  const toggleDate = (iso: string) => {
    const next = new Set(selectedDates)
    if (next.has(iso)) next.delete(iso)
    else next.add(iso)
    setSelectedDates(next)
  }

  const handleSave = async () => {
    if (!selectedMaster) {
      toast.error('Выберите мастера')
      return
    }
    if (selectedDates.size === 0) {
      toast.error('Выберите хотя бы одну дату')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/vacations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterId: selectedMaster,
          dates: Array.from(selectedDates),
          note: note.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка')
        return
      }
      toast.success(data.message || 'Отпуск сохранён')
      setSelectedMaster('')
      setSelectedDates(new Set())
      setNote('')
      onChanged()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVacation = async (id: string) => {
    try {
      await fetch(`/api/vacations?id=${id}`, { method: 'DELETE' })
      toast.success('Дата отпуска удалена')
      onChanged()
    } catch {
      toast.error('Ошибка')
    }
  }

  // Группировка отпусков по мастеру
  const vacationsByMaster = useMemo(() => {
    const map: Record<string, Array<{ id: string; date: string; note: string | null }>> = {}
    for (const v of vacations) {
      if (!map[v.masterId]) map[v.masterId] = []
      map[v.masterId].push({ id: v.id, date: v.date, note: v.note })
    }
    return map
  }, [vacations])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6 gap-3 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="label-mono flex items-center gap-2">
            <Plane className="h-4 w-4" /> Отпуска
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-4">
          {/* Текущие отпуска */}
          {Object.keys(vacationsByMaster).length > 0 && (
            <div className="space-y-2">
              <span className="label-mono text-muted-foreground">Актуальные отпуска</span>
              {Object.entries(vacationsByMaster).map(([mId, dates]) => {
                const master = masters.find((m) => m.id === mId)
                return (
                  <div key={mId} className="rounded-md border border-border p-2 bg-muted/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold">{master?.name || 'Неизвестный'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {dates.map((d) => (
                        <span key={d.id} className="flex items-center gap-1 label-mono-sm px-2 py-0.5 rounded bg-muted">
                          {new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                          {d.note && <span className="text-muted-foreground">· {d.note}</span>}
                          <button
                            onClick={() => handleDeleteVacation(d.id)}
                            className="text-destructive hover:text-destructive/80 ml-1"
                            title="Удалить"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Форма создания */}
          <div className="border-t border-border pt-3 space-y-3">
            <span className="label-mono">Создать отпуск</span>
            <div className="space-y-1.5">
              <Label>Мастер</Label>
              <Select value={selectedMaster} onValueChange={setSelectedMaster}>
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

            <div className="space-y-1.5">
              <Label>Даты отпуска (нажмите чтобы выбрать)</Label>
              {/* Мини-календарь */}
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {WEEKDAYS_SHORT.map((d) => (
                  <div key={d} className="label-mono-sm text-muted-foreground py-1">{d}</div>
                ))}
                {grid.map((cell, i) => {
                  if (!cell.date || !cell.iso) {
                    return <div key={`empty-${i}`} className="min-h-[32px]" />
                  }
                  const selected = selectedDates.has(cell.iso)
                  const hasVacation = vacations.some((v) => toISODate(new Date(v.date)) === cell.iso)
                  return (
                    <button
                      key={cell.iso}
                      onClick={() => toggleDate(cell.iso)}
                      className={`min-h-[32px] rounded text-xs font-mono tabular transition-base ${
                        selected
                          ? 'bg-ember text-ember-foreground font-bold'
                          : hasVacation
                            ? 'bg-muted/50 text-muted-foreground'
                            : 'border border-border hover:bg-muted/50'
                      }`}
                    >
                      {cell.date.getDate()}
                    </button>
                  )
                })}
              </div>
              {selectedDates.size > 0 && (
                <p className="label-mono-sm text-muted-foreground">
                  Выбрано: {selectedDates.size} дат
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Заметка (необязательно)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="например, плановый отпуск"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Сохранить отпуск
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
