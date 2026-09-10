import 'server-only'
import { db } from '@/lib/db'

// Отправить push-уведомление всем старшим мастерам (с привязанным telegramId)
// Вызывается из lib/ai.ts при создании Notification в БД
export async function pushToSeniors(message: string): Promise<void> {
  try {
    const seniors = await db.master.findMany({
      where: { role: 'SENIOR', active: true, NOT: { telegramId: null } },
      select: { telegramId: true, name: true },
    })

    if (seniors.length === 0) {
      console.log('📭 Push не отправлен: нет старших с привязанным Telegram')
      return
    }

    // Импортируем getBot динамически (избегаем циклической зависимости)
    const { getBot } = await import('@/lib/bot-runner')
    const bot = getBot()
    if (!bot) {
      console.log('📭 Push не отправлен: бот не инициализирован')
      return
    }

    for (const senior of seniors) {
      if (!senior.telegramId) continue
      try {
        await bot.telegram.sendMessage(senior.telegramId, message, { parse_mode: 'HTML' })
        console.log(`📤 Push отправлен старшему ${senior.name} (tg=${senior.telegramId})`)
      } catch (e) {
        console.error(`❌ Push не отправлен ${senior.name}:`, (e as Error).message)
      }
    }
  } catch (e) {
    console.error('pushToSeniors error:', (e as Error).message)
  }
}
