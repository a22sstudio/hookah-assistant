import 'server-only'
import { Telegraf, Markup } from 'telegraf'
import { db } from '@/lib/db'
import { processMasterMessage, recognizeInvoice, transcribeAudio } from '@/lib/ai'
import type { SessionMaster } from '@/lib/auth'

// ───────────────────────────────────────────
// Singleton: запускаем бота один раз внутри процесса Next.js
// globalThis защищает от HMR-переинициализации в dev-режиме
// ───────────────────────────────────────────
const globalForBot = globalThis as unknown as {
  __botStarted?: boolean
  __botInstance?: Telegraf | null
}

function humanDuration(openedAt: Date): string {
  const ms = Date.now() - openedAt.getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}ч ${m}м`
}

function roleEmoji(role: string): string {
  return role === 'SENIOR' ? '⭐️' : '🌿'
}
function toSessionMaster(m: {
  id: string
  name: string
  role: string
  color: string
}): SessionMaster {
  return { id: m.id, name: m.name, role: m.role as 'SENIOR' | 'REGULAR', color: m.color }
}

// ───────────────────────────────────────────
// Создаём и настраиваем бота
// ───────────────────────────────────────────
function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не задан — бот не запущен')
    throw new Error('No TELEGRAM_BOT_TOKEN')
  }

  const bot = new Telegraf(token)

  // Middleware: идентифицируем мастера по telegramId
  bot.use(async (ctx, next) => {
    const tgId = String((ctx.from as { id?: number } | undefined)?.id || '')
    if (tgId) {
      const master = await db.master.findFirst({
        where: { telegramId: tgId, active: true },
      })
      ;(ctx as { state: Record<string, unknown> }).state.master = master
        ? toSessionMaster(master)
        : null
    }
    return next()
  })

  // /claim <PIN> — привязать Telegram к мастеру по PIN
  bot.command('claim', async (ctx) => {
    const tgId = String((ctx.from as { id?: number })?.id || '')
    if (!tgId) return

    const pin = (ctx.message as { text: string }).text.split(/\s+/)[1]
    if (!pin) {
      return ctx.reply(
        'Формат: /claim PIN\n\nНапример: /claim 1111\n\nPIN выдаёт старший мастер.',
      )
    }

    const existing = await db.master.findFirst({ where: { telegramId: tgId } })
    if (existing) {
      return ctx.reply(
        `Этот Telegram уже привязан к мастеру «${existing.name}». Используйте /start.`,
      )
    }

    const master = await db.master.findFirst({
      where: { pin: pin.trim(), active: true },
    })
    if (!master) {
      return ctx.reply('⚠️ Неверный PIN. Обратитесь к старшему мастеру.')
    }

    const updated = await db.master.update({
      where: { id: master.id },
      data: { telegramId: tgId },
    })

    return ctx.reply(
      `✅ Готово!\n\n${roleEmoji(updated.role)} ${updated.name}\nРоль: ${updated.role === 'SENIOR' ? 'Старший мастер' : 'Мастер'}\n\nТеперь можете пользоваться ботом. /help — список команд.`,
    )
  })

  // /start
  bot.command('start', async (ctx) => {
    const tgId = String((ctx.from as { id?: number })?.id || '')
    const master = (ctx.state as { master: SessionMaster | null }).master

    if (!master) {
      return ctx.reply(
        `🔒 Доступ запрещён\n\nВы не зарегистрированы в системе кальянной.\n\nВаш Telegram ID: <code>${tgId}</code>\n\nЕсли у вас есть PIN-код мастера — отправьте:\n<code>/claim ВАШ_PIN</code>\n\nНапример: <code>/claim 1111</code>`,
        { parse_mode: 'HTML' },
      )
    }

    const isSenior = master.role === 'SENIOR'
    return ctx.reply(
      `${roleEmoji(master.role)} Привет, ${master.name}!\n\n` +
        `Роль: ${isSenior ? 'Старший мастер' : 'Мастер'}\n\n` +
        `Я умею:\n` +
        `• 📝 Слушать команды про табак ("пол банки дарксайд супнова")\n` +
        `• 🎤 Принимать голосовые сообщения\n` +
        `• 📸 Распознавать накладные по фото\n` +
        `• 💬 Создавать заявки на закуп и хотелки\n` +
        `• 📊 Считать кальяны и вести смену\n\n` +
        `Команды:\n` +
        `/shift — открыть/закрыть смену\n` +
        `/+1 — добавить кальян\n` +
        `/status — кто на смене\n` +
        (isSenior ? '/register — добавить мастера\n/masters — список мастеров\n' : '') +
        `/whoami — кто я\n/help — помощь`,
    )
  })

  // /help
  bot.command('help', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

    const isSenior = master.role === 'SENIOR'
    return ctx.reply(
      `📋 Команды\n\n` +
        `• /shift — открыть или закрыть смену\n` +
        `• /+1 или "+1" — добавить 1 кальян\n` +
        `• "забил 5" / "сделал 3" / "накрутил 10" — пакетно\n` +
        `• /status — кто сейчас на смене\n` +
        `• /schedule — график на 30 дней\n` +
        `• /schedule 23 или /schedule четверг — кто работает\n` +
        `• /summary — сводка за сегодня\n` +
        `• /summary вчера — сводка за другой день\n` +
        `• /whoami — кто я\n` +
        `• /help — эта справка\n\n` +
        `💬 Можно просто писать текстом:\n` +
        `  "пол банки дарксайд супнова кола"\n` +
        `  "закажи blackburn energy 2 банки"\n` +
        `  "хочу новые шланги"\n` +
        `  "чего мало?"\n\n` +
        `🎤 Голосовое — распознаю и обработаю.\n` +
        `📸 Фото накладной — распознаю и оформлю приход.\n` +
        (isSenior
          ? `\n⭐️ Старший:\n• /register Имя РОЛЬ [telegramId] — добавить мастера\n• /masters — список`
          : ''),
    )
  })

  // /whoami
  bot.command('whoami', async (ctx) => {
    const tgId = String((ctx.from as { id?: number })?.id || '')
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) {
      return ctx.reply(
        `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${tgId}</code>\nОбратитесь к старшему мастеру.`,
        { parse_mode: 'HTML' },
      )
    }
    return ctx.reply(
      `${roleEmoji(master.role)} ${master.name}\nРоль: ${master.role === 'SENIOR' ? 'Старший мастер' : 'Мастер'}\nTelegram ID: <code>${tgId}</code>`,
      { parse_mode: 'HTML' },
    )
  })

  // /status — кто на смене
  bot.command('status', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

    const openShifts = await db.shift.findMany({
      where: { status: 'OPEN' },
      include: { master: true },
      orderBy: { openedAt: 'asc' },
    })
    const myShift = openShifts.find((s) => s.masterId === master.id) || null

    const lines: string[] = []
    if (openShifts.length > 0) {
      lines.push('👥 На смене сейчас:')
      for (const s of openShifts) {
        const mine = s.masterId === master.id ? ' (вы)' : ''
        lines.push(
          `  ${roleEmoji(s.master.role)} ${s.master.name}${mine} — ${s.hookahCount} кальянов · ${humanDuration(s.openedAt)}`,
        )
      }
    } else {
      lines.push('🚪 Никого на смене.')
    }
    if (myShift) {
      lines.push(`\n📊 Ваша смена: ${myShift.hookahCount} кальянов · ${humanDuration(myShift.openedAt)}`)
    } else {
      lines.push('\n✅ Можете открыть смену: /shift')
    }
    return ctx.reply(lines.join('\n'))
  })

  // /schedule — график (без аргумента = на 30 дней, /schedule 23 или /schedule четверг)
  bot.command('schedule', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

    const args = (ctx.message as { text: string }).text.split(/\s+/).slice(1)
    const arg = args.join(' ').trim()
    await ctx.sendChatAction('typing')

    const BOT_SECRET = process.env.BOT_SECRET || ''
    const tgId = String((ctx.from as { id?: number })?.id || '')

    if (arg) {
      // Кто работает в конкретную дату
      const res = await fetch(`http://localhost:${process.env.PORT || 3000}/api/bot/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': BOT_SECRET },
        body: JSON.stringify({ telegramId: tgId, action: 'date', dateText: arg }),
      })
      const data = await res.json()
      return ctx.reply(data.message || data.error || 'Не удалось получить график')
    }

    // График на 30 дней
    const res = await fetch(`http://localhost:${process.env.PORT || 3000}/api/bot/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': BOT_SECRET },
      body: JSON.stringify({ telegramId: tgId, action: 'list', days: 30 }),
    })
    const data = await res.json()
    return ctx.reply(data.message || data.error || 'Не удалось получить график')
  })

  // /summary — сводка дня (без аргумента = сегодня)
  bot.command('summary', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

    const args = (ctx.message as { text: string }).text.split(/\s+/).slice(1)
    const arg = args.join(' ').trim()
    await ctx.sendChatAction('typing')

    const BOT_SECRET = process.env.BOT_SECRET || ''
    const tgId = String((ctx.from as { id?: number })?.id || '')

    const res = await fetch(`http://localhost:${process.env.PORT || 3000}/api/bot/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': BOT_SECRET },
      body: JSON.stringify({ telegramId: tgId, dateText: arg || undefined }),
    })
    const data = await res.json()
    return ctx.reply(data.message || data.error || 'Не удалось получить сводку')
  })

  // /shift — открыть/закрыть
  bot.command('shift', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

    const myShift = await db.shift.findFirst({
      where: { masterId: master.id, status: 'OPEN' },
    })

    if (myShift) {
      return ctx.reply(
        `Ваша смена открыта.\nКальянов: ${myShift.hookahCount}\nДлительность: ${humanDuration(myShift.openedAt)}\n\nЗакрыть смену?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Закрыть смену', 'shift_close')],
        ]),
      )
    }
    return ctx.reply(
      'Открыть смену?',
      Markup.inlineKeyboard([
        [Markup.button.callback('🌿 Открыть смену', 'shift_open')],
      ]),
    )
  })

  bot.action('shift_open', async (ctx) => {
    await ctx.answerCbQuery()
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.editMessageText('⚠️ Сессия истекла')

    const existing = await db.shift.findFirst({
      where: { masterId: master.id, status: 'OPEN' },
    })
    if (existing) {
      return ctx.editMessageText('⚠️ У вас уже открыта смена.')
    }
    await db.shift.create({ data: { masterId: master.id, status: 'OPEN' } })
    if (master.role !== 'SENIOR') {
      const notifMsg = `🌿 ${master.name} открыл смену`
      await db.notification.create({
        data: { type: 'SHIFT_OPEN', message: notifMsg, masterId: master.id },
      })
      // Push старшему в Telegram
      const { pushToSeniors } = await import('@/lib/notify')
      await pushToSeniors(notifMsg)
    }
    return ctx.editMessageText('✅ Смена открыта! Считай кальяны командой /+1 или просто "+1".')
  })

  bot.action('shift_close', async (ctx) => {
    await ctx.answerCbQuery()
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.editMessageText('⚠️ Сессия истекла')

    const shift = await db.shift.findFirst({
      where: { masterId: master.id, status: 'OPEN' },
    })
    if (!shift) {
      return ctx.editMessageText('⚠️ Нет открытой смены.')
    }
    await db.shift.update({
      where: { id: shift.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    })
    if (master.role !== 'SENIOR') {
      await db.notification.create({
        data: {
          type: 'SHIFT_CLOSE',
          message: `${master.name} закрыл смену (${shift.hookahCount} кальянов)`,
          masterId: master.id,
        },
      })
    }
    return ctx.editMessageText(`✅ Смена закрыта. Кальянов за смену: ${shift.hookahCount}`)
  })

  // /+1 кальян
  bot.command(['+1', 'hookah', 'kalyan'], async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')
    const result = await addHookah(master.id)
    return ctx.reply(result.message)
  })

  // Реагируем на текст "+1"
  bot.hears(/^\+\s?1(\s+кальян)?$/i, async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')
    const result = await addHookah(master.id)
    return ctx.reply(result.message)
  })

  // /register (только старший)
  bot.command('register', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')
    if (master.role !== 'SENIOR') return ctx.reply('⛔ Только старший может регистрировать мастеров.')

    const args = (ctx.message as { text: string }).text.split(/\s+/).slice(1)
    if (args.length < 2) {
      return ctx.reply(
        'Формат: /register Имя РОЛЬ [telegramId]\n\nПримеры:\n' +
          '/register Айрат REGULAR 123456789\n' +
          '/register Тимур SENIOR\n' +
          `\nВаш Telegram ID: <code>${(ctx.from as { id: number }).id}</code>`,
        { parse_mode: 'HTML' },
      )
    }

    const name = args[0]
    const role = args[1].toUpperCase() === 'SENIOR' ? 'SENIOR' : 'REGULAR'
    const telegramId = args[2] || undefined

    const existingName = await db.master.findFirst({ where: { name } })
    if (existingName) {
      return ctx.reply(`⚠️ Мастер с именем "${name}" уже есть.`)
    }
    if (telegramId) {
      const existingTg = await db.master.findFirst({ where: { telegramId: String(telegramId) } })
      if (existingTg) {
        return ctx.reply(`⚠️ Telegram ID ${telegramId} уже привязан к ${existingTg.name}`)
      }
    }

    const pin = String(Math.floor(1000 + Math.random() * 9000))
    const newMaster = await db.master.create({
      data: { name, role, telegramId: telegramId ? String(telegramId) : null, pin, color: 'sky' },
    })

    return ctx.reply(
      `✅ Зарегистрирован!\n\nИмя: ${newMaster.name}\nРоль: ${newMaster.role === 'SENIOR' ? 'Старший' : 'Мастер'}\nTelegram: ${newMaster.telegramId || '(не привязан)'}\nPIN для веб-входа: ${newMaster.pin}`,
    )
  })

  // /masters (только старший)
  bot.command('masters', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')
    if (master.role !== 'SENIOR') return ctx.reply('⛔ Только старший.')

    const masters = await db.master.findMany({
      where: { active: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
    const lines = masters.map(
      (m) =>
        `${roleEmoji(m.role)} ${m.name} — ${m.role === 'SENIOR' ? 'старший' : 'мастер'} | tg: ${m.telegramId || '—'} | pin: ${m.pin}`,
    )
    return ctx.reply(`👥 Мастера (${masters.length}):\n\n${lines.join('\n')}`)
  })

  // Хелпер: запустить AI с таймаутом 50 сек (чтобы успеть ответить до Telegram retry)
  function withTimeout<T>(promise: Promise<T>, ms = 50000, label = 'AI'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
      promise.then(
        (v) => { clearTimeout(timer); resolve(v) },
        (e) => { clearTimeout(timer); reject(e) },
      )
    })
  }

  // Цикл "typing..." пока идёт долгая AI-обработка (каждые 4 сек, пока Telegram не сбросит)
  async function keepTyping(ctx: { sendChatAction: (a: string) => Promise<unknown> }, stopFlag: { value: boolean }) {
    while (!stopFlag.value) {
      try { await ctx.sendChatAction('typing') } catch {}
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  // Текстовые сообщения → AI
  bot.on('text', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    const tgId = String((ctx.from as { id?: number })?.id || '')
    if (!master) {
      return ctx.reply(
        `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${tgId}</code>\nОбратитесь к старшему мастеру или используйте /claim PIN.`,
        { parse_mode: 'HTML' },
      )
    }

    const text = (ctx.message as { text: string }).text
    if (text.startsWith('/')) return // команды уже обработаны

    // Быстрый парсинг: "забил 5 кальянов", "сделал 3", "накрутил 10"
    const { parseHookahCount } = await import('@/lib/datetime-utils')
    const hookahCount = parseHookahCount(text)

    // Если похоже на отчёт о кальянах и нет других ключевых слов AI
    const lowerText = text.toLowerCase()
    const hasOtherIntent = /сколько|чего|какой|какая|закажи|хочу|заканчивается|осталось|приход|накладн/.test(lowerText)

    if (hookahCount !== null && hookahCount > 1 && !hasOtherIntent) {
      // Пакетное добавление кальянов (минуя AI — быстро)
      const shift = await db.shift.findFirst({ where: { masterId: master.id, status: 'OPEN' } })
      if (!shift) {
        return ctx.reply('⚠️ Смена не открыта. /shift чтобы открыть.')
      }
      const newCount = shift.hookahCount + hookahCount
      await db.shift.update({ where: { id: shift.id }, data: { hookahCount: newCount } })
      return ctx.reply(`🪔 +${hookahCount} кальянов\nВсего за смену: ${newCount}`)
    }

    await ctx.sendChatAction('typing')
    const stop = { value: false }
    const typingLoop = keepTyping(ctx, stop).catch(() => {})

    try {
      const result = await withTimeout(
        processMasterMessage(text, { source: 'TEXT', masterId: master.id }),
        50000,
        'processMasterMessage',
      )
      stop.value = true
      await typingLoop
      return ctx.reply(formatReply(result))
    } catch (e) {
      stop.value = true
      await typingLoop
      console.error('Text/AI error:', (e as Error).message)
      return ctx.reply('⚠️ Не удалось обработать (AI не ответил вовремя). Попробуй ещё раз.')
    }
  })

  // Голосовые → ASR → AI
  bot.on('voice', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    const tgId = String((ctx.from as { id?: number })?.id || '')
    if (!master) {
      return ctx.reply(
        `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${tgId}</code>\nОбратитесь к старшему мастеру.`,
        { parse_mode: 'HTML' },
      )
    }

    await ctx.sendChatAction('typing')
    const stop = { value: false }
    const typingLoop = keepTyping(ctx, stop).catch(() => {})

    try {
      const fileId = (ctx.message as { voice: { file_id: string } }).voice.file_id
      const fileLink = await bot.telegram.getFileLink(fileId)
      const res = await fetch(fileLink.toString())
      const buf = Buffer.from(await res.arrayBuffer())
      const audioBase64 = buf.toString('base64')

      let transcribedText = ''
      try {
        transcribedText = await withTimeout(transcribeAudio(audioBase64), 30000, 'ASR')
      } catch (asrErr) {
        stop.value = true; await typingLoop
        const msg = (asrErr as Error).message
        return ctx.reply('🎤 Не удалось распознать речь: ' + msg + '\n\nНапиши текстом, пожалуйста.')
      }
      if (!transcribedText) {
        stop.value = true; await typingLoop
        return ctx.reply('⚠️ Не удалось распознать речь (пустой ответ).')
      }

      // Быстрый парсинг кальянов из распознанного голоса
      const { parseHookahCount } = await import('@/lib/datetime-utils')
      const hookahCount = parseHookahCount(transcribedText)
      const hasOtherIntent = /сколько|чего|какой|какая|закажи|хочу|заканчивается|осталось|приход|накладн/.test(transcribedText.toLowerCase())

      if (hookahCount !== null && hookahCount > 1 && !hasOtherIntent) {
        const shift = await db.shift.findFirst({ where: { masterId: master.id, status: 'OPEN' } })
        if (shift) {
          const newCount = shift.hookahCount + hookahCount
          await db.shift.update({ where: { id: shift.id }, data: { hookahCount: newCount } })
          stop.value = true; await typingLoop
          return ctx.reply(`🎙 Распознал: «${transcribedText}»\n\n🪔 +${hookahCount} кальянов\nВсего за смену: ${newCount}`)
        }
      }

      const result = await withTimeout(
        processMasterMessage(transcribedText, { source: 'VOICE', transcribedText, masterId: master.id }),
        50000,
        'processMasterMessage',
      )
      stop.value = true; await typingLoop
      return ctx.reply(`🎙 Распознал: «${transcribedText}»\n\n${formatReply(result)}`)
    } catch (e) {
      stop.value = true; await typingLoop
      console.error('Voice error:', (e as Error).message)
      return ctx.reply('⚠️ Не удалось обработать голосовое (таймаут или ошибка AI).')
    }
  })

  // Фото → VLM → AI
  bot.on('photo', async (ctx) => {
    const master = (ctx.state as { master: SessionMaster | null }).master
    const tgId = String((ctx.from as { id?: number })?.id || '')
    if (!master) {
      return ctx.reply(
        `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${tgId}</code>\nОбратитесь к старшему мастеру.`,
        { parse_mode: 'HTML' },
      )
    }

    await ctx.sendChatAction('typing')
    const stop = { value: false }
    const typingLoop = keepTyping(ctx, stop).catch(() => {})

    try {
      const photos = (ctx.message as { photo: { file_id: string }[] }).photo
      const biggest = photos[photos.length - 1]
      const fileLink = await bot.telegram.getFileLink(biggest.file_id)
      const res = await fetch(fileLink.toString())
      const buf = Buffer.from(await res.arrayBuffer())
      const imageBase64 = 'data:image/jpeg;base64,' + buf.toString('base64')

      const items = await withTimeout(recognizeInvoice(imageBase64), 30000, 'VLM')
      if (items.length === 0) {
        stop.value = true; await typingLoop
        return ctx.reply('⚠️ Не удалось распознать позиции на фото.')
      }

      const result = await withTimeout(
        processMasterMessage('оформи приход по накладной', { source: 'PHOTO', invoiceItems: items, masterId: master.id }),
        50000,
        'processMasterMessage',
      )

      let reply = `📸 Распознал ${items.length} поз.:\n`
      for (const i of items) reply += `• ${i.brand} ${i.line} ${i.flavor} — ${i.grams}г\n`
      reply += `\n${formatReply(result)}`
      stop.value = true; await typingLoop
      return ctx.reply(reply)
    } catch (e) {
      stop.value = true; await typingLoop
      console.error('Photo error:', (e as Error).message)
      return ctx.reply('⚠️ Не удалось обработать фото (таймаут или ошибка AI).')
    }
  })

  return bot
}

// Вспомогательные функции
async function addHookah(masterId: string): Promise<{ success: boolean; message: string }> {
  const shift = await db.shift.findFirst({ where: { masterId, status: 'OPEN' } })
  if (!shift) {
    return { success: false, message: '⚠️ Смена не открыта. /shift чтобы открыть.' }
  }
  const newCount = shift.hookahCount + 1
  await db.shift.update({ where: { id: shift.id }, data: { hookahCount: newCount } })
  return { success: true, message: `🪔 +1 кальян\nВсего за смену: ${newCount}` }
}

function formatReply(result: {
  reply: string
  executedActions?: Array<{ tool: string; success: boolean; message: string }>
}): string {
  let reply = result.reply || 'Готово.'
  if (result.executedActions && result.executedActions.length > 0) {
    reply += '\n\n'
    for (const a of result.executedActions) {
      reply += `${a.success ? '✅' : '❌'} ${a.message}\n`
    }
  }
  return reply.trim()
}

// ───────────────────────────────────────────
// Запуск бота (один раз на процесс Next.js)
// ───────────────────────────────────────────
// USE_POLLING=1 — запускать long-polling внутри процесса (для локальной разработки)
// Иначе — webhook режим: Telegram сам присылает Update на /api/telegram/webhook,
// обработка через handleUpdate(). Не нужен постоянный процесс.
const USE_POLLING = process.env.USE_POLLING === '1'

export async function ensureBotRunning(): Promise<void> {
  if (globalForBot.__botStarted) return
  globalForBot.__botStarted = true

  try {
    const bot = createBot()
    globalForBot.__botInstance = bot

    // НЕ блокируем рендер страницы — getMe и launch в фоне
    void (async () => {
      try {
        const me = await bot.telegram.getMe()
        console.log(`🤖 Telegram бот инициализирован: @${me.username}`)

        if (USE_POLLING) {
          bot.launch()
          console.log('✅ Polling активен (USE_POLLING=1).')
          process.once('SIGINT', () => bot.stop('SIGINT'))
          process.once('SIGTERM', () => bot.stop('SIGTERM'))
        } else {
          console.log('✅ Webhook режим. Ожидаем Update на /api/telegram/webhook')
        }
      } catch (e) {
        console.error('⚠️ Фоновая инициализация бота не удалась:', (e as Error).message)
      }
    })()

    console.log('🔄 Бот инициализируется в фоне (не блокирует запросы)')
  } catch (e) {
    console.error('❌ Ошибка инициализации бота:', (e as Error).message)
    globalForBot.__botStarted = false
  }
}

// Получить инстанс бота (для webhook endpoint)
export function getBot(): Telegraf | null {
  return globalForBot.__botInstance ?? null
}

// Проверка статуса бота (для API)
export function isBotRunning(): boolean {
  return globalForBot.__botStarted === true
}
