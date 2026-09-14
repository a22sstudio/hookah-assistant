import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram } from '@/lib/bot-auth'
import { db } from '@/lib/db'
import { startOfDay, addDays, parseDateFromText, formatDateRu, formatFullDateRu } from '@/lib/datetime-utils'

// POST /api/bot/summary
// body: { telegramId, dateText? }
// Старший → расширенная сводка, обычный мастер → его личная.
// Сводка теперь опирается на ScheduleEntry (нет Shifts).
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { telegramId, dateText } = await req.json()
    if (!telegramId) return NextResponse.json({ error: 'telegramId обязателен' }, { status: 400 })

    const master = await findMasterByTelegram(telegramId)
    if (!master) return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })

    let targetDate: Date
    if (dateText) {
      const parsed = parseDateFromText(dateText)
      if (!parsed) {
        return NextResponse.json({
          error: `Не удалось распознать дату: "${dateText}"`,
        })
      }
      targetDate = startOfDay(parsed)
    } else {
      targetDate = startOfDay()
    }
    const nextDay = addDays(targetDate, 1)

    // Кто работал по графику в этот день
    const scheduleEntries = await db.scheduleEntry.findMany({
      where: { date: { gte: targetDate, lt: nextDay } },
      include: { master: true },
      orderBy: { createdAt: 'asc' },
    })

    const operations = await db.operation.findMany({
      where: { createdAt: { gte: targetDate, lt: nextDay }, type: 'ADJUSTMENT' },
      include: { tobacco: true },
      orderBy: { createdAt: 'asc' },
    })

    const requests = await db.masterRequest.findMany({
      where: { createdAt: { gte: targetDate, lt: nextDay } },
      include: { master: true },
    })

    const wishes = await db.wish.findMany({
      where: { createdAt: { gte: targetDate, lt: nextDay } },
      include: { master: true },
    })

    const isSenior = master.role === 'SENIOR'

    // Короткая сводка для обычного мастера
    if (!isSenior) {
      const myEntry = scheduleEntries.find((e) => e.masterId === master.id)
      const myRequests = requests.filter((r) => r.masterId === master.id)
      const myWishes = wishes.filter((w) => w.masterId === master.id)

      if (!myEntry) {
        const others = scheduleEntries.map((e) => e.master.name).join(', ')
        return NextResponse.json({
          message: `📊 ${formatDateRu(targetDate)}\n\nУ тебя выходной.${others ? ` За стойкой: ${others}.` : ''}`,
        })
      }

      const lines = [
        `📊 Сводка за ${formatDateRu(targetDate)}`,
        ``,
        `✅ Ты в графике на сегодня`,
        `📝 Отметок остатков: ${operations.length}`,
        `📋 Заявок: ${myRequests.length}`,
        `💡 Хотелок: ${myWishes.length}`,
      ]

      if (myRequests.length > 0) {
        lines.push('', '📋 Ваши заявки:')
        myRequests.forEach((r) => lines.push(`  • ${r.text} [${r.status}]`))
      }
      if (myWishes.length > 0) {
        lines.push('', '💡 Ваши хотелки:')
        myWishes.forEach((w) => lines.push(`  • ${w.text} [${w.status}]`))
      }

      return NextResponse.json({ message: lines.join('\n') })
    }

    // Расширенная сводка для старшего
    const lines = [
      `📊 Сводка за ${formatFullDateRu(targetDate)}`,
      '',
      `👥 В графике: ${scheduleEntries.length}`,
      `📋 Заявок: ${requests.length}`,
      `💡 Хотелок: ${wishes.length}`,
      `📝 Отметок остатков: ${operations.length}`,
    ]

    if (scheduleEntries.length > 0) {
      lines.push('', '👷 В графике:')
      for (const e of scheduleEntries) {
        const mReq = requests.filter((r) => r.masterId === e.masterId).length
        const mWish = wishes.filter((w) => w.masterId === e.masterId).length
        lines.push(`  • ${e.master.name}: ${mReq}📋 ${mWish}💡${e.note ? ` (${e.note})` : ''}`)
      }
    }

    if (requests.length > 0) {
      lines.push('', '📋 Заявки:')
      for (const r of requests) {
        lines.push(`  • ${r.master.name}: "${r.text}" [${r.status}]`)
      }
    }

    if (wishes.length > 0) {
      lines.push('', '💡 Хотелки:')
      for (const w of wishes) {
        lines.push(`  • ${w.master.name}: "${w.text}" [${w.status}]`)
      }
    }

    // Табаки которые менялись
    if (operations.length > 0) {
      const tobaccoDeltas: Record<string, number> = {}
      for (const op of operations) {
        const key = `${op.tobacco?.brand} ${op.tobacco?.line} ${op.tobacco?.flavor}`
        tobaccoDeltas[key] = (tobaccoDeltas[key] || 0) + op.delta
      }
      lines.push('', '📦 Изменения остатков:')
      for (const [tobacco, delta] of Object.entries(tobaccoDeltas)) {
        const sign = delta > 0 ? '+' : ''
        lines.push(`  • ${tobacco}: ${sign}${delta}г`)
      }
    }

    return NextResponse.json({ message: lines.join('\n') })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
