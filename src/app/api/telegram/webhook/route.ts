import { NextRequest, NextResponse } from 'next/server'
import { getBot, isBotRunning, ensureBotRunning } from '@/lib/bot-runner'

// POST /api/telegram/webhook
// Telegram присылает сюда Update объект когда пользователь пишет боту.
//
// ВАЖНО: Telegram ждёт ответ 200 OK в течение ~60 сек, иначе ретраит.
// AI-обработка может занимать дольше → поэтому отвечаем 200 сразу,
// а обработку запускаем в фоне (nextTick / setImmediate).
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch (e) {
    console.error('Webhook JSON parse error:', (e as Error).message)
    return NextResponse.json({ ok: true }) // 200 чтобы Telegram не ретраил
  }

  // Отвечаем 200 OK сразу — Telegram удовлетворён
  // Обработку запускаем в фоне, не блокируя ответ
  void (async () => {
    try {
      await ensureBotRunning()
      const bot = getBot()
      if (!bot) {
        console.error('Bot instance not available')
        return
      }
      await bot.handleUpdate(body)
    } catch (e) {
      console.error('Webhook background processing error:', (e as Error).message)
    }
  })()

  return NextResponse.json({ ok: true })
}

// GET — проверка что webhook endpoint работает
export async function GET() {
  return NextResponse.json({
    ok: true,
    webhook: true,
    botRunning: isBotRunning(),
    message: 'Telegram webhook endpoint активен (async обработка)',
  })
}
