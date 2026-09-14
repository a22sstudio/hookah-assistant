import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay, addDays, formatDateRu, formatFullDateRu } from '@/lib/datetime-utils'

// GET /api/dashboard — сводка для домашнего экрана
// Возвращает:
// - today: кто работает сегодня (включая "ты" флаг)
// - tomorrow: кто работает завтра
// - myNextShift: ближайшая смена мастера (для REGULAR)
// - lowStockCount: сколько табака с остатком ниже порога
// - lowConsumablesCount: сколько расходников мало (SENIOR видит)
// - pendingRequestsCount: ожидающие заявки
// - pendingWishesCount: ожидающие хотелки
// - myMonthShifts: смен в текущем месяце (ScheduleEntry count для меня)
export async function GET() {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)

  // Кто работает сегодня
  const todayEntries = await db.scheduleEntry.findMany({
    where: { date: today },
    include: { master: true },
    orderBy: { createdAt: 'asc' },
  })

  // Кто работает завтра
  const tomorrowEntries = await db.scheduleEntry.findMany({
    where: { date: tomorrow },
    include: { master: true },
    orderBy: { createdAt: 'asc' },
  })

  const isSenior = me.role === 'SENIOR'

  const todayList = todayEntries.map((e) => ({
    id: e.id,
    masterId: e.masterId,
    masterName: e.master.name,
    masterColor: e.master.color,
    masterRole: e.master.role,
    isMine: e.masterId === me.id,
    note: e.note,
  }))

  const tomorrowList = tomorrowEntries.map((e) => ({
    id: e.id,
    masterId: e.masterId,
    masterName: e.master.name,
    masterColor: e.master.color,
    masterRole: e.master.role,
    isMine: e.masterId === me.id,
    note: e.note,
  }))

  // Моя смена сегодня
  const myTodayEntry = todayEntries.find((e) => e.masterId === me.id) ?? null

  // Моя следующая смена (если сегодня нет — ищем ближайшую будущую)
  let myNextShift: { date: string; dateLabel: string } | null = null
  if (!myTodayEntry) {
    const monthAhead = addDays(today, 60)
    const next = await db.scheduleEntry.findFirst({
      where: {
        masterId: me.id,
        date: { gte: tomorrow, lte: monthAhead },
      },
      orderBy: { date: 'asc' },
    })
    if (next) {
      myNextShift = {
        date: next.date.toISOString(),
        dateLabel: formatFullDateRu(next.date),
      }
    }
  }

  // Сколько табака "мало"
  const tobaccos = await db.tobacco.findMany({
    where: { active: true },
    include: { stock: true },
  })
  const lowStockCount = tobaccos.filter(
    (t) => (t.stock?.currentGrams ?? 0) < t.thresholdGrams,
  ).length

  // Расходники "мало" — только SENIOR
  let lowConsumablesCount = 0
  if (isSenior) {
    const consumables = await db.consumable.findMany({ where: { active: true } })
    lowConsumablesCount = consumables.filter((c) => c.currentQty < c.threshold).length
  }

  // Ожидающие заявки
  const pendingRequestsCount = await db.masterRequest.count({
    where: { status: 'PENDING' },
  })

  // Ожидающие хотелки
  const pendingWishesCount = await db.wish.count({
    where: { status: 'PENDING' },
  })

  // Мои смены в текущем месяце (ScheduleEntry count для меня)
  const monthStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthEnd = addDays(startOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)), 1)
  const myMonthShifts = await db.scheduleEntry.count({
    where: {
      masterId: me.id,
      date: { gte: monthStart, lt: monthEnd },
    },
  })

  // Метки дат
  const todayLabel = formatFullDateRu(today)
  const tomorrowLabel = formatFullDateRu(tomorrow)
  const todayShort = formatDateRu(today)
  const tomorrowShort = formatDateRu(tomorrow)

  return NextResponse.json({
    isSenior,
    today: {
      date: today.toISOString(),
      label: todayLabel,
      short: todayShort,
      entries: todayList,
    },
    tomorrow: {
      date: tomorrow.toISOString(),
      label: tomorrowLabel,
      short: tomorrowShort,
      entries: tomorrowList,
    },
    myTodayEntry: myTodayEntry
      ? { id: myTodayEntry.id, note: myTodayEntry.note }
      : null,
    myNextShift,
    lowStockCount,
    lowConsumablesCount,
    pendingRequestsCount,
    pendingWishesCount,
    myMonthShifts,
  })
}
