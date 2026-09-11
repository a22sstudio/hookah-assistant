import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram } from '@/lib/bot-auth'
import { db } from '@/lib/db'
import {
  startOfDay, addDays, parseDateFromText, formatDateRu, formatFullDateRu, weekdayRu,
} from '@/lib/datetime-utils'

// POST /api/bot/schedule
// body: { telegramId, action: 'list'|'who_works'|'date', dateText?, days? }
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { telegramId, action, dateText, days = 30 } = await req.json()
    if (!telegramId || !action) {
      return NextResponse.json({ error: 'telegramId и action обязательны' }, { status: 400 })
    }

    const master = await findMasterByTelegram(telegramId)
    if (!master) return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })

    if (action === 'list') {
      // График на N дней вперёд (по умолчанию 30)
      const from = startOfDay()
      const to = addDays(from, days)
      const entries = await db.scheduleEntry.findMany({
        where: { date: { gte: from, lt: to } },
        include: { master: true },
        orderBy: { date: 'asc' },
      })

      if (entries.length === 0) {
        return NextResponse.json({
          message: `📅 График на ${days} дней пуст.\nСтарший ещё не составил расписание.\n\nЧтобы добавить: просто напишите боту — «поставь Марата на завтра с 12 до 22».`,
        })
      }

      // Группировка по датам
      const byDate: Record<string, Array<{ masterName: string; startHour: number; endHour: number }>> = {}
      for (const e of entries) {
        const key = formatDateRu(e.date)
        if (!byDate[key]) byDate[key] = []
        byDate[key].push({ masterName: e.master.name, startHour: e.startHour, endHour: e.endHour })
      }

      const lines = [`📅 График на ${days} дней`, '─────────────']
      for (const [date, masters] of Object.entries(byDate)) {
        lines.push(`\n${date}:`)
        for (const m of masters) {
          lines.push(`  ▪️ ${m.masterName} ${m.startHour}:00–${m.endHour}:00`)
        }
      }

      return NextResponse.json({ message: lines.join('\n') })
    }

    if (action === 'date' || action === 'who_works') {
      // Кто работает в конкретную дату
      if (!dateText) {
        return NextResponse.json({
          error: 'Укажите дату. Примеры: "23 числа", "в четверг", "сегодня", "завтра"',
        })
      }

      const parsed = parseDateFromText(dateText)
      if (!parsed) {
        return NextResponse.json({
          error: `Не удалось распознать дату: "${dateText}". Примеры: "23 числа", "в четверг", "сегодня"`,
        })
      }

      const dayStart = startOfDay(parsed)
      const dayEnd = addDays(dayStart, 1)
      const entries = await db.scheduleEntry.findMany({
        where: { date: { gte: dayStart, lt: dayEnd } },
        include: { master: true },
        orderBy: { startHour: 'asc' },
      })

      const dateLabel = formatFullDateRu(parsed)

      if (entries.length === 0) {
        return NextResponse.json({
          message: `📅 ${dateLabel}\n\nНикто не работает по графику.`,
        })
      }

      const lines = [`📅 ${dateLabel}:`, '']
      for (const e of entries) {
        const mine = e.masterId === master.id ? ' (вы)' : ''
        lines.push(`  • ${e.master.name}${mine} — ${e.startHour}:00-${e.endHour}:00`)
        if (e.note) lines.push(`    ${e.note}`)
      }

      return NextResponse.json({ message: lines.join('\n') })
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
