import { NextRequest, NextResponse } from 'next/server'
import { getBot, isBotRunning, ensureBotRunning } from '@/lib/bot-runner'

// POST /api/telegram/webhook
// Telegram присылает сюда Update объект когда пользователь пишет боту.
// Это надёжнее polling — Telegram сам присылает сообщения, не нужен постоянный процесс.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Убеждаемся что бот инициализирован (создаёт инстанс если ещё нет)
    await ensureBotRunning()

    const bot = getBot()
    if (!bot) {
      console.error('Bot instance not available')
      return NextResponse.json({ error: 'bot not available' }, { status: 500 })
    }

    // Обрабатываем обновление от Telegram.
    // handleUpdate вызывает все middleware и хендлеры Telegraf.
    await bot.handleUpdate(body)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Webhook error:', (e as Error).message)
    // Возвращаем 200 чтобы Telegram не повторял запрос (иначе будет флуд retry)
    return NextResponse.json({ ok: true, error: (e as Error).message })
  }
}

// GET — проверка что webhook endpoint работает
export async function GET() {
  return NextResponse.json({
    ok: true,
    webhook: true,
    botRunning: isBotRunning(),
    message: 'Telegram webhook endpoint активен',
  })
}
