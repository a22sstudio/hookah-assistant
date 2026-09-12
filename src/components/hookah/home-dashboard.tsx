'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CalendarCheck,
  CalendarOff,
  CalendarRange,
  Users,
  Loader2,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { masterAvatarClass, initials } from '@/lib/master-utils'

interface ScheduleEntry {
  id: string
  date: string
  masterId: string
  masterName: string
  masterColor: string
  masterRole: string
  note: string | null
  isMine?: boolean
}

interface HomeDashboardProps {
  master: {
    id: string
    name: string
    role: 'SENIOR' | 'REGULAR'
    color: string
  }
  refreshKey: number
  onRefresh?: () => void
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d: Date, n: number): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() + n)
  return x
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

const WEEKDAYS_FULL = [
  'воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота',
]
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function formatDateRu(d: Date): string {
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
}
function weekdayRu(d: Date): string {
  return WEEKDAYS_FULL[d.getDay()]
}

export function HomeDashboard({ master, refreshKey }: HomeDashboardProps) {
  const [todayEntries, setTodayEntries] = useState<ScheduleEntry[]>([])
  const [tomorrowEntries, setTomorrowEntries] = useState<ScheduleEntry[]>([])
  const [monthEntries, setMonthEntries] = useState<ScheduleEntry[]>([])
  const [nextEntry, setNextEntry] = useState<ScheduleEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const isSenior = master.role === 'SENIOR'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = startOfDay(new Date())
      const tomorrow = addDays(today, 1)
      const monthStart = startOfMonth(today)
      const monthEnd = endOfMonth(today)
      const nextMonthStart = addDays(monthEnd, 1)
      // Берём с запасом 60 дней, чтобы найти "следующую смену" после сегодняшнего дня
      const lookAheadEnd = addDays(today, 60)

      const [todayRes, tomorrowRes, monthRes, lookaheadRes] = await Promise.all([
        fetch(`/api/schedule?from=${toISODate(today)}&to=${toISODate(today)}`),
        fetch(`/api/schedule?from=${toISODate(tomorrow)}&to=${toISODate(tomorrow)}`),
        fetch(`/api/schedule?from=${toISODate(monthStart)}&to=${toISODate(monthEnd)}`),
        fetch(`/api/schedule?from=${toISODate(nextMonthStart)}&to=${toISODate(lookAheadEnd)}`),
      ])

      const todayData = todayRes.ok ? await todayRes.json() : { entries: [] }
      const tomorrowData = tomorrowRes.ok ? await tomorrowRes.json() : { entries: [] }
      const monthData = monthRes.ok ? await monthRes.json() : { entries: [] }
      const lookaheadData = lookaheadRes.ok ? await lookaheadRes.json() : { entries: [] }

      setTodayEntries(todayData.entries ?? [])
      setTomorrowEntries(tomorrowData.entries ?? [])
      setMonthEntries(monthData.entries ?? [])

      // Следующая смена мастера после сегодняшнего дня
      const myNext = (lookaheadData.entries ?? []).find(
        (e: ScheduleEntry) => e.masterId === master.id,
      )
      setNextEntry(myNext ?? null)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [master.id])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Тикер для обновления "сегодня/завтра" в полночь (раз в минуту — мягко)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000)
    return () => clearInterval(t)
  }, [])
  void tick

  const iWorkToday = useMemo(
    () => todayEntries.some((e) => e.masterId === master.id),
    [todayEntries, master.id],
  )

  const myMonthCount = useMemo(
    () => monthEntries.filter((e) => e.masterId === master.id).length,
    [monthEntries, master.id],
  )

  const todayOthers = useMemo(
    () => todayEntries.filter((e) => e.masterId !== master.id),
    [todayEntries, master.id],
  )

  // Завтра — моя смена?
  const iWorkTomorrow = tomorrowEntries.some((e) => e.masterId === master.id)

  // Сводка по месяцу для старшего
  const totalScheduledThisMonth = monthEntries.length
  const uniqueMastersThisMonth = useMemo(
    () => new Set(monthEntries.map((e) => e.masterId)).size,
    [monthEntries],
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground label-mono">
          <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Hero-блок */}
      <Card className={`frame-strong shadow-sm-soft overflow-hidden`}>
        <CardContent className="p-0">
          {/* Top label */}
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <div className="flex items-center gap-2 label-mono">
              <span
                className={`relative flex h-1.5 w-1.5 ${iWorkToday ? '' : 'opacity-50'}`}
              >
                {iWorkToday && (
                  <span className="animate-ping absolute inline-flex h-full w-full bg-ember opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 ${iWorkToday ? 'bg-ember' : 'bg-muted-foreground'}`}
                />
              </span>
              <span className={iWorkToday ? 'text-ember' : ''}>
                {weekdayRu(new Date())}
              </span>
              <span className="text-muted-foreground/70">
                · {formatDateRu(new Date())}
              </span>
            </div>
          </div>

          {/* Big headline */}
          <div className="px-6 pb-6">
            {iWorkToday ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <CalendarCheck className="h-7 w-7 text-ember shrink-0" />
                  <h2
                    className="heading-mono text-foreground leading-none"
                    style={{ fontSize: 'clamp(28px, 5vw, 40px)' }}
                  >
                    Сегодня твоя смена
                  </h2>
                </div>
                <p className="body-sans text-sm text-muted-foreground">
                  Удачной смены, {master.name}. Заполняй остатки, оставляй заявки —
                  старший видит всё в реальном времени.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <CalendarOff className="h-7 w-7 text-muted-foreground shrink-0" />
                  <h2
                    className="heading-mono text-foreground leading-none"
                    style={{ fontSize: 'clamp(28px, 5vw, 40px)' }}
                  >
                    Сегодня выходной
                  </h2>
                </div>
                {todayOthers.length > 0 ? (
                  <p className="body-sans text-sm text-muted-foreground">
                    За стойкой:{' '}
                    <span className="text-foreground font-bold">
                      {todayOthers.map((e) => e.masterName).join(', ')}
                    </span>
                    .
                  </p>
                ) : (
                  <p className="body-sans text-sm text-muted-foreground">
                    Сегодня никого не запланировано.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Кому показываем сегодня/завтра для старшего */}
      {isSenior && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Сегодня */}
          <Card className="border border-border shadow-sm-soft">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 label-mono mb-3">
                <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
                Сегодня работают
              </div>
              {todayEntries.length === 0 ? (
                <p className="body-sans text-sm text-muted-foreground">
                  Никого на сегодня.
                </p>
              ) : (
                <div className="space-y-2 stagger-children">
                  {todayEntries.map((e) => (
                    <MasterPill key={e.id} entry={e} isMe={e.masterId === master.id} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Завтра */}
          <Card className="border border-border shadow-sm-soft">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 label-mono mb-3">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />
                Завтра
              </div>
              {tomorrowEntries.length === 0 ? (
                <p className="body-sans text-sm text-muted-foreground">
                  На завтра графика нет.
                </p>
              ) : (
                <div className="space-y-2 stagger-children">
                  {tomorrowEntries.map((e) => (
                    <MasterPill key={e.id} entry={e} isMe={e.masterId === master.id} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Для обычного мастера — следующая смена */}
      {!isSenior && nextEntry && (
        <Card className="border border-border shadow-sm-soft">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-11 w-11 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
              <CalendarRange className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="label-mono">Твоя следующая смена</p>
              <p className="body-sans text-sm font-bold text-foreground mt-1">
                {capitalize(weekdayRu(new Date(nextEntry.date)))}
                {', '}
                {formatDateRu(new Date(nextEntry.date))}
              </p>
            </div>
            {nextEntry.note && (
              <p className="label-mono-sm text-muted-foreground text-right truncate max-w-[40%]">
                {nextEntry.note}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Блок: "В этом месяце" + быстрые ссылки */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border border-border shadow-sm-soft">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="label-mono">
                {isSenior ? 'Всего смен' : 'Моих смен'}
              </span>
              <CalendarRange className="h-3.5 w-3.5 text-muted-foreground/70" />
            </div>
            <span
              className="font-mono font-bold leading-none tabular text-foreground"
              style={{ fontSize: 'clamp(32px, 5vw, 44px)' }}
            >
              {isSenior ? totalScheduledThisMonth : myMonthCount}
            </span>
            <span className="label-mono-sm text-muted-foreground">
              в этом месяце
            </span>
          </CardContent>
        </Card>

        {isSenior && (
          <Card className="border border-border shadow-sm-soft">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="label-mono">Мастеров</span>
                <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              <span
                className="font-mono font-bold leading-none tabular text-foreground"
                style={{ fontSize: 'clamp(32px, 5vw, 44px)' }}
              >
                {uniqueMastersThisMonth}
              </span>
              <span className="label-mono-sm text-muted-foreground">
                в графике
              </span>
            </CardContent>
          </Card>
        )}

        {!isSenior && iWorkTomorrow && (
          <Card className="frame-ember shadow-sm-soft">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="label-mono text-ember">Завтра</span>
                <Sparkles className="h-3.5 w-3.5 text-ember" />
              </div>
              <span
                className="heading-mono text-ember leading-none"
                style={{ fontSize: 'clamp(20px, 3vw, 26px)' }}
              >
                твоя смена
              </span>
              <span className="label-mono-sm text-muted-foreground">
                готовься заранее
              </span>
            </CardContent>
          </Card>
        )}

        {/* Подсказка про /schedule в боте */}
        <Card className="border border-border shadow-sm-soft sm:col-span-1">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="label-mono">Бот</span>
              <span className="label-mono-sm text-muted-foreground/70">Telegram</span>
            </div>
            <p className="body-sans text-sm text-foreground leading-snug">
              График в боте:{' '}
              <span className="font-mono text-foreground bg-muted px-1.5 py-0.5 rounded-sm">
                /schedule
              </span>
            </p>
            <p className="label-mono-sm text-muted-foreground">
              узнай кто работает
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => {
          window.dispatchEvent(new CustomEvent('home-goto', { detail: 'requests' }))
        }}>
          <ChevronRight className="h-3.5 w-3.5" /> Заявки
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          window.dispatchEvent(new CustomEvent('home-goto', { detail: 'stock' }))
        }}>
          <ChevronRight className="h-3.5 w-3.5" /> Склад
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          window.dispatchEvent(new CustomEvent('home-goto', { detail: 'schedule' }))
        }}>
          <ChevronRight className="h-3.5 w-3.5" /> График
        </Button>
        {isSenior && (
          <Button variant="outline" size="sm" onClick={() => {
            window.dispatchEvent(new CustomEvent('home-goto', { detail: 'orders' }))
          }}>
            <ChevronRight className="h-3.5 w-3.5" /> Заказ
          </Button>
        )}
      </div>
    </div>
  )
}

function MasterPill({ entry, isMe }: { entry: ScheduleEntry; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 border rounded-md p-2 transition-base ${
        isMe ? 'frame-ember' : 'border-border'
      }`}
    >
      <div
        className={`h-8 w-8 shrink-0 ${masterAvatarClass(
          entry.masterColor,
        )} flex items-center justify-center text-[10px] font-mono font-bold text-white rounded-md`}
      >
        {initials(entry.masterName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="body-sans text-sm font-bold text-foreground truncate">
          {entry.masterName}
          {entry.masterRole === 'SENIOR' && (
            <span className="ml-1.5 text-ember">⭐</span>
          )}
          {isMe && (
            <span className="ml-1.5 label-mono-sm text-muted-foreground">ты</span>
          )}
        </p>
        {entry.note && (
          <p className="label-mono-sm text-muted-foreground truncate">
            {entry.note}
          </p>
        )}
      </div>
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
