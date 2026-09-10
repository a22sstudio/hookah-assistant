import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram } from '@/lib/bot-auth'
import { db } from '@/lib/db'

// POST /api/bot/register — регистрация нового мастера (только старший)
// body: { seniorTelegramId, name, role: 'SENIOR'|'REGULAR', telegramId?, pin?, color? }
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { seniorTelegramId, name, role, telegramId, pin, color } = await req.json()

    if (!seniorTelegramId || !name || !role) {
      return NextResponse.json({ error: 'seniorTelegramId, name, role обязательны' }, { status: 400 })
    }

    // Проверка, что регистрирующий — старший
    const senior = await findMasterByTelegram(seniorTelegramId)
    if (!senior || senior.role !== 'SENIOR') {
      return NextResponse.json({ error: 'Только старший может регистрировать' }, { status: 403 })
    }

    // Проверка уникальности
    const existingName = await db.master.findFirst({ where: { name } })
    if (existingName) {
      return NextResponse.json({ error: `Мастер с именем "${name}" уже есть` }, { status: 400 })
    }
    if (telegramId) {
      const existingTg = await db.master.findFirst({ where: { telegramId: String(telegramId) } })
      if (existingTg) {
        return NextResponse.json({ error: `Telegram ID ${telegramId} уже привязан к ${existingTg.name}` }, { status: 400 })
      }
    }

    const master = await db.master.create({
      data: {
        name,
        role,
        telegramId: telegramId ? String(telegramId) : null,
        pin: pin || String(Math.floor(1000 + Math.random() * 9000)),
        color: color || 'sky',
      },
    })

    return NextResponse.json({
      master: {
        id: master.id,
        name: master.name,
        role: master.role,
        telegramId: master.telegramId,
        pin: master.pin,
      },
      message: `Мастер ${name} зарегистрирован. PIN для веб: ${master.pin}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка регистрации', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
