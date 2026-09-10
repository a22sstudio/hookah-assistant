import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram, safeMaster } from '@/lib/bot-auth'
import { processMasterMessage } from '@/lib/ai'

// POST /api/bot/chat
// body: { telegramId, message?, source?, transcribedText?, invoiceItems? }
// Передаёт masterId напрямую в AI-движок (без cookie-сессии)
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { telegramId, message, source, transcribedText, invoiceItems } = body

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId обязателен' }, { status: 400 })
    }

    const master = await findMasterByTelegram(telegramId)
    if (!master) {
      return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })
    }

    const result = await processMasterMessage(message || '', {
      source: source ?? 'TEXT',
      transcribedText,
      invoiceItems,
      masterId: master.id,
    })

    return NextResponse.json({
      ...result,
      master: safeMaster(master),
    })
  } catch (e) {
    console.error('Bot chat error:', e)
    return NextResponse.json(
      { error: 'Ошибка обработки', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
