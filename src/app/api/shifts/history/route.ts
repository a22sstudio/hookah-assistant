import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay, addDays } from '@/lib/datetime-utils'

// GET /api/shifts/history?masterId=&from=&to=&sort=
// Возвращает закрытые И открытые смены в диапазоне
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const masterId = searchParams.get('masterId') || undefined
  const fromQuery = searchParams.get('from')
  const toQuery = searchParams.get('to')
  const sort = searchParams.get('sort') || 'date_desc'

  // По умолчанию: последние 30 дней
  const today = startOfDay()
  const fromDate = fromQuery ? startOfDay(new Date(fromQuery)) : addDays(today, -30)
  const toDate = toQuery ? addDays(startOfDay(new Date(toQuery)), 1) : addDays(today, 1)

  const where: {
    OR: Array<{ status: string } | { openedAt: { gte: Date; lt: Date } }>
    masterId?: string
  } = {
    OR: [
      // Закрытые смены в диапазоне (по openedAt)
      { status: 'CLOSED', openedAt: { gte: fromDate, lt: toDate } },
      // Открытые смены, открытые в диапазоне
      { status: 'OPEN', openedAt: { gte: fromDate, lt: toDate } },
    ],
  }
  if (masterId) where.masterId = masterId

  const shifts = await db.shift.findMany({
    where,
    include: { master: true },
    orderBy: { openedAt: 'desc' },
    take: 500,
  })

  // Подсчёт заявок и хотелок, созданных во время смены
  const enriched = await Promise.all(
    shifts.map(async (s) => {
      const from = s.openedAt
      const to = s.closedAt ?? new Date()
      const [requestsCount, wishesCount] = await Promise.all([
        db.masterRequest.count({
          where: { masterId: s.masterId, createdAt: { gte: from, lt: to } },
        }),
        db.wish.count({
          where: { masterId: s.masterId, createdAt: { gte: from, lt: to } },
        }),
      ])
      return {
        id: s.id,
        masterId: s.masterId,
        masterName: s.master.name,
        masterColor: s.master.color,
        masterRole: s.master.role,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        hookahCount: s.hookahCount,
        requestsCount,
        wishesCount,
        note: s.note,
      }
    }),
  )

  // Сортировка
  const sorted = [...enriched]
  switch (sort) {
    case 'date_asc':
      sorted.sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
      break
    case 'date_desc':
      sorted.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
      break
    case 'hookah_asc':
      sorted.sort((a, b) => a.hookahCount - b.hookahCount)
      break
    case 'hookah_desc':
      sorted.sort((a, b) => b.hookahCount - a.hookahCount)
      break
    default:
      sorted.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  }

  // Итоги
  const totals = {
    shifts: sorted.length,
    hookahs: sorted.reduce((sum, s) => sum + s.hookahCount, 0),
    requests: sorted.reduce((sum, s) => sum + s.requestsCount, 0),
    wishes: sorted.reduce((sum, s) => sum + s.wishesCount, 0),
  }

  return NextResponse.json({
    shifts: sorted,
    totals,
  })
}
