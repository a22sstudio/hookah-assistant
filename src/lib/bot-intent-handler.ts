import 'server-only'
import { db } from '@/lib/db'
import { parseIntent, parseMultiLine, ParsedAction } from '@/lib/intent-parser'
import { isConfirmation, detectOperation } from '@/lib/verb-detector'
import { pushToSeniors } from '@/lib/notify'

// ───────────────────────────────────────────
// Обработчик intent parser с поддержкой сессий.
// ВАЖНО: "да"/"нет"/числа/глаголы НИКОГДА не идут в LLM.
// Сессии хранятся в памяти (Map) — не зависят от БД.
// ───────────────────────────────────────────

export interface IntentResult {
  handled: boolean
  reply: string
  executedCount: number
}

interface PendingAction {
  type: 'suggest' | 'ambiguous' | 'no_verb' | 'no_quantity'
  tobacco?: { id: string; brand: string; line: string; flavor: string; defaultJarGrams: number }
  options?: Array<{ id: string; brand: string; line: string; flavor: string }>
  grams?: number | null
  actionType?: 'add_incoming' | 'spend' | 'set_stock'
  raw: string
}

// In-memory кэш сессий (masterId → PendingAction)
// TTL 5 минут, потом автоматически очищается
const sessions = new Map<string, { pending: PendingAction; expiresAt: number }>()
const SESSION_TTL = 5 * 60 * 1000 // 5 минут

function getSession(masterId: string): PendingAction | null {
  const entry = sessions.get(masterId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    sessions.delete(masterId)
    return null
  }
  return entry.pending
}

function setSession(masterId: string, pending: PendingAction): void {
  sessions.set(masterId, { pending, expiresAt: Date.now() + SESSION_TTL })
}

function clearSession(masterId: string): void {
  sessions.delete(masterId)
}

// Очистка истёкших сессий (раз в минуту)
let lastCleanup = 0
function cleanupExpired(): void {
  if (Date.now() - lastCleanup < 60_000) return
  lastCleanup = Date.now()
  for (const [key, val] of sessions) {
    if (Date.now() > val.expiresAt) sessions.delete(key)
  }
}

export async function tryHandleWithParser(
  text: string,
  masterId: string,
): Promise<IntentResult> {
  cleanupExpired()
  
  const confirmation = isConfirmation(text)
  const pending = getSession(masterId)
  
  // ─── Если есть pending и это подтверждение ───
  if (pending && confirmation !== null) {
    clearSession(masterId)
    return await handleConfirmation(pending, confirmation, masterId)
  }
  
  // ─── Если есть pending типа no_verb и reply — это глагол ───
  // Бот спросил «добавить, списать или остаток?» → мастер пишет «добавить»
  if (pending && pending.type === 'no_verb' && confirmation === null) {
    const { type } = detectOperation(text)
    if (type === 'add_incoming' || type === 'spend' || type === 'set_stock') {
      // Мастер ответил глаголом! Объединяем с pending табаком
      clearSession(masterId)
      
      if (pending.tobacco && pending.grams !== null && pending.grams !== undefined) {
        const action: ParsedAction = {
          type,
          tobacco: pending.tobacco,
          grams: pending.grams,
          raw: pending.raw + ' → ' + text,
        }
        const r = await executeAction(action, masterId)
        return { handled: true, reply: r, executedCount: 1 }
      }
      
      // Если grams не было — спрашиваем
      if (pending.tobacco) {
        const newPending: PendingAction = {
          type: 'no_quantity',
          tobacco: pending.tobacco,
          actionType: type,
          raw: pending.raw,
        }
        setSession(masterId, newPending)
        return { handled: true, reply: `Сколько грамм для ${pending.tobacco.brand} ${pending.tobacco.flavor}?`, executedCount: 0 }
      }
    }
  }
  
  // ─── Если есть pending типа no_quantity и reply — это число ───
  // Бот спросил «Сколько грамм?» → мастер пишет «25»
  if (pending && pending.type === 'no_quantity' && typeof confirmation === 'number') {
    clearSession(masterId)
    
    if (pending.tobacco) {
      const action: ParsedAction = {
        type: pending.actionType || 'set_stock',
        tobacco: pending.tobacco,
        grams: confirmation,
        raw: pending.raw,
      }
      const r = await executeAction(action, masterId)
      return { handled: true, reply: r, executedCount: 1 }
    }
  }
  
  // ─── Подтверждение без pending — "да" без контекста ───
  if (confirmation !== null && !pending) {
    return {
      handled: true,
      reply: '❓ Я тебя ни о чём не спрашивал. Напиши команду, например:\n• «принял blackburn ёлка 25»\n• «минус 30 банан»\n• «обнови остаток дарксайд кола 125»\n• «чё мало»',
      executedCount: 0,
    }
  }
  
  // ─── Не подтверждение и не verb reply — очищаем stale pending ───
  if (pending) {
    clearSession(masterId)
  }
  
  // ─── Обычный парсинг ───
  // Если многострочный текст → parseMultiLine
  const actions = text.includes('\n')
    ? await parseMultiLine(text)
    : await parseIntent(text)
  
  if (actions.length === 0) {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  const first = actions[0]
  
  // Unknown с подсказкой
  if (first.type === 'unknown' && first.message) {
    return { handled: true, reply: first.message, executedCount: 0 }
  }
  
  // Query
  if (first.type === 'query') {
    const reply = await handleQuery(text)
    return { handled: true, reply, executedCount: 0 }
  }
  
  // Schedule — LLM
  if (first.type === 'schedule') {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  // Clarify — сохраняем в сессию (in-memory)
  if (first.type === 'clarify') {
    const pendingAction: PendingAction = {
      type: mapClarifyType(first.clarifyType),
      tobacco: first.tobacco,
      options: first.options,
      grams: first.grams ?? null,
      actionType: first.actionType,
      raw: first.raw,
    }
    
    setSession(masterId, pendingAction)
    
    // Если есть ещё действия (multi-line) — исполняем те, что готовы
    const readyActions = actions.slice(1).filter(a => 
      (a.type === 'add_incoming' || a.type === 'spend' || a.type === 'set_stock') 
      && a.tobacco && typeof a.grams === 'number'
    )
    const extraReplies: string[] = []
    for (const a of readyActions) {
      const r = await executeAction(a, masterId)
      extraReplies.push(r)
    }
    
    const reply = first.message || 'Уточни.'
    if (extraReplies.length > 0) {
      return { handled: true, reply: reply + '\n' + extraReplies.join('\n'), executedCount: extraReplies.length }
    }
    return { handled: true, reply, executedCount: 0 }
  }
  
  // Исполняем действия
  const replies: string[] = []
  let executed = 0
  
  for (const action of actions) {
    if (action.type === 'add_incoming' && action.tobacco && typeof action.grams === 'number') {
      const r = await executeAddIncoming(action, masterId)
      replies.push(r)
      executed++
    } else if (action.type === 'spend' && action.tobacco && typeof action.grams === 'number') {
      const r = await executeSpend(action, masterId)
      replies.push(r)
      executed++
    } else if (action.type === 'set_stock' && action.tobacco && typeof action.grams === 'number') {
      const r = await executeSetStock(action, masterId)
      replies.push(r)
      executed++
    } else if (action.type === 'clarify') {
      replies.push(action.message || 'Уточни.')
    }
  }
  
  if (replies.length === 0) {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  return {
    handled: true,
    reply: replies.join('\n'),
    executedCount: executed,
  }
}

function mapClarifyType(clarifyType: string | undefined): PendingAction['type'] {
  switch (clarifyType) {
    case 'suggest': return 'suggest'
    case 'ambiguous_tobacco': return 'ambiguous'
    case 'no_verb': return 'no_verb'
    case 'no_quantity': return 'no_quantity'
    default: return 'no_verb'
  }
}

// ─── Обработка подтверждения ───

async function handleConfirmation(
  pending: PendingAction,
  confirmation: 'yes' | 'no' | 'cancel' | number,
  masterId: string,
): Promise<IntentResult> {
  // «нет» / «отмена»
  if (confirmation === 'no' || confirmation === 'cancel') {
    return { handled: true, reply: '❌ Отменено.', executedCount: 0 }
  }
  
  // «да» — для suggest (может это?)
  if (confirmation === 'yes' && pending.type === 'suggest' && pending.tobacco) {
    if (pending.grams !== null && pending.grams !== undefined) {
      const action: ParsedAction = {
        type: pending.actionType || 'set_stock',
        tobacco: pending.tobacco,
        grams: pending.grams,
        raw: pending.raw,
      }
      const r = await executeAction(action, masterId)
      return { handled: true, reply: r, executedCount: 1 }
    }
    // Нет grams → спрашиваем
    const newPending: PendingAction = {
      type: 'no_quantity',
      tobacco: pending.tobacco,
      actionType: pending.actionType,
      raw: pending.raw,
    }
    setSession(masterId, newPending)
    return { handled: true, reply: 'Сколько грамм?', executedCount: 0 }
  }
  
  // «да» — для ambiguous → берём первый вариант
  if (confirmation === 'yes' && pending.type === 'ambiguous' && pending.options && pending.options.length > 0) {
    return await pickAndExecute(pending, 1, masterId)
  }
  
  // «да» — для no_verb → set_stock по умолчанию
  if (confirmation === 'yes' && pending.type === 'no_verb' && pending.tobacco) {
    if (pending.grams !== null && pending.grams !== undefined) {
      const action: ParsedAction = {
        type: 'set_stock',
        tobacco: pending.tobacco,
        grams: pending.grams,
        raw: pending.raw,
      }
      const r = await executeAction(action, masterId)
      return { handled: true, reply: r, executedCount: 1 }
    }
    const newPending: PendingAction = {
      type: 'no_quantity',
      tobacco: pending.tobacco,
      actionType: 'set_stock',
      raw: pending.raw,
    }
    setSession(masterId, newPending)
    return { handled: true, reply: 'Сколько грамм?', executedCount: 0 }
  }
  
  // «да» — для no_quantity → не имеет смысла, переспрашиваем
  if (confirmation === 'yes' && pending.type === 'no_quantity') {
    // Сохраняем сессию заново
    setSession(masterId, pending)
    return { handled: true, reply: 'Напиши число, например «25» или «пол банки».', executedCount: 0 }
  }
  
  // число 1-99 — выбор из ambiguous
  if (typeof confirmation === 'number' && pending.type === 'ambiguous' && pending.options) {
    return await pickAndExecute(pending, confirmation, masterId)
  }
  
  // число для suggest → трактуем как «да»
  if (typeof confirmation === 'number' && pending.type === 'suggest' && pending.tobacco) {
    if (pending.grams !== null && pending.grams !== undefined) {
      const action: ParsedAction = {
        type: pending.actionType || 'set_stock',
        tobacco: pending.tobacco,
        grams: pending.grams,
        raw: pending.raw,
      }
      const r = await executeAction(action, masterId)
      return { handled: true, reply: r, executedCount: 1 }
    }
    const newPending: PendingAction = {
      type: 'no_quantity',
      tobacco: pending.tobacco,
      actionType: pending.actionType,
      raw: pending.raw,
    }
    setSession(masterId, newPending)
    return { handled: true, reply: 'Сколько грамм?', executedCount: 0 }
  }
  
  // число для no_verb → обновляем grams и спрашиваем глагол
  if (typeof confirmation === 'number' && pending.type === 'no_verb' && pending.tobacco) {
    const newPending: PendingAction = {
      ...pending,
      grams: confirmation,
    }
    setSession(masterId, newPending)
    return { handled: true, reply: 'Это добавить, списать или новый остаток?', executedCount: 0 }
  }
  
  // число для no_quantity → устанавливаем grams и исполняем
  if (typeof confirmation === 'number' && pending.type === 'no_quantity' && pending.tobacco) {
    const action: ParsedAction = {
      type: pending.actionType || 'set_stock',
      tobacco: pending.tobacco,
      grams: confirmation,
      raw: pending.raw,
    }
    const r = await executeAction(action, masterId)
    return { handled: true, reply: r, executedCount: 1 }
  }
  
  return { handled: true, reply: 'Не понял ответ. Повтори команду.', executedCount: 0 }
}

async function pickAndExecute(
  pending: PendingAction,
  choice: number,
  masterId: string,
): Promise<IntentResult> {
  const idx = choice - 1
  if (!pending.options || idx >= pending.options.length || idx < 0) {
    return { handled: true, reply: 'Нет такого номера. Повтори команду.', executedCount: 0 }
  }
  
  const chosen = pending.options[idx]
  let tobacco = pending.tobacco
  
  // Загружаем полный табак
  try {
    const full = await db.tobacco.findUnique({
      where: { id: chosen.id },
      select: { id: true, brand: true, line: true, flavor: true, defaultJarGrams: true },
    })
    if (full) {
      tobacco = {
        id: full.id,
        brand: full.brand,
        line: full.line,
        flavor: full.flavor,
        defaultJarGrams: full.defaultJarGrams,
      }
    } else {
      // Табак не найден в БД — используем данные из options
      tobacco = {
        id: chosen.id,
        brand: chosen.brand,
        line: chosen.line,
        flavor: chosen.flavor,
        defaultJarGrams: 250,
      }
    }
  } catch {
    tobacco = {
      id: chosen.id,
      brand: chosen.brand,
      line: chosen.line,
      flavor: chosen.flavor,
      defaultJarGrams: 250,
    }
  }
  
  if (tobacco && pending.grams !== null && pending.grams !== undefined) {
    const action: ParsedAction = {
      type: pending.actionType || 'set_stock',
      tobacco,
      grams: pending.grams,
      raw: pending.raw,
    }
    const r = await executeAction(action, masterId)
    return { handled: true, reply: r, executedCount: 1 }
  }
  
  // Нет grams → спрашиваем
  const newPending: PendingAction = {
    type: 'no_quantity',
    tobacco: tobacco || undefined,
    actionType: pending.actionType,
    raw: pending.raw,
  }
  if (tobacco) setSession(masterId, newPending)
  return { handled: true, reply: 'Сколько грамм?', executedCount: 0 }
}

// ─── Исполнение действий ───

async function executeAction(action: ParsedAction, masterId: string): Promise<string> {
  if (action.type === 'add_incoming') return executeAddIncoming(action, masterId)
  if (action.type === 'spend') return executeSpend(action, masterId)
  if (action.type === 'set_stock') return executeSetStock(action, masterId)
  return 'Неизвестное действие'
}

async function executeAddIncoming(action: ParsedAction, masterId: string): Promise<string> {
  const t = action.tobacco!
  const grams = action.grams!
  
  const stock = await db.stockItem.findUnique({ where: { tobaccoId: t.id } })
  const before = stock?.currentGrams ?? 0
  const after = before + grams
  
  if (stock) {
    await db.stockItem.update({ where: { tobaccoId: t.id }, data: { currentGrams: after } })
  } else {
    await db.stockItem.create({ data: { tobaccoId: t.id, currentGrams: after } })
  }
  
  await db.operation.create({
    data: {
      tobaccoId: t.id,
      type: 'INCOMING',
      gramsBefore: before,
      gramsAfter: after,
      delta: grams,
      source: 'TEXT',
      note: 'Intent parser',
      rawInput: action.raw,
    },
  })
  
  return `✓ ${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor} +${grams}г (${before}→${after})`
}

async function executeSpend(action: ParsedAction, masterId: string): Promise<string> {
  const t = action.tobacco!
  const grams = action.grams!
  
  const stock = await db.stockItem.findUnique({ where: { tobaccoId: t.id } })
  const before = stock?.currentGrams ?? 0
  const after = Math.max(0, before - grams)
  
  if (stock) {
    await db.stockItem.update({ where: { tobaccoId: t.id }, data: { currentGrams: after } })
  }
  
  await db.operation.create({
    data: {
      tobaccoId: t.id,
      type: 'ADJUSTMENT',
      gramsBefore: before,
      gramsAfter: after,
      delta: -grams,
      source: 'TEXT',
      note: 'Расход (parser)',
      rawInput: action.raw,
    },
  })
  
  // Проверка порога — пуш старшему
  if (after < t.defaultJarGrams * 0.3) {
    try {
      await pushToSeniors(`⚠️ ${t.brand} ${t.flavor}: ${after}г (после списания ${grams}г)`)
    } catch {
      // Не критично
    }
  }
  
  return `✓ ${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor} -${grams}г (${before}→${after})`
}

async function executeSetStock(action: ParsedAction, masterId: string): Promise<string> {
  const t = action.tobacco!
  const grams = action.grams!
  
  const stock = await db.stockItem.findUnique({ where: { tobaccoId: t.id } })
  const before = stock?.currentGrams ?? 0
  const after = grams
  
  if (stock) {
    await db.stockItem.update({ where: { tobaccoId: t.id }, data: { currentGrams: after } })
  } else {
    await db.stockItem.create({ data: { tobaccoId: t.id, currentGrams: after } })
  }
  
  await db.operation.create({
    data: {
      tobaccoId: t.id,
      type: 'ADJUSTMENT',
      gramsBefore: before,
      gramsAfter: after,
      delta: after - before,
      source: 'TEXT',
      note: 'Установка остатка (parser)',
      rawInput: action.raw,
    },
  })
  
  return `✓ ${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor} =${grams}г (${before}→${after})`
}

// ─── Query handler ───

async function handleQuery(text: string): Promise<string> {
  const normalized = text.toLowerCase()
  
  if (normalized.includes('мало') || normalized.includes('чё мало') || normalized.includes('че мало')) {
    const tobaccos = await db.tobacco.findMany({
      where: { active: true },
      include: { stock: true },
      orderBy: [{ brand: 'asc' }, { flavor: 'asc' }],
    })
    
    const low = tobaccos.filter(t => {
      const grams = t.stock?.currentGrams ?? 0
      return grams < t.thresholdGrams
    })
    
    if (low.length === 0) {
      return '✅ Всё в норме, ничего не кончается.'
    }
    
    const lines = low.map(t => {
      const grams = t.stock?.currentGrams ?? 0
      return `• ${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor}: ${grams}г`
    })
    
    return `⚠️ Мало (${low.length}):\n${lines.join('\n')}`
  }
  
  if (normalized.includes('остатк') || normalized.includes('склад') || normalized.includes('список')) {
    const tobaccos = await db.tobacco.findMany({
      where: { active: true },
      include: { stock: true },
      orderBy: [{ brand: 'asc' }, { flavor: 'asc' }],
      take: 50,
    })
    
    const withStock = tobaccos.filter(t => (t.stock?.currentGrams ?? 0) > 0)
    
    if (withStock.length === 0) {
      return 'Склад пуст.'
    }
    
    const lines = withStock.map(t => {
      const grams = t.stock?.currentGrams ?? 0
      return `• ${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor}: ${grams}г`
    })
    
    return `📦 Остатки (${withStock.length}):\n${lines.join('\n')}`
  }
  
  return 'Что показать? Напиши «мало» или «остатки».'
}
