import { db } from '@/lib/db'
import type { SessionMaster } from '@/lib/auth'
import { pushToSeniors } from '@/lib/notify'
import { parseDateFromText, startOfDay, formatDateRu, addDays } from '@/lib/datetime-utils'

// ───────────────────────────────────────────
// Hugging Face Router (OpenAI-compatible)
// Бесплатные модели: Qwen/Qwen3.8-27B (LLM), inclusionAI/Ling-3.0-flash-VL (Vision)
// ───────────────────────────────────────────
const HF_API = 'https://router.huggingface.co/v1/chat/completions'
const LLM_MODEL = process.env.HF_LLM_MODEL || 'Qwen/Qwen3.8-27B'
const LLM_PROVIDER = process.env.HF_LLM_PROVIDER || 'ovhcloud'
const VISION_MODEL = process.env.HF_VISION_MODEL || 'inclusionAI/Ling-3.0-flash-VL'
const VISION_PROVIDER = process.env.HF_VISION_PROVIDER || 'novita'

function getHfToken(): string {
  const t = process.env.HF_TOKEN
  if (!t) throw new Error('HF_TOKEN не задан в переменных окружения')
  return t
}

interface HFChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
}

interface HFChatResponse {
  choices?: Array<{
    message?: { content?: string; reasoning?: string }
    finish_reason?: string
  }>
  error?: { message: string }
}

async function hfChat(messages: HFChatMessage[], opts: { vision?: boolean; maxTokens?: number } = {}): Promise<string> {
  const model = opts.vision ? VISION_MODEL : LLM_MODEL
  const provider = opts.vision ? VISION_PROVIDER : LLM_PROVIDER

  const body: Record<string, unknown> = {
    model,
    provider,
    messages,
    max_tokens: opts.maxTokens ?? 3000,
  }

  const res = await fetch(HF_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getHfToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as HFChatResponse
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HF API ${res.status}`)
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  // Qwen3.8 возвращает reasoning вместо content для reasoning-моделей
  if (!content && data.choices?.[0]?.message?.reasoning) {
    return data.choices[0].message.reasoning
  }
  return content
}

// Типы для результата работы AI
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
  | { tool: 'update_consumable'; args: { name: string; qty: number; note?: string } }
  | { tool: 'create_consumable_request'; args: { name: string; qty?: number } }
  | { tool: 'query'; args: { what: 'low_stock' | 'all_stock' | 'specific' | 'shift'; brand?: string; line?: string; flavor?: string } }

export interface AIResult {
  reply: string
  actions: AIAction[]
  executedActions: Array<{ tool: string; success: boolean; message: string; data?: unknown }>
  transcribedText?: string
  invoiceItems?: Array<{ brand: string; line: string; flavor: string; grams: number }>
}

// Системный промпт для ассистента (с учётом роли мастера)
function buildSystemPrompt(stockContext: string, master: SessionMaster, shiftContext: string, consumablesContext: string): string {
  const isSenior = master.role === 'SENIOR'
  const roleDesc = isSenior
    ? 'Старший кальянный мастер. Полный доступ: учёт табака, приход, заявки, управление графиком.'
    : 'Обычный кальянный мастер. Отмечаешь остатки, подаёшь заявки на закуп и хотелки. НЕ оформляешь приход и не создаёшь новые позиции в справочнике — это делает старший.'

  const allowedTools = isSenior
    ? `1. update_stock — установить точный остаток табака
2. add_incoming — добавить приход (накладная/партия, прибавить граммы)
3. add_tobacco — добавить НОВУЮ позицию в справочник
4. create_order — создать заявку на закуп конкретного табака (по граммам)
5. create_request — заявка на закуп свободной формы ("BlackBurn Energy 2 банки")
6. create_wish — хотелка/пожелание
7. update_schedule — редактировать график мастера: action="add" или "remove". masterName (имя мастера, fuzzy), dateText ("завтра", "пятница", "23 числа"). Примеры: "поставь Марата на завтра" → action=add, masterName="Марат", dateText="завтра". "убери Марата с пятницы" → action=remove, masterName="Марат", dateText="пятница".
8. add_schedule_multi — поставить НЕСКОЛЬКО мастеров на один день. masterNames: массив имён, dateText. Пример: "поставь Марата и Айрата на завтра" → masterNames=["Марат","Айрат"], dateText="завтра".
9. calc_salary — посчитать зарплату мастера за период. masterName (имя), dateText (опционально, по умолчанию текущий месяц). Примеры: "зарплата Марата за сентябрь" → masterName="Марат", dateText="сентябрь". "зарплата Айрата" → masterName="Айрат" (текущий месяц).
10. update_consumable — обновить точный остаток расходника (угли, мундштуки, фольга). name (имя расходника из контекста), qty (точное количество, число). Пример: "закончились угли cocourth" → name="Угли Cocourth 26мм", qty=0. "осталось 3 упаковки мундштуков" → name="Мундштуки", qty=3.
11. create_consumable_request — создать заявку на закуп расходника. name (имя расходника), qty (опционально, сколько закупить). Пример: "закажи мундштуки" → name="Мундштуки", qty=не указано.
12. query — low_stock (что мало), all_stock (все остатки), shift (кто сегодня по графику)`
    : `1. update_stock — отметить остаток табака (обычно когда "закончился" = 0, "мало осталось" = мало). Это списывает остаток и пушит старшему.
2. create_request — заявка на закуп свободной формы ("BlackBurn Energy 2 банки")
3. create_wish — хотелка/пожелание
4. update_consumable — отметить остаток расходника (угли, мундштуки, фольга). name (из контекста расходников), qty (точное число). "закончились угли" → qty=0.
5. create_consumable_request — создать заявку на закуп расходника. name (из контекста), qty (опционально).
6. query — low_stock (что мало), all_stock (все остатки), shift (кто сегодня по графику)
НЕ используй add_incoming, add_tobacco, create_order, update_schedule, add_schedule_multi, calc_salary — это для старшего мастера.`

  return `Ты — умный ассистент кальянной. Сейчас с тобой работает: ${master.name} (${roleDesc}).

КОНТЕКСТ — текущие остатки склада:
${stockContext}

ПОРОГ «МАЛО»: по умолчанию 70 грамм. Если остаток ниже порога — позиция идёт в заявку.

КОНТЕКСТ — расходники (угли, мундштуки, фольга и т.д.):
${consumablesContext}

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
- "что на смене?" / "кто сегодня работает?" / "кто на смене?" → query shift
- "поставь МАРТА на ЗАВТРА" → update_schedule action=add
- "убери МАРТА с ПЯТНИЦЫ" → update_schedule action=remove
- "поставь Марата и Айрата на завтра" → add_schedule_multi masterNames=["Марат","Айрат"], dateText="завтра"
- "зарплата Марата за сентябрь" → calc_salary masterName="Марат", dateText="сентябрь"
- "зарплата Айрата" → calc_salary masterName="Айрат" (текущий месяц)
- "закончились угли" / "кончились мундштуки" → update_consumable qty=0 + create_consumable_request
- "мало мундштуков" / "мало углей" → update_consumable с qty из контекста (если известен) и create_consumable_request
- "осталось N упаковок углей" → update_consumable name="..." qty=N
- "закажи угли" / "закажи мундштуки" → create_consumable_request (если расходник есть в контексте) иначе create_request

СТРУКТУРА ТАБАКА — ВАЖНО! У каждого табака 3 поля:
- brand — бренд/производитель (Darkside, Tangiers, Musthave, Daily Hookah, Burn, BlackBurn)
- line — линейка/серия (Core, Supernova, Rare, Base, Original, Lucid, Medium)
- flavor — вкус (Ice Grape, Cola, Energy, Watermelon Mint, Cane Mint, Pineapple)

ПРИМЕРЫ правильного разделения:
- "дарксайд кора кола" → brand=Darkside, line=Core, flavor=Cola
- "дарксайд супнова айс грейп" → brand=Darkside, line=Supernova, flavor=Ice Grape
- "танжерс лучид кейн мята" → brand=Tangiers, line=Lucid, flavor=Cane Mint
- "мустхейв оригинал бласт" → brand=Musthave, line=Original, flavor=Blast
- "дейли хука бейз грейпфрут" → brand=Daily Hookah, line=Base, flavor=Grapefruit
- "блэкберн" → brand=BlackBurn, line=, flavor= (нужно уточнить линейку и вкус)
- "дарксайд супнова" без вкуса → уточни вкус! Supernova — это линейка, не вкус.

Если мастер сказал только бренд или только часть названия — УТОЧНИ что именно нужно:
- "дарксайд" → "Какой вкус? У нас есть Darkside Core (Cola, Medium, Pineapple) и Darkside Supernova (Ice Grape, Cola)"
- "танж" → "Какой именно? Tangiers Lucid (Cane Mint, ...) — уточни вкус"

ВАЖНО:
- update_stock УСТАНАВЛИВАЕТ остаток (абсолют), add_incoming — ПРИБАВЛЯЕТ к текущему
- Если мастер сообщает об остатке голосом/текстом → update_stock
- Используй fuzzy matching: "дарксайд супнова" = Darkside Supernova, "танж" = Tangiers
- **АВТО-ДОБАВЛЕНИЕ НОВЫХ ПОЗИЦИЙ**: Если мастер (старший) оформляет приход по накладной
  и табака НЕТ в базе — НЕ отвечай "не найден". Вместо этого:
  1. Сначала вызови add_tobacco с брендом/линейкой/вкусом из накладной
  2. Потом вызови add_incoming для этой позиции
  Делай так ДЛЯ КАЖДОЙ позиции из накладной, которой нет в базе.
- Если обычный мастер сообщает о табаке, которого нет в базе — скажи что нужно попросить старшего добавить.
- Когда обычный мастер отмечает "закончился" (0г) или остаток стал ниже порога — это важно, старший получит автоматический пуш.
- Когда обычный мастер отмечает расходник как закончился/мало — старший получает пуш автоматически.
- Отвечай кратко, по делу, по-человечески, можно с эмодзи. Обращайся к мастеру по имени.
- ВАЖНО: отвечай ТОЛЬКО на русском языке.

ПРИ ОБРАБОТКЕ НАКЛАДНОЙ (PDF или фото):
- Распознай все позиции табака
- Для каждой позиции определи brand, line, flavor, grams (вес одной банки)
- Если в накладной N банок одного вкуса — общий вес = N × grams
- Для КАЖДОЙ позиции вызови add_incoming с правильным количеством граммов
- Если позиции нет в базе и мастер — старший → add_tobacco + add_incoming
- В reply перечисли что было добавлено и итоговый приход по каждой позиции

ФОРМАТ ОТВЕТА — СТРОГО JSON (без markdown, без пояснений, без рассуждений):
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

// Fuzzy поиск расходника по имени
async function findConsumable(name: string) {
  const all = await db.consumable.findMany({ where: { active: true } })
  const norm = (s: string) => s.toLowerCase().trim()
  const target = norm(name)
  if (!target) return null

  // 1) Точное совпадение
  let match = all.find((c) => norm(c.name) === target)
  if (match) return match

  // 2) Includes — расходник в имени запроса или наоборот
  match = all.find(
    (c) => norm(c.name).includes(target) || target.includes(norm(c.name)),
  )
  if (match) return match

  // 3) Первые 5+ символов совпадают (для длинных имён)
  if (target.length >= 5) {
    match = all.find((c) =>
      c.name.length >= 5 && norm(c.name).slice(0, 5) === target.slice(0, 5),
    )
    if (match) return match
  }

  return null
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

// Контекст расходников для промпта
async function buildConsumablesContext(): Promise<string> {
  const items = await db.consumable.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })
  if (items.length === 0) return '(расходников пока нет)'
  const lines = items.map((c) => {
    const status = c.currentQty < c.threshold ? ' ⚠️ МАЛО' : ''
    return `- ${c.name} | остаток=${c.currentQty} ${c.unit} | порог=${c.threshold}${status}`
  })
  return lines.join('\n')
}

// Контекст смены для промпта — теперь строится по графику (ScheduleEntry)
// ВАЖНО: система смен удалена (redesign-7). Сводка по графику.
async function buildShiftContext(master: SessionMaster): Promise<string> {
  const todayStart = startOfDay(new Date())
  const todayEnd = addDays(todayStart, 1)

  const todayEntries = await db.scheduleEntry.findMany({
    where: { date: { gte: todayStart, lt: todayEnd } },
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

  // Недавние операции по остаткам за сегодня
  const recentOps: string[] = []
  if (todayEntries.length > 0) {
    const ops = await db.operation.findMany({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
        type: 'ADJUSTMENT',
      },
      include: { tobacco: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    })

    for (const op of ops) {
      const time = new Date(op.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      const t = op.tobacco
      recentOps.push(`  [${time}] ${t.brand} ${t.line} ${t.flavor}: ${op.gramsBefore}г → ${op.gramsAfter}г${op.note ? ` (${op.note})` : ''}`)
    }
  }

  const lines: string[] = []
  lines.push('ГРАФИК СЕГОДНЯ:')
  if (todayEntries.length === 0) {
    lines.push('(никого не запланировано на сегодня)')
  } else {
    for (const e of todayEntries) {
      const mine = e.masterId === master.id ? ' (ты)' : ''
      lines.push(`- ${e.master.name}${mine}${e.note ? ` · ${e.note}` : ''}`)
    }
  }

  if (recentOps.length > 0) {
    lines.push('\nНЕДАВНИЕ ОПЕРАЦИИ ПО ОСТАТКАМ (за сегодня):')
    lines.push(...recentOps)
  }

  if (activeRequests.length > 0) {
    lines.push('\nАКТИВНЫЕ ЗАЯВКИ МАСТЕРОВ:')
    for (const r of activeRequests) {
      lines.push(`- ${r.master.name}: "${r.text}"${r.grams ? ` (${r.grams}г)` : ''}`)
    }
  }

  if (pendingWishes.length > 0) {
    lines.push('\nХОТЕЛКИ МАСТЕРОВ:')
    for (const w of pendingWishes) {
      lines.push(`- ${w.master.name}: "${w.text}"`)
    }
  }

  return lines.join('\n')
}

// Парсинг JSON из ответа LLM (с защитой от markdown обёртки и reasoning)
function parseAIResponse(content: string): { actions: AIAction[]; reply: string } {
  let cleaned = content.trim()

  // Убираем markdown обёртку ```json ... ```
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim()
  }

  // Ищем JSON объект в тексте (модели иногда добавляют рассуждения до/после)
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
          // Push в Telegram старшему
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

        // Fuzzy поиск мастера по имени
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
          // Удаляем ВСЕ записи этого мастера на эту дату
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

        // action === 'add' — просто создаём новую запись
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

        // Fuzzy поиск мастера по имени
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
          // Пытаемся распознать как месяц (например, "сентябрь")
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
            // Если "сегодня"/"завтра" — берём этот день
            fromDate = startOfDay(parsed)
            toDate = addDays(fromDate, 1)
          }
        } else {
          // Текущий месяц
          fromDate = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1))
          toDate = addDays(startOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)), 1)
        }

        // Считаем запланированные смены мастера в диапазоне (ScheduleEntry)
        const entries = await db.scheduleEntry.findMany({
          where: {
            masterId: masterRec.id,
            date: { gte: fromDate, lt: toDate },
          },
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
        if (w.includes('shift')) {
          const shiftContext = await buildShiftContext(master)
          return { success: true, message: 'Контекст графика загружен', data: { shiftContext } }
        }
        const low = await db.tobacco.findMany({ where: { active: true }, include: { stock: true } })
        const filtered = low
          .filter((t) => (t.stock?.currentGrams ?? 0) < t.thresholdGrams)
          .map((t) => ({ brand: t.brand, line: t.line, flavor: t.flavor, current: t.stock?.currentGrams ?? 0, threshold: t.thresholdGrams }))
        return { success: true, message: `Показано ${filtered.length} позиций "мало" (fallback)`, data: filtered }
      }

      case 'update_consumable': {
        const { name, qty, note } = action.args
        const consumable = await findConsumable(name)
        if (!consumable) {
          return { success: false, message: `Расходник "${name}" не найден в базе` }
        }
        const before = consumable.currentQty
        const newQty = Math.max(0, Math.min(100000, qty))
        await db.consumable.update({
          where: { id: consumable.id },
          data: { currentQty: newQty },
        })
        const isLow = newQty < consumable.threshold
        // Пуш старшему если обычный мастер отмечает «мало/закончился»
        if (master.role !== 'SENIOR' && (newQty === 0 || isLow)) {
          const reason = newQty === 0 ? 'закончился' : `мало осталось (${newQty} ${consumable.unit})`
          const notifMsg = `📦 ${master.name} отметил: ${reason} — ${consumable.name}`
          await db.notification.create({
            data: {
              type: 'LOW_STOCK',
              message: notifMsg,
              masterId: master.id,
            },
          })
          await pushToSeniors(notifMsg)
        }
        return {
          success: true,
          message: `${consumable.name}: ${before} ${consumable.unit} → ${newQty} ${consumable.unit}${note ? ` (${note})` : ''}`,
          data: { before, after: newQty, consumableId: consumable.id, unit: consumable.unit },
        }
      }

      case 'create_consumable_request': {
        const { name, qty } = action.args
        const consumable = await findConsumable(name)
        const unit = consumable?.unit ?? 'шт'
        const text = consumable
          ? `${consumable.name} — ${qty ?? 1} ${unit}`
          : `${name} — ${qty ?? 1} ${unit}`
        const request = await db.masterRequest.create({
          data: { masterId: master.id, text },
        })
        if (master.role !== 'SENIOR') {
          const notifMsg = `📋 ${master.name}: заявка на расходник — "${text}"`
          await db.notification.create({
            data: { type: 'REQUEST', message: notifMsg, masterId: master.id },
          })
          await pushToSeniors(notifMsg)
        }
        return { success: true, message: `Заявка принята: "${text}"`, data: { requestId: request.id } }
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

  const stockContext = await buildStockContext()
  const shiftContext = await buildShiftContext(master)
  const consumablesContext = await buildConsumablesContext()
  const systemPrompt = buildSystemPrompt(stockContext, master, shiftContext, consumablesContext)

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
// Распознавание накладной через HF Vision (Ling-3.0-flash-VL)
// ВНИМАНИЕ: Vision-модель может нестабильно работать через HF router.
// Если будет ошибка — пользователю вернётся сообщение.
// ───────────────────────────────────────────
export async function recognizeInvoice(imageBase64: string): Promise<Array<{ brand: string; line: string; flavor: string; grams: number }>> {
  const prompt = `Ты распознаёшь накладную на кальянный табак. Найди ВСЕ позиции табака на изображении.
Для каждой позиции верни: brand (бренд/производитель), line (линейка, если есть), flavor (вкус), grams (вес в граммах одной банки/упаковки).
Если вес указан в граммах — верни число. Если в банках/штуках — верни вес одной банки.

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
// Транскрипция голоса через HF Whisper Large V3 Turbo (бесплатно)
// ───────────────────────────────────────────
const WHISPER_API = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo'

export async function transcribeAudio(audioBase64: string): Promise<string> {
  const token = getHfToken()

  // Определяем формат аудио (Telegram присылает OGG/Opus)
  let mimeType = 'audio/wav'
  if (audioBase64.startsWith('data:')) {
    const match = audioBase64.match(/^data:(audio\/[\w+.-]+);/)
    if (match) {
      mimeType = match[1]
      audioBase64 = audioBase64.split(',')[1]
    }
  } else {
    // Telegram OGG начинается с байтов 'OggS'
    try {
      const head = Buffer.from(audioBase64.slice(0, 8), 'base64').toString('ascii')
      if (head.startsWith('OggS')) mimeType = 'audio/ogg'
    } catch {}
  }

  const audioBuffer = Buffer.from(audioBase64, 'base64')

  const res = await fetch(WHISPER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: audioBuffer,
  })

  const data = (await res.json()) as { text?: string; error?: { message?: string } }
  if (!res.ok || data.error) {
    throw new Error(`Whisper: ${data.error?.message || res.status}`)
  }
  return (data.text || '').trim()
}
