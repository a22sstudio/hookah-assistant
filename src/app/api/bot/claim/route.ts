import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret } from '@/lib/bot-auth'
import { db } from '@/lib/db'

// POST /api/bot/claim — привязать Telegram к мастеру по PIN
// body: { telegramId, pin }
// Это единственный публичный (для бота) эндпоинт регистрации — позволяет первому входу
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { telegramId, pin } = await req.json()
    if (!telegramId || !pin) {
      return NextResponse.json({ error: 'telegramId и pin обязательны' }, { status: 400 })
    }

    // Проверяем, не привязан ли уже этот telegramId
    const existingTg = await db.master.findFirst({
      where: { telegramId: String(telegramId) },
    })
    if (existingTg) {
      return NextResponse.json({
        error: `Этот Telegram уже привязан к мастеру "${existingTg.name}". Используйте /start.`,
      })
    }

    // Ищем мастера по PIN
    const master = await db.master.findFirst({
      where: { pin: String(pin).trim(), active: true },
    })
    if (!master) {
      return NextResponse.json({ error: 'Неверный PIN' }, { status: 404 })
    }

    // Если у мастера уже привязан другой telegramId — перезаписываем (мастер сменил аккаунт)
    const updated = await db.master.update({
      where: { id: master.id },
      data: { telegramId: String(telegramId) },
    })

    return NextResponse.json({
      master: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        color: updated.color,
        telegramId: updated.telegramId,
      },
      message: `Telegram привязан к мастеру ${updated.name}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
