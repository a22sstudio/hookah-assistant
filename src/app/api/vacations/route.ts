import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay, addDays } from '@/lib/datetime-utils'

// GET /api/vacations?from=&to= — список отпусков в диапазоне
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const fromQuery = searchParams.get('from')
  const toQuery = searchParams.get('to')

  const fromDate = fromQuery ? startOfDay(new Date(fromQuery)) : startOfDay()
  const toDate = toQuery ? addDays(startOfDay(new Date(toQuery)), 1) : addDays(startOfDay(), 90)

  const vacations = await db.vacation.findMany({
    where: {
      date: { gte: fromDate, lt: toDate },
    },
    include: { master: { select: { id: true, name: true, color: true } } },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({
    vacations: vacations.map((v) => ({
      id: v.id,
      masterId: v.masterId,
      masterName: v.master.name,
      masterColor: v.master.color,
      date: v.date,
      note: v.note,
    })),
    // Группировка по мастеру для удобства
    byMaster: vacations.reduce((acc, v) => {
      const key = v.masterId
      if (!acc[key]) acc[key] = { masterName: v.master.name, masterColor: v.master.color, dates: [] }
      acc[key].dates.push({ id: v.id, date: v.date, note: v.note })
      return acc
    }, {} as Record<string, { masterName: string; masterColor: string; dates: Array<{ id: string; date: Date; note: string | null }> }>),
  })
}

// POST /api/vacations — создать отпуск
// body: { masterId, dates: ["2026-10-02", "2026-10-15"], note? }
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { masterId, dates, note } = body as {
      masterId?: string
      dates?: string[]
      note?: string
    }

    if (!masterId) return NextResponse.json({ error: 'masterId обязателен' }, { status: 400 })
    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: 'Укажите хотя бы одну дату' }, { status: 400 })
    }

    const master = await db.master.findUnique({ where: { id: masterId } })
    if (!master) return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })

    let created = 0
    let skipped = 0
    for (const dateStr of dates) {
      try {
        await db.vacation.create({
          data: {
            masterId,
            date: startOfDay(new Date(dateStr)),
            note: note?.trim() || null,
          },
        })
        created++
      } catch {
        skipped++ // duplicate (unique constraint)
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      message: `Отпуск: добавлено ${created} дат${skipped > 0 ? `, пропущено ${skipped} (уже были)` : ''}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Не удалось создать отпуск', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// DELETE /api/vacations?id=xxx — удалить конкретную дату отпуска
// DELETE /api/vacations?masterId=xxx&date=2026-10-02 — удалить конкретную дату по мастеру
export async function DELETE(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const masterId = searchParams.get('masterId')
    const dateStr = searchParams.get('date')

    if (id) {
      await db.vacation.delete({ where: { id } })
      return NextResponse.json({ ok: true, message: 'Дата отпуска удалена' })
    }

    if (masterId && dateStr) {
      await db.vacation.deleteMany({
        where: { masterId, date: startOfDay(new Date(dateStr)) },
      })
      return NextResponse.json({ ok: true, message: 'Дата отпуска удалена' })
    }

    // Удалить все отпуска мастера
    if (masterId) {
      const result = await db.vacation.deleteMany({ where: { masterId } })
      return NextResponse.json({ ok: true, deleted: result.count, message: `Удалено ${result.count} дат отпуска` })
    }

    return NextResponse.json({ error: 'Нужен id или masterId' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: 'Не удалось удалить', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
