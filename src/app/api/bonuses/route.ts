import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay } from '@/lib/datetime-utils'

const SHIFT_RATES: Record<string, number> = {
  full: 4400,
  morning: 2200,
  evening: 2200,
}

// GET /api/bonuses?year=2026&month=10 — список премий за месяц (только старший)
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

  const bonuses = await db.bonus.findMany({
    where: { year, month },
    include: { master: { select: { id: true, name: true, color: true } } },
    orderBy: { master: { name: 'asc' } },
  })

  return NextResponse.json({
    bonuses: bonuses.map((b) => ({
      id: b.id,
      masterId: b.masterId,
      masterName: b.master.name,
      masterColor: b.master.color,
      year: b.year,
      month: b.month,
      amount: b.amount,
      note: b.note,
    })),
    year,
    month,
  })
}

// POST /api/bonuses — создать/обновить премию (только старший)
// body: { masterId, year, month, amount, note? }
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { masterId, year, month, amount, note } = body as {
      masterId?: string
      year?: number
      month?: number
      amount?: number
      note?: string
    }

    if (!masterId) return NextResponse.json({ error: 'masterId обязателен' }, { status: 400 })
    if (!year || !month) return NextResponse.json({ error: 'year и month обязательны' }, { status: 400 })
    if (typeof amount !== 'number' || amount < 0) {
      return NextResponse.json({ error: 'amount должен быть числом ≥ 0' }, { status: 400 })
    }

    const master = await db.master.findUnique({ where: { id: masterId } })
    if (!master) return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })

    // Upsert премии (unique [masterId, year, month])
    const bonus = await db.bonus.upsert({
      where: { masterId_year_month: { masterId, year, month } },
      update: { amount: Math.floor(amount), note: note?.trim() || null },
      create: {
        masterId,
        year,
        month,
        amount: Math.floor(amount),
        note: note?.trim() || null,
      },
    })

    // Если месяц уже закрыт (прошёл) — обновляем/создаём Payslip
    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)

    if (isPastMonth || (isCurrentMonth && now.getDate() >= new Date(year, month, 0).getDate())) {
      // Считаем суммы за половины месяца
      const monthStart = startOfDay(new Date(year, month - 1, 1))
      const monthEnd = new Date(year, month, 1)

      const entries = await db.scheduleEntry.findMany({
        where: { masterId, date: { gte: monthStart, lt: monthEnd } },
      })

      let firstHalf = 0
      let secondHalf = 0
      for (const e of entries) {
        const day = new Date(e.date).getDate()
        const rate = SHIFT_RATES[e.shiftType || 'full'] ?? SHIFT_RATES.full
        if (day <= 15) firstHalf += rate
        else secondHalf += rate
      }

      const total = firstHalf + secondHalf + Math.floor(amount)

      await db.payslip.upsert({
        where: { masterId_year_month: { masterId, year, month } },
        update: {
          firstHalfAmount: firstHalf,
          secondHalfAmount: secondHalf,
          bonusAmount: Math.floor(amount),
          totalAmount: total,
        },
        create: {
          masterId,
          year,
          month,
          firstHalfAmount: firstHalf,
          secondHalfAmount: secondHalf,
          bonusAmount: Math.floor(amount),
          totalAmount: total,
          status: 'closed',
        },
      })
    }

    return NextResponse.json({
      bonus: { id: bonus.id, masterId, year, month, amount: bonus.amount, note: bonus.note },
      message: `Премия ${bonus.amount}₽ для ${master.name} (${month}/${year})`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Не удалось сохранить премию', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// DELETE /api/bonuses?id=xxx — удалить премию (только старший)
export async function DELETE(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  await db.bonus.delete({ where: { id } })
  return NextResponse.json({ ok: true, message: 'Премия удалена' })
}
