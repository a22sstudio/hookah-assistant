import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay, addDays } from '@/lib/datetime-utils'

// Проверка что текущий пользователь — старший мастер
async function requireSenior() {
  const me = await getCurrentMaster()
  if (!me) {
    return {
      error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }),
      me: null,
    }
  }
  if (me.role !== 'SENIOR') {
    return {
      error: NextResponse.json(
        { error: 'Только старший мастер может считать зарплату' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// GET /api/salary?masterId=&from=&to=
// Возвращает закрытые смены мастера в диапазоне, ставку, итог.
export async function GET(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const { searchParams } = new URL(req.url)
  const masterId = searchParams.get('masterId')
  const fromQuery = searchParams.get('from')
  const toQuery = searchParams.get('to')

  if (!masterId) {
    return NextResponse.json({ error: 'masterId обязателен' }, { status: 400 })
  }

  // Период по умолчанию — текущий месяц
  const today = new Date()
  const defaultFrom = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1))
  const defaultTo = addDays(
    startOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    1,
  )

  const fromDate = fromQuery ? startOfDay(new Date(fromQuery)) : defaultFrom
  const toDate = toQuery ? addDays(startOfDay(new Date(toQuery)), 1) : defaultTo

  const master = await db.master.findUnique({ where: { id: masterId } })
  if (!master) {
    return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })
  }

  // Закрытые смены в диапазоне по openedAt
  const shifts = await db.shift.findMany({
    where: {
      masterId,
      status: 'CLOSED',
      openedAt: { gte: fromDate, lt: toDate },
    },
    orderBy: { openedAt: 'asc' },
  })

  const rate = master.rate
  const count = shifts.length
  const total = count * rate

  return NextResponse.json({
    master: {
      id: master.id,
      name: master.name,
      role: master.role,
      color: master.color,
      rate,
    },
    period: {
      from: fromDate,
      to: addDays(toDate, -1),
    },
    shifts: shifts.map((s) => ({
      id: s.id,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      hookahCount: s.hookahCount,
      note: s.note,
    })),
    count,
    rate,
    total,
  })
}
