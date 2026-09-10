import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram } from '@/lib/bot-auth'
import { db } from '@/lib/db'

// GET /api/bot/masters?seniorTelegramId=XXX — список мастеров (только старший)
export async function GET(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const seniorTelegramId = searchParams.get('seniorTelegramId')
  if (!seniorTelegramId) {
    return NextResponse.json({ error: 'seniorTelegramId обязателен' }, { status: 400 })
  }

  const senior = await findMasterByTelegram(seniorTelegramId)
  if (!senior || senior.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший может смотреть список' }, { status: 403 })
  }

  const masters = await db.master.findMany({
    where: { active: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({
    masters: masters.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      color: m.color,
      telegramId: m.telegramId,
      pin: m.pin,
    })),
  })
}

// PATCH /api/bot/masters — привязать/отвязать telegramId к мастеру (только старший)
// body: { seniorTelegramId, masterId, telegramId? }
export async function PATCH(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { seniorTelegramId, masterId, telegramId } = await req.json()

    const senior = await findMasterByTelegram(seniorTelegramId)
    if (!senior || senior.role !== 'SENIOR') {
      return NextResponse.json({ error: 'Только старший' }, { status: 403 })
    }

    // Проверка уникальности telegramId
    if (telegramId) {
      const existing = await db.master.findFirst({
        where: { telegramId: String(telegramId), NOT: { id: masterId } },
      })
      if (existing) {
        return NextResponse.json({ error: `Telegram ID уже привязан к ${existing.name}` }, { status: 400 })
      }
    }

    const master = await db.master.update({
      where: { id: masterId },
      data: { telegramId: telegramId ? String(telegramId) : null },
    })

    return NextResponse.json({
      master: {
        id: master.id,
        name: master.name,
        telegramId: master.telegramId,
      },
      message: telegramId
        ? `Telegram ID ${telegramId} привязан к ${master.name}`
        : `Telegram ID отвязан от ${master.name}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
