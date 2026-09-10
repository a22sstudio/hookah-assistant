import { config as loadEnv } from 'dotenv'
import { Telegraf, Markup } from 'telegraf'
import http from 'node:http'

// Загружаем .env из корня проекта (на два уровня выше)
loadEnv({ path: new URL('../../.env', import.meta.url).pathname })

// Конфигурация
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const BOT_SECRET = process.env.BOT_SECRET
const API_URL = process.env.NEXT_API_URL || 'http://localhost:3000'
const PORT = 3003

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан')
  process.exit(1)
}
if (!BOT_SECRET) {
  console.error('❌ BOT_SECRET не задан')
  process.exit(1)
}

// Простой лог
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

// HTTP-вызов к Next.js API с секретом
async function api(pathname: string, opts: { method?: string; body?: any; query?: Record<string, string> } = {}) {
  const url = new URL(API_URL + pathname)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Bot-Secret': BOT_SECRET,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { ok: res.ok, status: res.status, data }
}

// Чтение файла в base64 (для голоса/фото) — не используется, удалено
// Длительность в human-формате
function humanDuration(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}ч ${m}м`
}

// Цвета ролей для эмодзи
function roleEmoji(role: string): string {
  return role === 'SENIOR' ? '⭐️' : '🌿'
}

// ───────────────────────────────────────────
// Создаём бота
// ───────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN)

// Middleware: идентифицируем мастера по telegramId
bot.use(async (ctx, next) => {
  const tgId = String(ctx.from?.id || '')
  if (!tgId) return

  const { ok, data } = await api('/api/bot/identify', { query: { telegramId: tgId } })
  if (!ok) {
    ctx.state.master = null
  } else {
    ctx.state.master = (data as any).master || null
  }
  return next()
})

// ─── /claim <PIN> — привязать свой Telegram к мастеру по PIN ───
bot.command('claim', async (ctx) => {
  const tgId = String(ctx.from?.id || '')
  if (!tgId) return

  const pin = ctx.message.text.split(/\s+/)[1]
  if (!pin) {
    return ctx.reply(
      'Формат: /claim PIN\n\nНапример: /claim 1111\n\nPIN выдаёт старший мастер (или он есть в веб-панели).',
    )
  }

  // Ищем мастера по PIN через специальный путь: /api/bot/claim
  const { ok, data } = await api('/api/bot/claim', {
    method: 'POST',
    body: { telegramId: tgId, pin },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Не удалось привязать'}`)

  const d = data as any
  const master = d.master
  return ctx.reply(
    `✅ Готово!\n\n${roleEmoji(master.role)} ${master.name}\nРоль: ${master.role === 'SENIOR' ? 'Старший мастер' : 'Мастер'}\n\nТеперь можете пользоваться ботом. /help — список команд.`,
  )
})

// ─── /start ───
bot.command('start', async (ctx) => {
  const tgId = String(ctx.from?.id || '')
  const master = ctx.state.master

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
    `${isSenior ? '/register — добавить мастера\n/masters — список мастеров\n' : ''}` +
    `/whoami — кто я\n/help — помощь`,
    { parse_mode: 'HTML' },
  )
})

// ─── /help ───
bot.command('help', async (ctx) => {
  const master = ctx.state.master
  if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

  const isSenior = master.role === 'SENIOR'
  return ctx.reply(
    `📋 Команды\n\n` +
    `• /shift — открыть или закрыть смену\n` +
    `• /+1 или просто "+1" — добавить кальян\n` +
    `• /status — кто сейчас на смене\n` +
    `• /whoami — кто я\n` +
    `• /help — эта справка\n\n` +
    `💬 Можно просто писать текстом:\n` +
    `  "пол банки дарксайд супнова кола"\n` +
    `  "закажи blackburn energy 2 банки"\n` +
    `  "хочу новые шланги"\n` +
    `  "чего мало?"\n\n` +
    `🎤 Голосовое — распознаю и обработаю.\n` +
    `📸 Фото накладной — распознаю и оформлю приход${isSenior ? '' : ' (старшему)'}.\n` +
    (isSenior
      ? `\n⭐️ Старший:\n• /register Имя РОЛЬ telegramId — добавить мастера\n• /masters — список`
      : ''),
  )
})

// ─── /whoami ───
bot.command('whoami', async (ctx) => {
  const tgId = String(ctx.from?.id || '')
  const master = ctx.state.master
  if (!master) {
    return ctx.reply(
      `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${tgId}</code>\nОбратитесь к старшему мастеру.`,
      { parse_mode: 'HTML' },
    )
  }
  return ctx.reply(
    `${roleEmoji(master.role)} ${master.name}\n` +
    `Роль: ${master.role === 'SENIOR' ? 'Старший мастер' : 'Мастер'}\n` +
    `Telegram ID: <code>${tgId}</code>`,
    { parse_mode: 'HTML' },
  )
})

// ─── /status — кто на смене ───
bot.command('status', async (ctx) => {
  const master = ctx.state.master
  if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

  const { ok, data } = await api('/api/bot/shift', {
    method: 'POST',
    body: { telegramId: String(ctx.from.id), action: 'status' },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Ошибка'}`)

  const d = data as any
  const lines: string[] = []
  if (d.allOpen && d.allOpen.length > 0) {
    lines.push('👥 На смене сейчас:')
    for (const s of d.allOpen) {
      const mine = s.masterName === master.name ? ' (вы)' : ''
      lines.push(`  ${roleEmoji(s.masterRole)} ${s.masterName}${mine} — ${s.hookahCount} кальянов · ${humanDuration(s.openedAt)}`)
    }
  } else {
    lines.push('🚪 Никого на смене.')
  }
  if (d.myShift) {
    lines.push(`\n📊 Ваша смена: ${d.myShift.hookahCount} кальянов · ${humanDuration(d.myShift.openedAt)}`)
  } else if (d.canOpen) {
    lines.push('\n✅ Можете открыть смену: /shift')
  } else if (!d.isAfterNoon) {
    lines.push('\n⏰ Смена открывается с 12:00 по МСК.')
  }
  return ctx.reply(lines.join('\n'))
})

// ─── /shift — открыть/закрыть ───
bot.command('shift', async (ctx) => {
  const master = ctx.state.master
  if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

  // Сначала проверим текущее состояние
  const { ok, data } = await api('/api/bot/shift', {
    method: 'POST',
    body: { telegramId: String(ctx.from.id), action: 'status' },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Ошибка'}`)

  const d = data as any
  if (d.myShift) {
    // Смена открыта → предлагаем закрыть
    return ctx.reply(
      `Ваша смена открыта.\nКальянов: ${d.myShift.hookahCount}\nДлительность: ${humanDuration(d.myShift.openedAt)}\n\nЗакрыть смену?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Закрыть смену', 'shift_close')],
      ]),
    )
  }
  // Смены нет → предлагаем открыть
  if (!d.isAfterNoon) {
    return ctx.reply('⏰ Смену можно открыть с 12:00 по МСК.')
  }
  return ctx.reply(
    'Открыть смену?',
    Markup.inlineKeyboard([
      [Markup.button.callback('🌿 Открыть смену', 'shift_open')],
    ]),
  )
})

// Callback-кнопки для смены
bot.action('shift_open', async (ctx) => {
  await ctx.answerCbQuery()
  const { ok, data } = await api('/api/bot/shift', {
    method: 'POST',
    body: { telegramId: String(ctx.from.id), action: 'open' },
  })
  if (!ok) return ctx.editMessageText(`⚠️ ${(data as any).error || 'Ошибка'}`)
  return ctx.editMessageText('✅ Смена открыта! Считай кальяны командой /+1 или просто "+1".')
})

bot.action('shift_close', async (ctx) => {
  await ctx.answerCbQuery()
  const { ok, data } = await api('/api/bot/shift', {
    method: 'POST',
    body: { telegramId: String(ctx.from.id), action: 'close' },
  })
  if (!ok) return ctx.editMessageText(`⚠️ ${(data as any).error || 'Ошибка'}`)
  const d = data as any
  return ctx.editMessageText(`✅ Смена закрыта. Кальянов за смену: ${d.shift?.hookahCount ?? 0}`)
})

// ─── /+1 или просто +1 ───
bot.command(['+1', 'hookah', 'kalyan'], async (ctx) => {
  const master = ctx.state.master
  if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

  const { ok, data } = await api('/api/bot/shift', {
    method: 'POST',
    body: { telegramId: String(ctx.from.id), action: 'add' },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Ошибка'}`)
  const d = data as any
  return ctx.reply(`🪔 +1 кальян\nВсего за смену: ${d.count}`)
})

// Реагируем на текст "+1" или "+1 кальян"
bot.hears(/^\+\s?1(\s+кальян)?$/i, async (ctx) => {
  const master = ctx.state.master
  if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')

  const { ok, data } = await api('/api/bot/shift', {
    method: 'POST',
    body: { telegramId: String(ctx.from.id), action: 'add' },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Ошибка'}`)
  const d = data as any
  return ctx.reply(`🪔 +1 кальян\nВсего за смену: ${d.count}`)
})

// ─── /register (только старший) ───
bot.command('register', async (ctx) => {
  const master = ctx.state.master
  if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')
  if (master.role !== 'SENIOR') return ctx.reply('⛔ Только старший может регистрировать мастеров.')

  const args = ctx.message.text.split(/\s+/).slice(1)
  if (args.length < 2) {
    return ctx.reply(
      'Формат: /register Имя РОЛЬ [telegramId]\n\nПримеры:\n' +
      '/register Айрат REGULAR 123456789\n' +
      '/register Тимур SENIOR\n' +
      `\nВаш Telegram ID (покажите новому мастеру, чтобы он прислал /start): <code>${ctx.from.id}</code>`,
      { parse_mode: 'HTML' },
    )
  }

  const name = args[0]
  const role = args[1].toUpperCase() === 'SENIOR' ? 'SENIOR' : 'REGULAR'
  const telegramId = args[2] || undefined

  const { ok, data } = await api('/api/bot/register', {
    method: 'POST',
    body: {
      seniorTelegramId: String(ctx.from.id),
      name,
      role,
      telegramId,
    },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Ошибка'}`)

  const d = data as any
  return ctx.reply(
    `✅ ${d.message}\n\nИмя: ${d.master.name}\nРоль: ${d.master.role}\n` +
    `Telegram: ${d.master.telegramId || '(не привязан — мастер пришлёт /start и сообщит ID)'}\n` +
    `PIN для веб-входа: ${d.master.pin}`,
  )
})

// ─── /masters (только старший) ───
bot.command('masters', async (ctx) => {
  const master = ctx.state.master
  if (!master) return ctx.reply('🔒 Вы не зарегистрированы. /start')
  if (master.role !== 'SENIOR') return ctx.reply('⛔ Только старший.')

  const { ok, data } = await api('/api/bot/masters', {
    query: { seniorTelegramId: String(ctx.from.id) },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Ошибка'}`)

  const d = data as any
  const lines = d.masters.map((m: any) =>
    `${roleEmoji(m.role)} ${m.name} — ${m.role === 'SENIOR' ? 'старший' : 'мастер'} | tg: ${m.telegramId || '—'} | pin: ${m.pin}`,
  )
  return ctx.reply(`👥 Мастера (${d.masters.length}):\n\n${lines.join('\n')}`)
})

// ─── Текстовые сообщения → AI ───
bot.on('text', async (ctx) => {
  const master = ctx.state.master
  if (!master) {
    return ctx.reply(
      `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${ctx.from.id}</code>\nОбратитесь к старшему мастеру.`,
      { parse_mode: 'HTML' },
    )
  }

  const text = ctx.message.text
  // Пропускаем команды — их уже обработали выше
  if (text.startsWith('/')) return

  await ctx.sendChatAction('typing')
  const { ok, data } = await api('/api/bot/chat', {
    method: 'POST',
    body: {
      telegramId: String(ctx.from.id),
      message: text,
      source: 'TEXT',
    },
  })
  if (!ok) return ctx.reply(`⚠️ ${(data as any).error || 'Ошибка'}`)

  const d = data as any
  let reply = d.reply || 'Готово.'
  if (d.executedActions && d.executedActions.length > 0) {
    reply += '\n\n'
    for (const a of d.executedActions) {
      reply += `${a.success ? '✅' : '❌'} ${a.message}\n`
    }
  }
  return ctx.reply(reply)
})

// ─── Голосовые сообщения → ASR → AI ───
bot.on('voice', async (ctx) => {
  const master = ctx.state.master
  if (!master) {
    return ctx.reply(
      `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${ctx.from.id}</code>\nОбратитесь к старшему мастеру.`,
      { parse_mode: 'HTML' },
    )
  }

  await ctx.sendChatAction('typing')
  try {
    const fileId = ctx.message.voice.file_id
    const fileLink = await bot.telegram.getFileLink(fileId)
    // Скачиваем файл
    const res = await fetch(fileLink.toString())
    const buf = Buffer.from(await res.arrayBuffer())
    const audioBase64 = buf.toString('base64')

    // ASR
    const asrRes = await api('/api/bot/asr', {
      method: 'POST',
      body: { audio: audioBase64 },
    })
    if (!asrRes.ok) return ctx.reply(`⚠️ Ошибка распознавания голоса: ${(asrRes.data as any).error}`)
    const transcribedText = (asrRes.data as any).text
    if (!transcribedText) return ctx.reply('⚠️ Не удалось распознать речь.')

    // AI
    const chatRes = await api('/api/bot/chat', {
      method: 'POST',
      body: {
        telegramId: String(ctx.from.id),
        message: transcribedText,
        source: 'VOICE',
        transcribedText,
      },
    })
    if (!chatRes.ok) return ctx.reply(`⚠️ ${(chatRes.data as any).error}`)

    const d = chatRes.data as any
    let reply = `🎙 Распознал: «${transcribedText}»\n\n${d.reply || 'Готово.'}`
    if (d.executedActions && d.executedActions.length > 0) {
      reply += '\n\n'
      for (const a of d.executedActions) {
        reply += `${a.success ? '✅' : '❌'} ${a.message}\n`
      }
    }
    return ctx.reply(reply)
  } catch (e) {
    log('Voice error: ' + (e as Error).message)
    return ctx.reply('⚠️ Не удалось обработать голосовое.')
  }
})

// ─── Фото → VLM → AI ───
bot.on('photo', async (ctx) => {
  const master = ctx.state.master
  if (!master) {
    return ctx.reply(
      `🔒 Вы не зарегистрированы.\n\nВаш Telegram ID: <code>${ctx.from.id}</code>\nОбратитесь к старшему мастеру.`,
      { parse_mode: 'HTML' },
    )
  }

  await ctx.sendChatAction('typing')
  try {
    // Берём самое большое фото
    const photos = ctx.message.photo
    const biggest = photos[photos.length - 1]
    const fileLink = await bot.telegram.getFileLink(biggest.file_id)
    const res = await fetch(fileLink.toString())
    const buf = Buffer.from(await res.arrayBuffer())
    const imageBase64 = 'data:image/jpeg;base64,' + buf.toString('base64')

    // VLM
    const vlmRes = await api('/api/bot/vlm', {
      method: 'POST',
      body: { image: imageBase64 },
    })
    if (!vlmRes.ok) return ctx.reply(`⚠️ Ошибка распознавания: ${(vlmRes.data as any).error}`)
    const items = (vlmRes.data as any).items || []
    if (items.length === 0) return ctx.reply('⚠️ Не удалось распознать позиции на фото.')

    // AI — оформляем приход
    const chatRes = await api('/api/bot/chat', {
      method: 'POST',
      body: {
        telegramId: String(ctx.from.id),
        message: 'оформи приход по накладной',
        source: 'PHOTO',
        invoiceItems: items,
      },
    })
    if (!chatRes.ok) return ctx.reply(`⚠️ ${(chatRes.data as any).error}`)

    const d = chatRes.data as any
    let reply = `📸 Распознал ${items.length} поз.:\n`
    for (const i of items) reply += `• ${i.brand} ${i.line} ${i.flavor} — ${i.grams}г\n`
    reply += `\n${d.reply || 'Готово.'}`
    if (d.executedActions && d.executedActions.length > 0) {
      reply += '\n\n'
      for (const a of d.executedActions) {
        reply += `${a.success ? '✅' : '❌'} ${a.message}\n`
      }
    }
    return ctx.reply(reply)
  } catch (e) {
    log('Photo error: ' + (e as Error).message)
    return ctx.reply('⚠️ Не удалось обработать фото.')
  }
})

// ─── Запуск ───
async function start() {
  log('🚀 Запуск hookah-bot...')

  // Проверяем токен через getMe
  const me = await bot.telegram.getMe()
  log(`🤖 Бот авторизован: @${me.username} (${me.first_name})`)

  // Запускаем polling
  bot.launch()
  log('✅ Polling запущен. Ctrl+C для остановки.')

  // Health HTTP сервер на 3003 — для проверки живости и `bun --hot`
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, bot: me.username, uptime: process.uptime() }))
    } else {
      res.writeHead(404)
      res.end('not found')
    }
  })
  server.listen(PORT, () => {
    log(`💚 Health endpoint: http://localhost:${PORT}/health`)
  })

  // Корректное завершение
  process.once('SIGINT', () => {
    bot.stop('SIGINT')
    server.close()
  })
  process.once('SIGTERM', () => {
    bot.stop('SIGTERM')
    server.close()
  })
}

start().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
