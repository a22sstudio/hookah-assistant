import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import {
  startOfDay, addDays, parseDateFromText, formatDateRu, formatFullDateRu, weekdayRu,
} from '@/lib/datetime-utils'

// GET /api/daily-summary — сводка за день
// ?date=2026-09-10 (по умолчанию сегодня)
// ?role=senior — расширенная для старшего (по всем мастерам)
//
// ВАЖНО: система смен удалена (redesign-7). Теперь сводка строится по графику
// (ScheduleEntry). Если у мастера нет ScheduleEntry на день — он не работал.
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dateQuery = searchParams.get('date')

  let targetDate: Date
  if (dateQuery) {
    const parsed = parseDateFromText(dateQuery)
    if (!parsed) {
      return NextResponse.json({ error: `Не удалось распознать дату: "${dateQuery}"` }, { status: 400 })
    }
    targetDate = startOfDay(parsed)
  } else {
    targetDate = startOfDay()
  }
  const nextDay = addDays(targetDate, 1)

  // Кто был запланирован на этот день
  const scheduledEntries = await db.scheduleEntry.findMany({
    where: {
      date: { gte: targetDate, lt: nextDay },
    },
    include: { master: true },
    orderBy: { createdAt: 'asc' },
  })

  // Операции по остаткам (ADJUSTMENT) за день
  const operations = await db.operation.findMany({
    where: {
      createdAt: { gte: targetDate, lt: nextDay },
      type: 'ADJUSTMENT',
    },
    include: { tobacco: true },
    orderBy: { createdAt: 'asc' },
  })

  // Заявки мастеров
  const requests = await db.masterRequest.findMany({
    where: { createdAt: { gte: targetDate, lt: nextDay } },
    include: { master: true },
    orderBy: { createdAt: 'asc' },
  })

  // Хотелки
  const wishes = await db.wish.findMany({
    where: { createdAt: { gte: targetDate, lt: nextDay } },
    include: { master: true },
    orderBy: { createdAt: 'asc' },
  })

  // Для обычного мастера — только его данные
  const isSenior = me.role === 'SENIOR'
  const myEntry = scheduledEntries.find((e) => e.masterId === me.id) ?? null
  const myOperations = operations.filter(() => true)
  const myRequests = requests.filter((r) => r.masterId === me.id)
  const myWishes = wishes.filter((w) => w.masterId === me.id)

  const mySummary = myEntry
    ? {
        date: formatDateRu(targetDate),
        weekday: weekdayRu(targetDate),
        stockAdjustments: myOperations.length,
        requestsCreated: myRequests.length,
        wishesCreated: myWishes.length,
        scheduledAt: myEntry.date,
      }
    : null

  if (!isSenior) {
    return NextResponse.json({
      date: targetDate,
      dateLabel: formatDateRu(targetDate),
      weekday: weekdayRu(targetDate),
      summary: mySummary,
      myRequests: myRequests.map((r) => ({ text: r.text, status: r.status })),
      myWishes: myWishes.map((w) => ({ text: w.text, status: w.status })),
    })
  }

  // Расширенная сводка для старшего
  const allMasterSummaries = scheduledEntries.map((e) => {
    const masterReqs = requests.filter((r) => r.masterId === e.masterId)
    const masterWishes = wishes.filter((w) => w.masterId === e.masterId)
    return {
      masterId: e.masterId,
      masterName: e.master.name,
      masterColor: e.master.color,
      scheduledAt: e.date,
      requestsCreated: masterReqs.length,
      wishesCreated: masterWishes.length,
      requests: masterReqs.map((r) => r.text),
      wishes: masterWishes.map((w) => w.text),
    }
  })

  // Итоги
  const totalRequests = requests.length
  const totalWishes = wishes.length
  const totalOperations = operations.length

  // Табаки которые были отмечены (с дельтами)
  const tobaccoDeltas = operations.reduce((acc, op) => {
    const key = `${op.tobacco?.brand} ${op.tobacco?.line} ${op.tobacco?.flavor}`
    if (!acc[key]) acc[key] = { before: op.gramsBefore, after: op.gramsAfter, delta: 0, count: 0 }
    acc[key].delta += op.delta
    acc[key].count += 1
    acc[key].after = op.gramsAfter
    return acc
  }, {} as Record<string, { before: number; after: number; delta: number; count: number }>)

  return NextResponse.json({
    date: targetDate,
    dateLabel: formatFullDateRu(targetDate),
    isSenior: true,
    totals: {
      scheduledMastersCount: scheduledEntries.length,
      totalRequests,
      totalWishes,
      totalOperations,
    },
    masters: allMasterSummaries,
    requests: requests.map((r) => ({ master: r.master.name, text: r.text, status: r.status })),
    wishes: wishes.map((w) => ({ master: w.master.name, text: w.text, status: w.status })),
    tobaccoDeltas,
    mySummary,
  })
}
