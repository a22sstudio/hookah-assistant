import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay, addDays, parseDateFromText, formatDateRu, formatFullDateRu, weekdayRu } from '@/lib/datetime-utils'

// GET /api/schedule — график
// ?from=2026-09-01&to=2026-09-30 (по умолчанию сегодня + 30 дней)
// ?date=23 или ?date=четверг — конкретная дата
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dateQuery = searchParams.get('date')
  const fromQuery = searchParams.get('from')
  const toQuery = searchParams.get('to')

  let fromDate: Date
  let toDate: Date

  if (dateQuery) {
    const parsed = parseDateFromText(dateQuery)
    if (!parsed) {
      return NextResponse.json({ error: `Не удалось распознать дату: "${dateQuery}"` }, { status: 400 })
    }
    fromDate = startOfDay(parsed)
    toDate = addDays(fromDate, 1)
  } else {
    fromDate = fromQuery ? startOfDay(new Date(fromQuery)) : startOfDay()
    toDate = toQuery ? startOfDay(new Date(toQuery)) : addDays(startOfDay(), 31)
  }

  const entries = await db.scheduleEntry.findMany({
    where: {
      date: {
        gte: fromDate,
        lt: toDate,
      },
    },
    include: { master: true },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({
    from: fromDate,
    to: toDate,
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date,
      dateLabel: formatDateRu(e.date),
      dateFull: formatFullDateRu(e.date),
      weekday: weekdayRu(e.date),
      masterId: e.masterId,
      masterName: e.master.name,
      masterColor: e.master.color,
      masterRole: e.master.role,
      startHour: e.startHour,
      endHour: e.endHour,
      note: e.note,
      isMine: e.masterId === me.id,
    })),
    total: entries.length,
  })
}

// POST — создать/обновить запись (только старший)
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший может редактировать график' }, { status: 403 })
  }

  const body = await req.json()
  const { masterId, dateText, date, startHour, endHour, note } = body

  if (!masterId) return NextResponse.json({ error: 'masterId обязателен' }, { status: 400 })

  // Если дата как текст ("четверг", "23 числа", "сегодня") — парсим
  let dateObj: Date
  if (dateText) {
    const parsed = parseDateFromText(dateText)
    if (!parsed) {
      return NextResponse.json({ error: `Не удалось распознать дату: "${dateText}"` }, { status: 400 })
    }
    dateObj = startOfDay(parsed)
  } else if (date) {
    dateObj = startOfDay(new Date(date))
  } else {
    return NextResponse.json({ error: 'date или dateText обязательны' }, { status: 400 })
  }

  const entry = await db.scheduleEntry.upsert({
    where: { masterId_date: { masterId, date: dateObj } },
    update: {
      startHour: startHour ?? 12,
      endHour: endHour ?? 23,
      note: note ?? null,
    },
    create: {
      masterId,
      date: dateObj,
      startHour: startHour ?? 12,
      endHour: endHour ?? 23,
      note: note ?? null,
    },
    include: { master: true },
  })

  return NextResponse.json({
    entry: {
      id: entry.id,
      date: entry.date,
      dateLabel: formatDateRu(entry.date),
      masterName: entry.master.name,
      startHour: entry.startHour,
      endHour: entry.endHour,
      note: entry.note,
    },
    message: `${entry.master.name} работает ${formatDateRu(entry.date)} с ${entry.startHour}:00 до ${entry.endHour}:00`,
  })
}

// DELETE — удалить запись (только старший)
export async function DELETE(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  await db.scheduleEntry.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
