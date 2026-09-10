import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram, safeMaster } from '@/lib/bot-auth'

// GET /api/bot/identify?telegramId=XXX
// Возвращает мастера по telegramId (или null если не зарегистрирован)
export async function GET(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const telegramId = searchParams.get('telegramId')
  if (!telegramId) {
    return NextResponse.json({ error: 'telegramId обязателен' }, { status: 400 })
  }

  const master = await findMasterByTelegram(telegramId)
  return NextResponse.json({ master: master ? safeMaster(master) : null })
}
