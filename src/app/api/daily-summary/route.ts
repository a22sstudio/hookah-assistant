import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import {
  startOfDay, addDays, parseDateFromText, formatDateRu, formatFullDateRu, weekdayRu,
} from '@/lib/datetime-utils'

// GET /api/daily-summary — сводка за день
// ?date=2026-09-10 (по умолчанию сегодня)
// ?role=senior — расширенная для старшего (по всем мастерам)
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

  // Смены за этот день
  const shifts = await db.shift.findMany({
    where: {
      openedAt: { gte: targetDate, lt: nextDay },
    },
    include: { master: true },
    orderBy: { openedAt: 'asc' },
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
  const myShift = shifts.find((s) => s.masterId === me.id) ?? null
  const myOperations = operations.filter((op) => op.tobacco?.id) // упрощено
  const myRequests = requests.filter((r) => r.masterId === me.id)
  const myWishes = wishes.filter((w) => w.masterId === me.id)

  // Короткая сводка для мастера
  const mySummary = myShift
    ? {
        date: formatDateRu(targetDate),
        weekday: weekdayRu(targetDate),
        hookahCount: myShift.hookahCount,
        shiftDuration: myShift.closedAt
          ? `${Math.round((myShift.closedAt.getTime() - myShift.openedAt.getTime()) / 3600000)}ч`
          : `${Math.round((Date.now() - myShift.openedAt.getTime()) / 3600000)}ч`,
        stockAdjustments: myOperations.length,
        requestsCreated: myRequests.length,
        wishesCreated: myWishes.length,
        shiftOpenedAt: myShift.openedAt,
        shiftClosedAt: myShift.closedAt,
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
  const allMasterSummaries = await Promise.all(
    shifts.map(async (s) => {
      const masterOps = operations.filter(() => true) // упрощено
      const masterReqs = requests.filter((r) => r.masterId === s.masterId)
      const masterWishes = wishes.filter((w) => w.masterId === s.masterId)
      return {
        masterId: s.masterId,
        masterName: s.master.name,
        masterColor: s.master.color,
        hookahCount: s.hookahCount,
        shiftOpenedAt: s.openedAt,
        shiftClosedAt: s.closedAt,
        shiftDuration: s.closedAt
          ? `${Math.round((s.closedAt.getTime() - s.openedAt.getTime()) / 3600000)}ч`
          : `${Math.round((Date.now() - s.openedAt.getTime()) / 3600000)}ч`,
        isCurrentlyOpen: !s.closedAt,
        requestsCreated: masterReqs.length,
        wishesCreated: masterWishes.length,
        requests: masterReqs.map((r) => r.text),
        wishes: masterWishes.map((w) => w.text),
      }
    }),
  )

  // Итоги
  const totalHookahs = shifts.reduce((sum, s) => sum + s.hookahCount, 0)
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
      shiftsCount: shifts.length,
      totalHookahs,
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
