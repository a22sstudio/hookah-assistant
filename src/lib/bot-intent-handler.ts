import 'server-only'
import { db } from '@/lib/db'
import { parseIntent, ParsedAction } from '@/lib/intent-parser'
import { pushToSeniors } from '@/lib/notify'

// ───────────────────────────────────────────
// Обработчик intent parser для бота.
// Возвращает reply string если справился, или null если нужен LLM fallback.
// ───────────────────────────────────────────

export interface IntentResult {
  handled: boolean       // true = парсер справился, false = нужен LLM
  reply: string          // текст ответа для мастера
  executedCount: number  // сколько действий исполнил
}

export async function tryHandleWithParser(
  text: string,
  masterId: string,
): Promise<IntentResult> {
  const actions = await parseIntent(text)
  
  if (actions.length === 0) {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  // Если парсер вернул unknown с подсказкой — отправляем подсказку
  const first = actions[0]
  if (first.type === 'unknown' && first.message && first.message !== '__CONFIRM__') {
    return { handled: true, reply: first.message, executedCount: 0 }
  }
  
  // Если это confirm маркер — не handled (нужен контекст сессии, пока fallback)
  if (first.message === '__CONFIRM__') {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  // Query — обрабатываем напрямую (мало/остатки)
  if (first.type === 'query') {
    const reply = await handleQuery(text)
    return { handled: true, reply, executedCount: 0 }
  }
  
  // Schedule — нужен LLM (сложные даты)
  if (first.type === 'schedule') {
    return { handled: false, reply: '', executedCount: 0 }
  }
  
  // Clarify — отправляем вопрос
  if (first.type === 'clarify') {
    return { handled: true, reply: first.message || 'Уточни.', executedCount: 0 }
  }
  
  // add_incoming / spend / set_stock — исполняем
  const replies: string[] = []
  let executed = 0
  
  for (const action of actions) {
    if (action.type === 'add_incoming' && action.tobacco && action.grams) {
      const r = await executeAddIncoming(action, masterId)
      replies.push(r)
      executed++
    } else if (action.type === 'spend' && action.tobacco && action.grams) {
      const r = await executeSpend(action, masterId)
      replies.push(r)
      executed++
    } else if (action.type === 'set_stock' && action.tobacco && action.grams !== undefined) {
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

// ─── Исполнение действий ───

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
  
  const master = await db.master.findUnique({ where: { id: masterId } })
  void master
  
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

// ─── Query handler (мало / остатки) ───

async function handleQuery(text: string): Promise<string> {
  const normalized = text.toLowerCase()
  
  // «мало» — позиции ниже порога
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
  
  // «остатки» / «склад» — все позиции
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
