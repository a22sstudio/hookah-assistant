import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const BOT_SECRET = process.env.BOT_SECRET || ''

// Проверка X-Bot-Secret — возвращает 401 если невалидный
export function checkBotSecret(req: NextRequest): NextResponse | null {
  const secret = req.headers.get('x-bot-secret')
  if (!BOT_SECRET || secret !== BOT_SECRET) {
    return NextResponse.json({ error: 'Неверный секрет бота' }, { status: 401 })
  }
  return null
}

// Найти активного мастера по telegramId
export async function findMasterByTelegram(telegramId: string) {
  if (!telegramId) return null
  const master = await db.master.findFirst({
    where: { telegramId: String(telegramId), active: true },
  })
  return master
}

// Безопасный ответ для бота: только безопасные поля мастера
export function safeMaster(master: NonNullable<Awaited<ReturnType<typeof findMasterByTelegram>>>) {
  return {
    id: master.id,
    name: master.name,
    role: master.role,
    color: master.color,
    telegramId: master.telegramId,
  }
}
