import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram } from '@/lib/bot-auth'
import { db } from '@/lib/db'
import { startOfDay, addDays, parseDateFromText, formatDateRu, formatFullDateRu } from '@/lib/datetime-utils'

// POST /api/bot/summary
// body: { telegramId, dateText? }
// Старший → расширенная сводка, обычный мастер → его личная
//
// ВАЖНО: система смен удалена (redesign-7). Сводка строится по графику (ScheduleEntry).
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

    const scheduledEntries = await db.scheduleEntry.findMany({
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
      const myEntry = scheduledEntries.find((e) => e.masterId === master.id)
      const myRequests = requests.filter((r) => r.masterId === master.id)
      const myWishes = wishes.filter((w) => w.masterId === master.id)

      if (!myEntry) {
        return NextResponse.json({
          message: `📊 ${formatDateRu(targetDate)}\n\nУ вас не было смены в этот день.`,
        })
      }

      const lines = [
        `📊 Сводка за ${formatDateRu(targetDate)}`,
        ``,
        `📅 Смена по графику`,
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
      `👥 Запланировано мастеров: ${scheduledEntries.length}`,
      `📋 Заявок: ${requests.length}`,
      `💡 Хотелок: ${wishes.length}`,
      `📝 Отметок остатков: ${operations.length}`,
    ]

    if (scheduledEntries.length > 0) {
      lines.push('', '👷 По мастерам:')
      for (const e of scheduledEntries) {
        const mReq = requests.filter((r) => r.masterId === e.masterId).length
        const mWish = wishes.filter((w) => w.masterId === e.masterId).length
        const star = e.master.role === 'SENIOR' ? '⭐️' : '🌿'
        lines.push(`  • ${star} ${e.master.name} | ${mReq}📋 ${mWish}💡`)
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
