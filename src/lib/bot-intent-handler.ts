import 'server-only'
import { db } from '@/lib/db'
import { parseIntent, ParsedAction } from '@/lib/intent-parser'
import { isConfirmation } from '@/lib/verb-detector'
import { pushToSeniors } from '@/lib/notify'

// ───────────────────────────────────────────
// Обработчик intent parser для бота с поддержкой сессий.
// ───────────────────────────────────────────

export interface IntentResult {
  handled: boolean
  reply: string
  executedCount: number
}

interface PendingAction {
  type: 'suggest' | 'ambiguous' | 'no_verb'
  tobacco?: { id: string; brand: string; line: string; flavor: string; defaultJarGrams: number }
  options?: Array<{ id: string; brand: string; line: string; flavor: string }>
  grams?: number
  actionType?: 'add_incoming' | 'spend' | 'set_stock'
  raw: string
}

export async function tryHandleWithParser(
  text: string,
  masterId: string,
): Promise<IntentResult> {
  // ─── Сначала проверяем — может это ответ на предыдущий вопрос ───
  const session = await db.botSession.findUnique({ where: { masterId } })
  
  if (session?.pendingAction) {
    const pending: PendingAction = JSON.parse(session.pendingAction)
    const confirmation = isConfirmation(text)
    
    if (confirmation !== null) {
      // Это ответ на вопрос — обрабатываем
      const result = await handleConfirmation(pending, confirmation, masterId)
      // Очищаем pending
      await db.botSession.update({
        where: { masterId },
        data: { pendingAction: null },
      })
      return result
    }
  }
  
  // ─── Обычный парсинг ───
  const actions = await parseIntent(text)
  
  if (actions.length === 0) {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  const first = actions[0]
  
  // Unknown с подсказкой
  if (first.type === 'unknown' && first.message && first.message !== '__CONFIRM__') {
    return { handled: true, reply: first.message, executedCount: 0 }
  }
  
  // Confirm маркер
  if (first.message === '__CONFIRM__') {
    return { handled: false, reply: '', executedCount: 0 }
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
  
  // Clarify — сохраняем в сессию
  if (first.type === 'clarify') {
    const pending: PendingAction = {
      type: first.clarifyType as 'suggest' | 'ambiguous' | 'no_verb',
      tobacco: first.tobacco,
      options: first.options,
      grams: first.grams,
      actionType: first.actionType,
      raw: first.raw,
    }
    
    await db.botSession.upsert({
      where: { masterId },
      update: { pendingAction: JSON.stringify(pending) },
      create: {
        masterId,
        pendingAction: JSON.stringify(pending),
      },
    })
    
    return { handled: true, reply: first.message || 'Уточни.', executedCount: 0 }
  }
  
  // Исполняем действия
  const replies: string[] = []
  let executed = 0
  let lastTobaccoId: string | null = null
  let lastAction: string | null = null
  
  for (const action of actions) {
    if (action.type === 'add_incoming' && action.tobacco && action.grams) {
      const r = await executeAddIncoming(action, masterId)
      replies.push(r)
      executed++
      lastTobaccoId = action.tobacco.id
      lastAction = 'add_incoming'
    } else if (action.type === 'spend' && action.tobacco && action.grams) {
      const r = await executeSpend(action, masterId)
      replies.push(r)
      executed++
      lastTobaccoId = action.tobacco.id
      lastAction = 'spend'
    } else if (action.type === 'set_stock' && action.tobacco && action.grams !== undefined) {
      const r = await executeSetStock(action, masterId)
      replies.push(r)
      executed++
      lastTobaccoId = action.tobacco.id
      lastAction = 'set_stock'
    } else if (action.type === 'clarify') {
      replies.push(action.message || 'Уточни.')
    }
  }
  
  if (replies.length === 0) {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  // Сохраняем контекст сессии
  await db.botSession.upsert({
    where: { masterId },
    update: {
      lastTobaccoId,
      lastAction,
      pendingAction: null,  // очищаем pending после успешного выполнения
    },
    create: {
      masterId,
      lastTobaccoId,
      lastAction,
    },
  })
  
  return {
    handled: true,
    reply: replies.join('\n'),
    executedCount: executed,
  }
}

// ─── Обработка подтверждения (да/нет/1/2/3) ───

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
    const action: ParsedAction = {
      type: 'set_stock',  // по умолчанию — установка остатка (как было в исходном запросе)
      tobacco: pending.tobacco,
      grams: pending.grams,
      raw: pending.raw,
    }
    
    // Если в исходном запросе был глагол add/spend — используем его
    if (pending.actionType) {
      action.type = pending.actionType
    }
    
    if (action.grams) {
      const r = await executeAction(action, masterId)
      return { handled: true, reply: r, executedCount: 1 }
    }
    return { handled: true, reply: 'Сколько грамм?', executedCount: 0 }
  }
  
  // число 1-9 — выбор из ambiguous
  if (typeof confirmation === 'number' && pending.options && confirmation >= 1) {
    const idx = confirmation - 1
    if (idx < pending.options.length) {
      const chosen = pending.options[idx]
      // Загружаем полный табак
      const tobacco = await db.tobacco.findUnique({
        where: { id: chosen.id },
        select: { id: true, brand: true, line: true, flavor: true, defaultJarGrams: true },
      })
      
      if (tobacco && pending.grams) {
        const action: ParsedAction = {
          type: pending.actionType || 'set_stock',
          tobacco: {
            id: tobacco.id,
            brand: tobacco.brand,
            line: tobacco.line,
            flavor: tobacco.flavor,
            defaultJarGrams: tobacco.defaultJarGrams,
          },
          grams: pending.grams,
          raw: pending.raw,
        }
        const r = await executeAction(action, masterId)
        return { handled: true, reply: r, executedCount: 1 }
      }
    }
  }
  
  return { handled: true, reply: 'Не понял ответ. Попробуй ещё раз.', executedCount: 0 }
}

// ─── Универсальное исполнение действия ───

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
      note: 'Telegram (intent parser)',
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
      note: 'Расход (intent parser)',
      rawInput: action.raw,
    },
  })
  
  // Проверка порога — пуш старшему
  if (after < t.defaultJarGrams * 0.3) {
    await pushToSeniors({
      type: 'LOW_STOCK',
      message: `⚠️ ${t.brand} ${t.flavor}: ${after}г (после списания ${grams}г)`,
      masterId,
    })
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
      note: 'Установка остатка (intent parser)',
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
      return `• ${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor}: ${grams}г (порог ${t.thresholdGrams}г)`
    })
    
    return `⚠️ Мало на складе (${low.length}):\n${lines.join('\n')}`
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
    
    return `📦 Остатки (${withStock.length} поз.):\n${lines.join('\n')}`
  }
  
  return 'Что именно показать? Напиши «мало» или «остатки».'
}
