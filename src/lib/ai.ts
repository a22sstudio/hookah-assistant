import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import type { SessionMaster } from '@/lib/auth'

// Singleton для ZAI клиента
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

export async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// Типы для результата работы AI
export type AIAction =
  | { tool: 'update_stock'; args: { brand: string; line: string; flavor: string; grams: number; note?: string } }
  | { tool: 'add_incoming'; args: { brand: string; line: string; flavor: string; grams: number; note?: string } }
  | { tool: 'add_tobacco'; args: { brand: string; line: string; flavor: string; defaultJarGrams?: number } }
  | { tool: 'create_order'; args: { brand: string; line: string; flavor: string; grams: number; note?: string } }
  | { tool: 'create_request'; args: { text: string; grams?: number } }
  | { tool: 'create_wish'; args: { text: string } }
  | { tool: 'query'; args: { what: 'low_stock' | 'all_stock' | 'specific' | 'shift'; brand?: string; line?: string; flavor?: string } }

export interface AIResult {
  reply: string
  actions: AIAction[]
  executedActions: Array<{ tool: string; success: boolean; message: string; data?: unknown }>
  transcribedText?: string
  invoiceItems?: Array<{ brand: string; line: string; flavor: string; grams: number }>
}

// Системный промпт для ассистента (с учётом роли мастера)
function buildSystemPrompt(stockContext: string, master: SessionMaster, shiftContext: string): string {
  const isSenior = master.role === 'SENIOR'
  const roleDesc = isSenior
    ? 'Старший кальянный мастер. Полный доступ: учёт табака, приход, заявки, управление сменой.'
    : 'Обычный кальянный мастер. Отмечаешь остатки, подаёшь заявки на закуп и хотелки. НЕ оформляешь приход и не создаёшь новые позиции в справочнике — это делает старший.'

  const allowedTools = isSenior
    ? `1. update_stock — установить точный остаток табака
2. add_incoming — добавить приход (накладная/партия, прибавить граммы)
3. add_tobacco — добавить НОВУЮ позицию в справочник
4. create_order — создать заявку на закуп конкретного табака (по граммам)
5. create_request — заявка на закуп свободной формы ("BlackBurn Energy 2 банки")
6. create_wish — хотелка/пожелание
7. query — low_stock (что мало), all_stock (все остатки), shift (кто на смене и активные заявки)`
    : `1. update_stock — отметить остаток табака (обычно когда "закончился" = 0, "мало осталось" = мало). Это списывает остаток и пушит старшему.
2. create_request — заявка на закуп свободной формы ("BlackBurn Energy 2 банки")
3. create_wish — хотелка/пожелание
4. query — low_stock (что мало), all_stock (все остатки), shift (кто на смене)
НЕ используй add_incoming, add_tobacco, create_order — это для старшего мастера.`

  return `Ты — умный ассистент кальянной. Сейчас с тобой работает: ${master.name} (${roleDesc}).

КОНТЕКСТ — текущие остатки склада:
${stockContext}

ПОРОГ «МАЛО»: по умолчанию 70 грамм. Если остаток ниже порога — позиция идёт в заявку.

${shiftContext}

ЧТО ТЫ УМЕЕШЬ (вызывай через actions):
${allowedTools}

ПРАВИЛА ПОНИМАНИЯ РЕЧИ МАСТЕРА:
- "пол банки" → grams = defaultJarGrams / 2 (если банка 250г, то 125г)
- "треть банки" → grams = defaultJarGrams / 3
- "четверть" → grams = defaultJarGrams / 4
- "почти пусто" / "на донышке" → grams = 20
- "пусто" / "кончился" / "всё" → grams = 0
- "осталось X грамм" → grams = X (точное значение)
- "пришла накладная, N банок по M грамм" → add_incoming с grams = N * M (только старший)
- "закажи X" → create_order (старший) или create_request (обычный)
- "хочу X" / "было бы круто X" → create_wish
- "чего мало?" / "что заказать?" → query low_stock
- "покажи остатки" → query all_stock
- "что на смене?" / "как смена?" / "кто работает?" → query shift

ВАЖНО:
- update_stock УСТАНАВЛИВАЕТ остаток (абсолют), add_incoming — ПРИБАВЛЯЕТ к текущему
- Если мастер сообщает об остатке голосом/текстом → update_stock
- Используй fuzzy matching: "дарксайд супнова" = Darkside Supernova, "танж" = Tangiers
- Если табака нет в базе и мастер — старший, сначала add_tobacco, потом работай с ним. Если обычный — скажи что нужно попросить старшего добавить.
- Когда обычный мастер отмечает "закончился" (0г) или остаток стал ниже порога — это важно, старший получит автоматический пуш.
- Отвечай кратко, по делу, по-человечески, можно с эмодзи. Обращайся к мастеру по имени.

ФОРМАТ ОТВЕТА — СТРОГО JSON (без markdown, без пояснений):
{
  "actions": [
    { "tool": "update_stock", "args": { "brand": "Darkside", "line": "Supernova", "flavor": "Ice Grape", "grams": 125, "note": "пол банки" } }
  ],
  "reply": "✓ Записал: Darkside Supernova Ice Grape = 125г (пол банки)"
}

Если запрос мастера — просто вопрос или диалог без действия, верни пустой actions и reply с ответом.
Если нужно несколько действий — положи все в массив actions.`
}

// Fuzzy поиск табака в базе по названию
async function findTobacco(brand: string, line: string, flavor: string) {
  const all = await db.tobacco.findMany({ where: { active: true }, include: { stock: true } })

  const normalize = (s: string) => s.toLowerCase().trim()
  const b = normalize(brand)
  const l = normalize(line)
  const f = normalize(flavor)

  // 1. Точное совпадение по всем трём
  let match = all.find(
    (t) => normalize(t.brand) === b && normalize(t.line) === l && normalize(t.flavor) === f,
  )
  if (match) return match

  // 2. Совпадение brand + flavor (line любая)
  match = all.find((t) => normalize(t.brand) === b && normalize(t.flavor) === f)
  if (match) return match

  // 3. Совпадение brand + line (flavor пустой или любой)
  if (!flavor) {
    match = all.find((t) => normalize(t.brand) === b && normalize(t.line) === l)
    if (match) return match
  }

  // 4. Partial: flavor содержит слово из flavor или наоборот
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
    const status = grams < t.thresholdGrams ? ' ⚠️ МАЛО' : ''
    return `- ${t.brand} / ${t.line} / ${t.flavor} | банка=${t.defaultJarGrams}г | остаток=${grams}г | порог=${t.thresholdGrams}г${status}`
  })
  return lines.join('\n')
}

// Контекст смены для промпта
async function buildShiftContext(master: SessionMaster): Promise<string> {
  const openShifts = await db.shift.findMany({
    where: { status: 'OPEN' },
    include: { master: true },
    orderBy: { openedAt: 'asc' },
  })

  const activeRequests = await db.masterRequest.findMany({
    where: { status: 'PENDING' },
    include: { master: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const lines: string[] = []
  lines.push('ТЕКУЩАЯ СМЕНА:')
  if (openShifts.length === 0) {
    lines.push('(никого на смене)')
  } else {
    for (const s of openShifts) {
      const hoursAgo = Math.floor((Date.now() - s.openedAt.getTime()) / 3600000)
      const mine = s.masterId === master.id ? ' (ты)' : ''
      lines.push(`- ${s.master.name}${mine} | на смене ${hoursAgo}ч | ${s.hookahCount} кальянов`)
    }
  }

  if (activeRequests.length > 0) {
    lines.push('\nАКТИВНЫЕ ЗАЯВКИ МАСТЕРОВ:')
    for (const r of activeRequests) {
      lines.push(`- ${r.master.name}: ${r.text}`)
    }
  }

  return lines.join('\n')
}

// Парсинг JSON из ответа LLM (с защитой от markdown обёртки)
function parseAIResponse(content: string): { actions: AIAction[]; reply: string } {
  let cleaned = content.trim()

  // Убираем markdown обёртку ```json ... ```
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(cleaned)
    return {
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      reply: typeof parsed.reply === 'string' ? parsed.reply : 'Готово.',
    }
  } catch {
    // Если JSON не распарсился — считаем весь ответ просто текстом
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
        // Авто-нотификация старшему, если обычный мастер отметил «закончился» или стало мало
        if (master.role !== 'SENIOR' && (grams === 0 || grams < tobacco.thresholdGrams)) {
          const reason = grams === 0 ? 'закончился' : `мало осталось (${grams}г)`
          await db.notification.create({
            data: {
              type: 'FINISHED',
              message: `${master.name} отметил: ${reason} ${tobacco.brand} ${tobacco.flavor}`,
              masterId: master.id,
            },
          })
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
        const existing = await db.tobacco.findFirst({
          where: { brand, line, flavor },
        })
        if (existing) {
          return { success: true, message: `Табак уже в базе`, data: { tobaccoId: existing.id } }
        }
        const tobacco = await db.tobacco.create({
          data: { brand, line, flavor, defaultJarGrams, thresholdGrams: 70 },
        })
        await db.stockItem.create({
          data: { tobaccoId: tobacco.id, currentGrams: 0 },
        })
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
          data: {
            tobaccoId: tobacco.id,
            gramsRequested: grams,
            status: 'PENDING',
            note: note ?? null,
          },
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
        // Нотификация старшему (если не сам старший)
        if (master.role !== 'SENIOR') {
          await db.notification.create({
            data: {
              type: 'REQUEST',
              message: `${master.name}: заявка на закуп — "${text}"`,
              masterId: master.id,
            },
          })
        }
        return {
          success: true,
          message: `Заявка принята: "${text}"`,
          data: { requestId: request.id },
        }
      }

      case 'create_wish': {
        const { text } = action.args
        const wish = await db.wish.create({
          data: { masterId: master.id, text },
        })
        if (master.role !== 'SENIOR') {
          await db.notification.create({
            data: {
              type: 'WISH',
              message: `${master.name}: хотелка — "${text}"`,
              masterId: master.id,
            },
          })
        }
        return {
          success: true,
          message: `Хотелка добавлена: "${text}"`,
          data: { wishId: wish.id },
        }
      }

      case 'query': {
        const { what } = action.args
        const w = String(what).toLowerCase().replace(/[\s_-]+/g, '')
        if (w.includes('low')) {
          const low = await db.tobacco.findMany({
            where: { active: true },
            include: { stock: true },
          })
          const filtered = low
            .filter((t) => (t.stock?.currentGrams ?? 0) < t.thresholdGrams)
            .map((t) => ({
              brand: t.brand,
              line: t.line,
              flavor: t.flavor,
              current: t.stock?.currentGrams ?? 0,
              threshold: t.thresholdGrams,
            }))
          return { success: true, message: `Найдено ${filtered.length} позиций "мало"`, data: filtered }
        }
        if (w.includes('all') || w.includes('stock') || w.includes('full')) {
          const all = await db.tobacco.findMany({
            where: { active: true },
            include: { stock: true },
            orderBy: [{ brand: 'asc' }, { flavor: 'asc' }],
          })
          return {
            success: true,
            message: `Всего ${all.length} позиций`,
            data: all.map((t) => ({
              brand: t.brand,
              line: t.line,
              flavor: t.flavor,
              current: t.stock?.currentGrams ?? 0,
            })),
          }
        }
        if (w.includes('shift')) {
          const shiftContext = await buildShiftContext(master)
          return {
            success: true,
            message: 'Контекст смены загружен',
            data: { shiftContext },
          }
        }
        // Fallback — возвращаем low_stock если ничего не подошло
        const low = await db.tobacco.findMany({
          where: { active: true },
          include: { stock: true },
        })
        const filtered = low
          .filter((t) => (t.stock?.currentGrams ?? 0) < t.thresholdGrams)
          .map((t) => ({
            brand: t.brand,
            line: t.line,
            flavor: t.flavor,
            current: t.stock?.currentGrams ?? 0,
            threshold: t.thresholdGrams,
          }))
        return { success: true, message: `Показано ${filtered.length} позиций "мало" (fallback)`, data: filtered }
      }

      default:
        return { success: false, message: 'Неизвестное действие' }
    }
  } catch (e) {
    return { success: false, message: `Ошибка: ${(e as Error).message}` }
  }
}

// Главная функция обработки сообщения мастера
// masterId — опционально: если передан (например ботом), используется напрямую вместо cookie-сессии
export async function processMasterMessage(
  message: string,
  options?: { source?: 'TEXT' | 'VOICE' | 'PHOTO'; transcribedText?: string; invoiceItems?: AIResult['invoiceItems']; masterId?: string },
): Promise<AIResult> {
  let master: SessionMaster | null = null

  if (options?.masterId) {
    // Прямой вызов от бота — ищем мастера по ID (db уже импортирован вверху файла)
    const m = await db.master.findFirst({ where: { id: options.masterId, active: true } })
    if (m) {
      master = { id: m.id, name: m.name, role: m.role as 'SENIOR' | 'REGULAR', color: m.color }
    }
  } else {
    // Веб-вызов — из cookie-сессии
    const { getCurrentMaster } = await import('@/lib/auth')
    master = await getCurrentMaster()
  }

  if (!master) {
    return {
      reply: '⚠️ Вы не авторизованы. Войдите по PIN.',
      actions: [],
      executedActions: [],
    }
  }

  const zai = await getZAI()
  const stockContext = await buildStockContext()
  const shiftContext = await buildShiftContext(master)
  const systemPrompt = buildSystemPrompt(stockContext, master, shiftContext)

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

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    thinking: { type: 'disabled' },
  })

  const content = completion.choices[0]?.message?.content ?? ''
  const { actions, reply } = parseAIResponse(content)

  const executedActions = []
  for (const action of actions) {
    const result = await executeAction(action, master)
    executedActions.push({ tool: action.tool, ...result })
  }

  // Сохраняем в историю чата
  await db.chatMessage.create({
    data: {
      role: 'USER',
      content: userContent,
      masterId: master.id,
    },
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

// Распознавание накладной через VLM
export async function recognizeInvoice(imageBase64: string): Promise<Array<{ brand: string; line: string; flavor: string; grams: number }>> {
  const zai = await getZAI()

  const prompt = `Ты распознаёшь накладную на кальянный табак. Найди ВСЕ позиции табака на изображении.
Для каждой позиции верни: brand (бренд/производитель), line (линейка, если есть), flavor (вкус), grams (вес в граммах одной банки/упаковки).
Если вес указан в граммах — верни число. Если в банках/штуках — верни вес одной банки.

Верни СТРОГО JSON массив без markdown:
[
  { "brand": "Darkside", "line": "Supernova", "flavor": "Ice Grape", "grams": 250 }
]`

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` },
          },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  })

  const content = response.choices[0]?.message?.content ?? ''
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

// Транскрипция голоса через ASR
export async function transcribeAudio(audioBase64: string): Promise<string> {
  const zai = await getZAI()
  const response = await zai.audio.asr.create({
    file_base64: audioBase64,
  })
  return response.text ?? ''
}
