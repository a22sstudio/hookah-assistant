import { db } from '@/lib/db'
import type { SessionMaster } from '@/lib/auth'
import { pushToSeniors } from '@/lib/notify'
import { parseDateFromText, startOfDay, formatDateRu, addDays } from '@/lib/datetime-utils'

// ───────────────────────────────────────────
// AI: OpenRouter для LLM, Groq для ASR
// LLM: nex-agi/nex-n2.5-mini:free — работает (1сек), бесплатно
// ASR: Groq whisper-large-v3 (работает на Railway)
// ───────────────────────────────────────────

const OR_API = 'https://openrouter.ai/api/v1/chat/completions'
const LLM_MODEL = process.env.LLM_MODEL || 'nex-agi/nex-n2.5-mini:free'

function getApiKey(): string {
  const t = process.env.OPENROUTER_API_KEY
  if (!t) throw new Error('OPENROUTER_API_KEY не задан в переменных окружения')
  return t
}

function getGroqKey(): string | null {
  return process.env.GROQ_API_KEY || null
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string; reasoning?: string }
    finish_reason?: string
  }>
  error?: { message: string }
}

async function hfChat(messages: ChatMessage[], opts: { vision?: boolean; maxTokens?: number } = {}): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)

  let res: Response
  try {
    res = await fetch(OR_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: 0.3,
      }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeout)
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('AI не ответил за 25 сек')
    }
    throw e
  }
  clearTimeout(timeout)

  const data = (await res.json()) as ChatResponse
  if (!res.ok || data.error) {
    throw new Error(`OpenRouter: ${data.error?.message || res.status}`)
  }

  return data.choices?.[0]?.message?.content ?? ''
}

// Экспортируем hfChat для использования в других модулях (например, AI-парсер PDF накладных)
export { hfChat }

// ───────────────────────────────────────────
// Типы действий
// ───────────────────────────────────────────
export type AIAction =
  | { tool: 'update_stock'; args: { brand: string; line: string; flavor: string; grams: number; note?: string } }
  | { tool: 'add_incoming'; args: { brand: string; line: string; flavor: string; grams: number; note?: string } }
  | { tool: 'add_tobacco'; args: { brand: string; line: string; flavor: string; defaultJarGrams?: number } }
  | { tool: 'create_order'; args: { brand: string; line: string; flavor: string; grams: number; note?: string } }
  | { tool: 'create_request'; args: { text: string; grams?: number } }
  | { tool: 'create_wish'; args: { text: string } }
  | { tool: 'update_schedule'; args: { masterName: string; dateText: string; action: 'add' | 'remove' } }
  | { tool: 'add_schedule_multi'; args: { masterNames: string[]; dateText: string } }
  | { tool: 'calc_salary'; args: { masterName: string; dateText?: string } }
  | { tool: 'query'; args: { what: 'low_stock' | 'all_stock' | 'specific' | 'schedule'; brand?: string; line?: string; flavor?: string } }

export interface AIResult {
  reply: string
  actions: AIAction[]
  executedActions: Array<{ tool: string; success: boolean; message: string; data?: unknown }>
  transcribedText?: string
  invoiceItems?: Array<{ brand: string; line: string; flavor: string; grams: number }>
}

// ───────────────────────────────────────────
// Системный промпт — сжатый, ~800 токенов
// ───────────────────────────────────────────
function buildSystemPrompt(stockContext: string, master: SessionMaster, scheduleContext: string, consumablesContext: string): string {
  const isSenior = master.role === 'SENIOR'

  const tools = isSenior
    ? `1. update_stock(brand,line,flavor,grams,note?) — установить остаток (абсолют)
2. add_incoming(brand,line,flavor,grams,note?) — приход, прибавить к остатку
3. add_tobacco(brand,line,flavor,defaultJarGrams?) — добавить позицию в базу
4. create_order(brand,line,flavor,grams,note?) — заявка на закуп по табаку
5. create_request(text,grams?) — заявка свободной формы ("BlackBurn Energy 2 банки")
6. create_wish(text) — хотелка
7. update_schedule(masterName,dateText,action="add"|"remove") — график: "поставь Марата на завтра"
8. add_schedule_multi(masterNames[],dateText) — несколько мастеров: "поставь Марата и Айрата на завтра"
9. calc_salary(masterName,dateText?) — зарплата: "зарплата Марата за сентябрь"
10. query(what="low_stock"|"all_stock"|"schedule") — "чего мало?" / "остатки" / "кто работает"`
    : `1. update_stock(brand,line,flavor,grams,note?) — отметить остаток (обычный не оформляет приход и не создаёт новые позиции — это старший)
2. create_request(text,grams?) — заявка на закуп свободной формы
3. create_wish(text) — хотелка
4. query(what="low_stock"|"all_stock"|"schedule") — "чего мало?" / "остатки" / "кто сегодня работает"
НЕ используй add_incoming, add_tobacco, create_order, update_schedule, add_schedule_multi, calc_salary — это для старшего.`

  return `Ты — умный ассистент кальянной. Работает: ${master.name} (${isSenior ? 'старший мастер, полный доступ' : 'мастер, отмечает остатки и заявки'}).

СКЛАД (бренд/линейка/вкус | банка | остаток | порог):
${stockContext}

РАСХОДНИКИ:
${consumablesContext}

${scheduleContext}

ИНСТРУМЕНТЫ:
${tools}

ПРАВИЛА:
- "пол банки" → defaultJarGrams/2; "треть" → /3; "четверть" → /4; "на донышке"/"почти пусто" → 20; "пусто"/"кончился" → 0; "осталось N г" → N
- update_stock УСТАНАВЛИВАЕТ, add_incoming ПРИБАВЛЯЕТ
- "закажи X" → create_order (старший) или create_request (обычный)
- "хочу X" → create_wish; "чего мало?" → query low_stock; "остатки" → query all_stock; "кто сегодня работает?" → query schedule
- Структура табака: brand (Darkside, Tangiers, BlackBurn) / line (Core, Supernova, опциональна) / flavor (Cola, Ice Grape)
- Fuzzy: "дарксайд супнова" = Darkside Supernova, "танж" = Tangiers
- Если мастер сообщает остаток → update_stock. Если указан только бренд/линейка — УТОЧНИ вкус
- При обработке накладной (PDF/фото): для каждой позиции — add_tobacco (если нет) + add_incoming. В reply перечисли приход
- Только SENIOR: add_incoming, add_tobacco, create_order, update_schedule, add_schedule_multi, calc_salary
- Когда обычный мастер отмечает 0г или ниже порога — старший получит авто-пуш
- Отвечай кратко, по-русски, можно с эмодзи. Обращайся к мастеру по имени.

ФОРМАТ ОТВЕТА — СТРОГО JSON без markdown:
{"actions":[{"tool":"update_stock","args":{"brand":"Darkside","line":"Supernova","flavor":"Ice Grape","grams":125,"note":"пол банки"}}],"reply":"✓ Записал: Darkside Supernova Ice Grape = 125г (пол банки)"}

Без действий → пустой actions и reply с ответом.`
}

// Fuzzy поиск табака в базе по названию
async function findTobacco(brand: string, line: string, flavor: string) {
  const all = await db.tobacco.findMany({ where: { active: true }, include: { stock: true } })

  const normalize = (s: string) => s.toLowerCase().trim()
  const b = normalize(brand)
  const l = normalize(line)
  const f = normalize(flavor)

  let match = all.find(
    (t) => normalize(t.brand) === b && normalize(t.line) === l && normalize(t.flavor) === f,
  )
  if (match) return match

  match = all.find((t) => normalize(t.brand) === b && normalize(t.flavor) === f)
  if (match) return match

  if (!flavor) {
    match = all.find((t) => normalize(t.brand) === b && normalize(t.line) === l)
    if (match) return match
  }

  match = all.find(
    (t) =>
      normalize(t.brand).includes(b) ||
      (b && b.includes(normalize(t.brand))) ||
      normalize(t.flavor).includes(f) ||
      (f && f.includes(normalize(t.flavor))),
  )
  return match
}

// Контекст склада для промпта
async function buildStockContext(): Promise<string> {
  const tobaccos = await db.tobacco.findMany({
    where: { active: true },
    include: { stock: true },
    orderBy: [{ brand: 'asc' }, { line: 'asc' }, { flavor: 'asc' }],
  })

  if (tobaccos.length === 0) return '(справочник пуст)'

  const lines = tobaccos.map((t) => {
    const grams = t.stock?.currentGrams ?? 0
    const status = grams < t.thresholdGrams ? ' ⚠️МАЛО' : ''
    return `- ${t.brand}/${t.line}/${t.flavor} | банка=${t.defaultJarGrams}г | остаток=${grams}г | порог=${t.thresholdGrams}г${status}`
  })
  return lines.join('\n')
}

// Контекст расходников
async function buildConsumablesContext(): Promise<string> {
  const consumables = await db.consumable.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })
  if (consumables.length === 0) return '(нет расходников)'
  return consumables
    .map((c) => {
      const status = c.currentQty < c.threshold ? ' ⚠️МАЛО' : ''
      return `- ${c.name} | ${c.currentQty}${c.unit} | порог=${c.threshold}${c.unit}${status}`
    })
    .join('\n')
}

// Контекст графика (замена buildShiftContext) — берёт сегодня + завтра + ближайшие заявки/хотелки
async function buildScheduleContext(master: SessionMaster): Promise<string> {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)

  const todayEntries = await db.scheduleEntry.findMany({
    where: { date: today },
    include: { master: true },
    orderBy: { createdAt: 'asc' },
  })
  const tomorrowEntries = await db.scheduleEntry.findMany({
    where: { date: tomorrow },
    include: { master: true },
    orderBy: { createdAt: 'asc' },
  })

  const activeRequests = await db.masterRequest.findMany({
    where: { status: 'PENDING' },
    include: { master: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const pendingWishes = await db.wish.findMany({
    where: { status: 'PENDING' },
    include: { master: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const lines: string[] = []
  lines.push('ГРАФИК:')
  const fmtToday = todayEntries.length > 0
    ? todayEntries.map((e) => {
        const mine = e.masterId === master.id ? ' (ты)' : ''
        return `${e.master.name}${mine}`
      }).join(', ')
    : 'сегодня выходной'
  const fmtTomorrow = tomorrowEntries.length > 0
    ? tomorrowEntries.map((e) => {
        const mine = e.masterId === master.id ? ' (ты)' : ''
        return `${e.master.name}${mine}`
      }).join(', ')
    : 'выходной'
  lines.push(`- Сегодня (${formatDateRu(today)}): ${fmtToday}`)
  lines.push(`- Завтра (${formatDateRu(tomorrow)}): ${fmtTomorrow}`)

  if (activeRequests.length > 0) {
    lines.push('\nАКТИВНЫЕ ЗАЯВКИ:')
    for (const r of activeRequests) {
      lines.push(`- ${r.master.name}: "${r.text}"${r.grams ? ` (${r.grams}г)` : ''}`)
    }
  }

  if (pendingWishes.length > 0) {
    lines.push('\nХОТЕЛКИ:')
    for (const w of pendingWishes) {
      lines.push(`- ${w.master.name}: "${w.text}"`)
    }
  }

  return lines.join('\n')
}

// Парсинг JSON из ответа LLM (с защитой от markdown обёртки и reasoning)
function parseAIResponse(content: string): { actions: AIAction[]; reply: string } {
  let cleaned = content.trim()

  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim()
  }

  const jsonObj = cleaned.match(/\{[\s\S]*\}/)
  if (jsonObj) {
    cleaned = jsonObj[0]
  }

  try {
    const parsed = JSON.parse(cleaned)
    return {
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      reply: typeof parsed.reply === 'string' ? parsed.reply : 'Готово.',
    }
  } catch {
    return { actions: [], reply: content }
  }
}

// Выполнение одного action
async function executeAction(action: AIAction, master: SessionMaster): Promise<{ success: boolean; message: string; data?: unknown }> {
  try {
    switch (action.tool) {
      case 'update_stock': {
        const { brand, line, flavor, grams, note } = action.args
        const tobacco = await findTobacco(brand, line, flavor)
        if (!tobacco) {
          return { success: false, message: `Табак "${brand} ${line} ${flavor}" не найден в базе` }
        }
        const before = tobacco.stock?.currentGrams ?? 0
        await db.stockItem.upsert({
          where: { tobaccoId: tobacco.id },
          update: { currentGrams: grams },
          create: { tobaccoId: tobacco.id, currentGrams: grams },
        })
        await db.operation.create({
          data: {
            tobaccoId: tobacco.id,
            type: 'ADJUSTMENT',
            gramsBefore: before,
            gramsAfter: grams,
            delta: grams - before,
            source: 'TEXT',
            note: note ?? null,
          },
        })
        if (master.role !== 'SENIOR' && (grams === 0 || grams < tobacco.thresholdGrams)) {
          const reason = grams === 0 ? 'закончился' : `мало осталось (${grams}г)`
          const notifMsg = `⚠️ ${master.name} отметил: ${reason} ${tobacco.brand} ${tobacco.line} ${tobacco.flavor}`
          await db.notification.create({
            data: {
              type: 'FINISHED',
              message: notifMsg,
              masterId: master.id,
            },
          })
          await pushToSeniors(notifMsg)
        }
        return {
          success: true,
          message: `${tobacco.brand} ${tobacco.line} ${tobacco.flavor}: ${before}г → ${grams}г`,
          data: { before, after: grams, tobaccoId: tobacco.id },
        }
      }

      case 'add_incoming': {
        const { brand, line, flavor, grams, note } = action.args
        const tobacco = await findTobacco(brand, line, flavor)
        if (!tobacco) {
          return { success: false, message: `Табак "${brand} ${line} ${flavor}" не найден в базе` }
        }
        const before = tobacco.stock?.currentGrams ?? 0
        const after = before + grams
        await db.stockItem.upsert({
          where: { tobaccoId: tobacco.id },
          update: { currentGrams: after },
          create: { tobaccoId: tobacco.id, currentGrams: after },
        })
        await db.operation.create({
          data: {
            tobaccoId: tobacco.id,
            type: 'INCOMING',
            gramsBefore: before,
            gramsAfter: after,
            delta: grams,
            source: 'TEXT',
            note: note ?? 'Приход',
          },
        })
        return {
          success: true,
          message: `Приход ${tobacco.brand} ${tobacco.flavor}: +${grams}г (стало ${after}г)`,
          data: { before, after, added: grams, tobaccoId: tobacco.id },
        }
      }

      case 'add_tobacco': {
        const { brand, line, flavor, defaultJarGrams = 250 } = action.args
        const existing = await db.tobacco.findFirst({ where: { brand, line, flavor } })
        if (existing) {
          return { success: true, message: `Табак уже в базе`, data: { tobaccoId: existing.id } }
        }
        const tobacco = await db.tobacco.create({
          data: { brand, line, flavor, defaultJarGrams, thresholdGrams: 70 },
        })
        await db.stockItem.create({ data: { tobaccoId: tobacco.id, currentGrams: 0 } })
        return {
          success: true,
          message: `Добавлен новый табак: ${brand} ${line} ${flavor} (банка ${defaultJarGrams}г)`,
          data: { tobaccoId: tobacco.id },
        }
      }

      case 'create_order': {
        const { brand, line, flavor, grams, note } = action.args
        const tobacco = await findTobacco(brand, line, flavor)
        if (!tobacco) {
          return { success: false, message: `Табак "${brand} ${line} ${flavor}" не найден` }
        }
        const order = await db.orderRequest.create({
          data: { tobaccoId: tobacco.id, gramsRequested: grams, status: 'PENDING', note: note ?? null },
        })
        return {
          success: true,
          message: `Заявка: ${tobacco.brand} ${tobacco.flavor} ${grams}г`,
          data: { orderId: order.id },
        }
      }

      case 'create_request': {
        const { text, grams } = action.args
        const request = await db.masterRequest.create({
          data: { masterId: master.id, text, grams: grams ?? null },
        })
        if (master.role !== 'SENIOR') {
          const notifMsg = `📋 ${master.name}: заявка на закуп — "${text}"`
          await db.notification.create({
            data: { type: 'REQUEST', message: notifMsg, masterId: master.id },
          })
          await pushToSeniors(notifMsg)
        }
        return { success: true, message: `Заявка принята: "${text}"`, data: { requestId: request.id } }
      }

      case 'create_wish': {
        const { text } = action.args
        const wish = await db.wish.create({ data: { masterId: master.id, text } })
        if (master.role !== 'SENIOR') {
          const notifMsg = `💡 ${master.name}: хотелка — "${text}"`
          await db.notification.create({
            data: { type: 'WISH', message: notifMsg, masterId: master.id },
          })
          await pushToSeniors(notifMsg)
        }
        return { success: true, message: `Хотелка добавлена: "${text}"`, data: { wishId: wish.id } }
      }

      case 'update_schedule': {
        if (master.role !== 'SENIOR') {
          return { success: false, message: 'Только старший может редактировать график' }
        }
        const { masterName, dateText, action: scheduleAction } = action.args
        const dateObj = parseDateFromText(dateText)
        if (!dateObj) {
          return { success: false, message: `Не удалось распознать дату: "${dateText}"` }
        }
        const date = startOfDay(dateObj)

        const allMasters = await db.master.findMany({ where: { active: true } })
        const norm = (s: string) => s.toLowerCase().trim()
        const target = norm(masterName)
        let masterRec = allMasters.find((m) => norm(m.name) === target)
        if (!masterRec) {
          masterRec = allMasters.find((m) => norm(m.name).includes(target) || target.includes(norm(m.name)))
        }
        if (!masterRec) {
          return { success: false, message: `Мастер "${masterName}" не найден. Доступные: ${allMasters.map((m) => m.name).join(', ')}` }
        }

        if (scheduleAction === 'remove') {
          const existing = await db.scheduleEntry.findMany({
            where: { masterId: masterRec.id, date },
          })
          if (existing.length === 0) {
            return { success: false, message: `${masterRec.name} не был запланирован на ${formatDateRu(date)}` }
          }
          await db.scheduleEntry.deleteMany({
            where: { masterId: masterRec.id, date },
          })
          return {
            success: true,
            message: `Убрал ${masterRec.name} с графика за ${formatDateRu(date)}`,
          }
        }

        await db.scheduleEntry.create({
          data: { masterId: masterRec.id, date },
        })
        return {
          success: true,
          message: `${masterRec.name} работает ${formatDateRu(date)}`,
        }
      }

      case 'add_schedule_multi': {
        if (master.role !== 'SENIOR') {
          return { success: false, message: 'Только старший может редактировать график' }
        }
        const { masterNames, dateText } = action.args
        if (!Array.isArray(masterNames) || masterNames.length === 0) {
          return { success: false, message: 'Не переданы имена мастеров' }
        }
        const dateObj = parseDateFromText(dateText)
        if (!dateObj) {
          return { success: false, message: `Не удалось распознать дату: "${dateText}"` }
        }
        const date = startOfDay(dateObj)

        const allMasters = await db.master.findMany({ where: { active: true } })
        const norm = (s: string) => s.toLowerCase().trim()

        const results: string[] = []
        const failed: string[] = []
        for (const rawName of masterNames) {
          const target = norm(rawName)
          let masterRec = allMasters.find((m) => norm(m.name) === target)
          if (!masterRec) {
            masterRec = allMasters.find((m) => norm(m.name).includes(target) || target.includes(norm(m.name)))
          }
          if (!masterRec) {
            failed.push(rawName)
            continue
          }
          await db.scheduleEntry.create({
            data: { masterId: masterRec.id, date },
          })
          results.push(masterRec.name)
        }

        if (results.length === 0) {
          return {
            success: false,
            message: `Никого не удалось поставить. Доступные: ${allMasters.map((m) => m.name).join(', ')}`,
          }
        }

        let msg = `Поставил на ${formatDateRu(date)}: ${results.join(', ')}`
        if (failed.length > 0) {
          msg += `. Не найдены: ${failed.join(', ')}`
        }
        return { success: true, message: msg }
      }

      case 'calc_salary': {
        if (master.role !== 'SENIOR') {
          return { success: false, message: 'Только старший может считать зарплату' }
        }
        const { masterName, dateText } = action.args

        const allMasters = await db.master.findMany({ where: { active: true } })
        const norm = (s: string) => s.toLowerCase().trim()
        const target = norm(masterName)
        let masterRec = allMasters.find((m) => norm(m.name) === target)
        if (!masterRec) {
          masterRec = allMasters.find((m) => norm(m.name).includes(target) || target.includes(norm(m.name)))
        }
        if (!masterRec) {
          return { success: false, message: `Мастер "${masterName}" не найден. Доступные: ${allMasters.map((m) => m.name).join(', ')}` }
        }

        // Определяем период — по умолчанию текущий месяц
        const today = new Date()
        let fromDate: Date
        let toDate: Date

        if (dateText) {
          const monthMatch = dateText.toLowerCase().match(/(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)/)
          if (monthMatch) {
            const monthMap: Record<string, number> = {
              январ: 0, феврал: 1, март: 2, апрел: 3, ма: 4, май: 4,
              июн: 5, июл: 6, август: 7, сентябр: 8, октябр: 9, ноябр: 10, декабр: 11,
            }
            const monthIdx = monthMap[monthMatch[1]] ?? today.getMonth()
            const year = today.getMonth() < monthIdx ? today.getFullYear() - 1 : today.getFullYear()
            fromDate = startOfDay(new Date(year, monthIdx, 1))
            toDate = addDays(startOfDay(new Date(year, monthIdx + 1, 0)), 1)
          } else {
            const parsed = parseDateFromText(dateText)
            if (!parsed) {
              return { success: false, message: `Не удалось распознать период: "${dateText}"` }
            }
            fromDate = startOfDay(parsed)
            toDate = addDays(fromDate, 1)
          }
        } else {
          fromDate = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1))
          toDate = addDays(startOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)), 1)
        }

        // Считаем записи графика мастера в диапазоне (замена Shifts)
        const entries = await db.scheduleEntry.findMany({
          where: {
            masterId: masterRec.id,
            date: { gte: fromDate, lt: toDate },
          },
          orderBy: { date: 'asc' },
        })

        const count = entries.length
        const rate = masterRec.rate
        const total = count * rate

        return {
          success: true,
          message: `💰 Зарплата ${masterRec.name}: ${count} смен × ${rate}₽ = ${total}₽. Период: ${formatDateRu(fromDate)} — ${formatDateRu(addDays(toDate, -1))}`,
          data: {
            master: masterRec.name,
            count,
            rate,
            total,
            from: fromDate,
            to: addDays(toDate, -1),
          },
        }
      }

      case 'query': {
        const { what } = action.args
        const w = String(what).toLowerCase().replace(/[\s_-]+/g, '')
        if (w.includes('low')) {
          const low = await db.tobacco.findMany({ where: { active: true }, include: { stock: true } })
          const filtered = low
            .filter((t) => (t.stock?.currentGrams ?? 0) < t.thresholdGrams)
            .map((t) => ({ brand: t.brand, line: t.line, flavor: t.flavor, current: t.stock?.currentGrams ?? 0, threshold: t.thresholdGrams }))
          return { success: true, message: `Найдено ${filtered.length} позиций "мало"`, data: filtered }
        }
        if (w.includes('all') || w.includes('stock') || w.includes('full')) {
          const all = await db.tobacco.findMany({ where: { active: true }, include: { stock: true }, orderBy: [{ brand: 'asc' }, { flavor: 'asc' }] })
          return { success: true, message: `Всего ${all.length} позиций`, data: all.map((t) => ({ brand: t.brand, line: t.line, flavor: t.flavor, current: t.stock?.currentGrams ?? 0 })) }
        }
        if (w.includes('schedule') || w.includes('shift')) {
          const ctx = await buildScheduleContext(master)
          return { success: true, message: 'Контекст графика загружен', data: { scheduleContext: ctx } }
        }
        const low = await db.tobacco.findMany({ where: { active: true }, include: { stock: true } })
        const filtered = low
          .filter((t) => (t.stock?.currentGrams ?? 0) < t.thresholdGrams)
          .map((t) => ({ brand: t.brand, line: t.line, flavor: t.flavor, current: t.stock?.currentGrams ?? 0, threshold: t.thresholdGrams }))
        return { success: true, message: `Показано ${filtered.length} позиций "мало" (fallback)`, data: filtered }
      }

      default:
        return { success: false, message: 'Неизвестное действие' }
    }
  } catch (e) {
    return { success: false, message: `Ошибка: ${(e as Error).message}` }
  }
}

// ───────────────────────────────────────────
// Главная функция обработки сообщения мастера
// ───────────────────────────────────────────
export async function processMasterMessage(
  message: string,
  options?: { source?: 'TEXT' | 'VOICE' | 'PHOTO'; transcribedText?: string; invoiceItems?: AIResult['invoiceItems']; masterId?: string },
): Promise<AIResult> {
  let master: SessionMaster | null = null

  if (options?.masterId) {
    const m = await db.master.findFirst({ where: { id: options.masterId, active: true } })
    if (m) {
      master = { id: m.id, name: m.name, role: m.role as 'SENIOR' | 'REGULAR', color: m.color }
    }
  } else {
    const { getCurrentMaster } = await import('@/lib/auth')
    master = await getCurrentMaster()
  }

  if (!master) {
    return { reply: '⚠️ Вы не авторизованы. Войдите по PIN.', actions: [], executedActions: [] }
  }

  const [stockContext, scheduleContext, consumablesContext] = await Promise.all([
    buildStockContext(),
    buildScheduleContext(master),
    buildConsumablesContext(),
  ])
  const systemPrompt = buildSystemPrompt(stockContext, master, scheduleContext, consumablesContext)

  let userContent = message
  if (options?.transcribedText && options.source === 'VOICE') {
    userContent = `[ГОЛОСОВОЕ СООБЩЕНИЕ, расшифровано]: ${options.transcribedText}`
  }
  if (options?.invoiceItems && options.invoiceItems.length > 0) {
    const itemsStr = options.invoiceItems
      .map((i) => `- ${i.brand} / ${i.line} / ${i.flavor} — ${i.grams}г`)
      .join('\n')
    userContent = `[РАСПОЗНАНО ИЗ НАКЛАДНОЙ]:\n${itemsStr}\n\nДействие мастера: ${message || 'оформи приход'}`
  }

  const content = await hfChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ])

  const { actions, reply } = parseAIResponse(content)

  const executedActions: Array<{ tool: string; success: boolean; message: string; data?: unknown }> = []
  for (const action of actions) {
    const result = await executeAction(action, master)
    executedActions.push({ tool: action.tool, ...result })
  }

  await db.chatMessage.create({
    data: { role: 'USER', content: userContent, masterId: master.id },
  })
  await db.chatMessage.create({
    data: {
      role: 'ASSISTANT',
      content: reply,
      toolName: executedActions.length > 0 ? executedActions.map((a) => a.tool).join(',') : null,
      toolResult: JSON.stringify(executedActions),
      masterId: master.id,
    },
  })

  return {
    reply,
    actions,
    executedActions,
    transcribedText: options?.transcribedText,
    invoiceItems: options?.invoiceItems,
  }
}

// ───────────────────────────────────────────
// Распознавание накладной через HF Vision
// ───────────────────────────────────────────
export async function recognizeInvoice(imageBase64: string): Promise<Array<{ brand: string; line: string; flavor: string; grams: number }>> {
  const prompt = `Ты распознаёшь накладную на кальянный табак. Найди ВСЕ позиции табака на изображении.
Для каждой позиции верни: brand (бренд/производитель), line (линейка, если есть), flavor (вкус), grams (вес в граммах одной банки/упаковки).

Верни СТРОГО JSON массив без markdown:
[
  { "brand": "Darkside", "line": "Supernova", "flavor": "Ice Grape", "grams": 250 }
]`

  const isDataUrl = imageBase64.startsWith('data:')
  const base64Data = isDataUrl ? imageBase64.split(',')[1] : imageBase64
  const mimeType = imageBase64.match(/data:(image\/[\w+]+);/)?.[1] || 'image/jpeg'

  const content = await hfChat(
    [
      { role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
      ] },
    ],
    { vision: true, maxTokens: 1000 },
  )

  let cleaned = content.trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  if (jsonMatch) cleaned = jsonMatch[0]

  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (i: { brand?: string; flavor?: string; grams?: number }) => i.brand && i.flavor && i.grams,
      )
    }
    return []
  } catch {
    return []
  }
}

// ───────────────────────────────────────────
// Транскрипция голоса через Groq Whisper
// ───────────────────────────────────────────
export async function transcribeAudio(audioBase64: string): Promise<string> {
  const groqKey = getGroqKey()
  if (!groqKey) {
    throw new Error('Распознавание голоса недоступно: GROQ_API_KEY не задан')
  }

  let mimeType = 'audio/wav'
  if (audioBase64.startsWith('data:')) {
    const match = audioBase64.match(/^data:(audio\/[\w+.-]+);/)
    if (match) {
      mimeType = match[1]
      audioBase64 = audioBase64.split(',')[1]
    }
  } else {
    try {
      const head = Buffer.from(audioBase64.slice(0, 8), 'base64').toString('ascii')
      if (head.startsWith('OggS')) mimeType = 'audio/ogg'
    } catch {}
  }

  const audioBuffer = Buffer.from(audioBase64, 'base64')

  const formData = new FormData()
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('webm') ? 'webm' : 'wav'
  formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`)
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'ru')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
    },
    body: formData,
  })

  const data = (await res.json()) as { text?: string; error?: { message?: string } }
  if (!res.ok || data.error) {
    throw new Error(`Whisper: ${data.error?.message || res.status}`)
  }
  return (data.text || '').trim()
}
