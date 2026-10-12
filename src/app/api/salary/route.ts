import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay, addDays } from '@/lib/datetime-utils'

// Фиксированные ставки по типу смены
const SHIFT_RATES: Record<string, number> = {
  full: 4400,
  morning: 2200,
  evening: 2200,
}

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

  const entries = await db.scheduleEntry.findMany({
    where: {
      masterId,
      date: { gte: fromDate, lt: toDate },
    },
    orderBy: { date: 'asc' },
  })

  // Считаем по типам смен
  let total = 0
  const shiftBreakdown: Record<string, { count: number; rate: number; sum: number }> = {
    full: { count: 0, rate: SHIFT_RATES.full, sum: 0 },
    morning: { count: 0, rate: SHIFT_RATES.morning, sum: 0 },
    evening: { count: 0, rate: SHIFT_RATES.evening, sum: 0 },
  }

  const shifts = entries.map((e) => {
    const shiftType = e.shiftType || 'full'
    const rate = SHIFT_RATES[shiftType] ?? SHIFT_RATES.full
    total += rate
    if (shiftBreakdown[shiftType]) {
      shiftBreakdown[shiftType].count++
      shiftBreakdown[shiftType].sum += rate
    } else {
      shiftBreakdown[shiftType] = { count: 1, rate, sum: rate }
    }
    return {
      id: e.id,
      date: e.date,
      shiftType,
      rate,
      note: e.note,
    }
  })

  return NextResponse.json({
    master: {
      id: master.id,
      name: master.name,
      role: master.role,
      color: master.color,
    },
    period: {
      from: fromDate,
      to: addDays(toDate, -1),
    },
    shifts,
    count: entries.length,
    shiftBreakdown,
    rates: SHIFT_RATES,
    total,
  })
}
