import 'server-only'

import { normalize, findBrandInText } from './normalize'
import { extractQuantity } from './number-parser'
import { detectOperation, isConfirmation, removeVerb, OperationType } from './verb-detector'
import { fuzzySearchTobacco, findSimilarBrands, SearchResult } from './fuzzy-search'

// ───────────────────────────────────────────
// Intent Parser — главная функция парсинга.
// Принимает текст, возвращает структурированные действия.
// ───────────────────────────────────────────

export interface ParsedAction {
  type: 'add_incoming' | 'spend' | 'set_stock' | 'query' | 'schedule' | 'clarify' | 'unknown'
  // Для tobacco операций
  tobacco?: {
    id: string
    brand: string
    line: string
    flavor: string
    defaultJarGrams: number
  }
  grams?: number
  // Для clarify (уточнение)
  clarifyType?: 'ambiguous_tobacco' | 'no_verb' | 'no_quantity' | 'not_found' | 'suggest'
  options?: Array<{ id: string; brand: string; line: string; flavor: string }>
  // Желаемое действие (если clarify — что сделать после подтверждения)
  actionType?: 'add_incoming' | 'spend' | 'set_stock'
  // Оригинальный текст
  raw: string
  // Сообщение для пользователя
  message?: string
}

// Главная функция
export async function parseIntent(text: string): Promise<ParsedAction[]> {
  const normalized = normalize(text)
  
  // 1. Проверяем подтверждение (да/нет/1/2/3) — обрабатывается отдельно в bot-runner
  const confirmation = isConfirmation(text)
  if (confirmation !== null) {
    // Возвращаем special action, который bot-runner обработает в контексте сессии
    return [{
      type: 'unknown',
      raw: text,
      message: '__CONFIRM__'  // маркер для bot-runner
    }]
  }
  
  // 2. Определяем операцию по глаголу
  const { type, verb } = detectOperation(text)
  
  // 3. Запрос (мало, остатки, график) — без табака
  if (type === 'query') {
    return [{
      type: 'query',
      raw: text,
    }]
  }
  
  if (type === 'schedule') {
    // График обрабатываем через LLM (сложные запросы дат)
    return [{
      type: 'schedule',
      raw: text,
    }]
  }
  
  // 4. Извлекаем количество
  const { quantity, rest: restAfterQty } = extractQuantity(text)
  
  // 4.5 Удаляем глагол из текста — остаётся только название табака
  const rest = removeVerb(restAfterQty)
  
  // 5. Если количество не найдено
  if (!quantity) {
    // Проверяем — может мастер просто назвал табак без числа
    const search = await fuzzySearchTobacco(rest)
    if (search.status === 'single' || search.status === 'ambiguous') {
      return [{
        type: 'clarify',
        clarifyType: 'no_quantity',
        tobacco: search.status === 'single' ? {
          id: search.matches[0].tobacco.id,
          brand: search.matches[0].tobacco.brand,
          line: search.matches[0].tobacco.line,
          flavor: search.matches[0].tobacco.flavor,
          defaultJarGrams: search.matches[0].tobacco.defaultJarGrams,
        } : undefined,
        raw: text,
        message: `Сколько грамм? (например: «25», «пол банки», «2б»)`,
      }]
    }
  }
  
  // 6. Голое число без глагола — переспросить
  if (type === 'unknown' && quantity) {
    // Ищем табак в оставшемся тексте
    const search = await fuzzySearchTobacco(rest)
    
    if (search.status === 'not_found') {
      const suggestions = await findSimilarBrands(rest)
      return [{
        type: 'clarify',
        clarifyType: 'not_found',
        raw: text,
        message: `Не нашёл «${rest}».${suggestions.length > 0 ? ` Возможно: ${suggestions.join(', ')}` : ''} Попробуй название из склада.`,
      }]
    }
    
    if (search.status === 'ambiguous') {
      return [{
        type: 'clarify',
        clarifyType: 'ambiguous_tobacco',
        options: search.matches.map(m => ({
          id: m.tobacco.id,
          brand: m.tobacco.brand,
          line: m.tobacco.line,
          flavor: m.tobacco.flavor,
        })),
        raw: text,
        message: `Несколько вариантов для «${rest}»:\n${search.matches.map((m, i) => `${i + 1}. ${m.tobacco.brand} ${m.tobacco.line ? m.tobacco.line + ' ' : ''}${m.tobacco.flavor}`).join('\n')}\nНапиши номер.`,
      }]
    }
    
    if (search.status === 'single') {
      const match = search.matches[0]
      return [{
        type: 'clarify',
        clarifyType: 'no_verb',
        tobacco: {
          id: match.tobacco.id,
          brand: match.tobacco.brand,
          line: match.tobacco.line,
          flavor: match.tobacco.flavor,
          defaultJarGrams: match.tobacco.defaultJarGrams,
        },
        grams: quantity.grams ?? (quantity.banks ? quantity.banks * match.tobacco.defaultJarGrams : undefined),
        raw: text,
        message: `«${match.tobacco.brand} ${match.tobacco.flavor} — ${quantity.grams || (quantity.banks ? quantity.banks + 'б' : '?')}». Это добавить, списать или новый остаток?`,
      }]
    }
    
    if (search.status === 'suggest') {
      const match = search.matches[0]
      return [{
        type: 'clarify',
        clarifyType: 'suggest',
        tobacco: {
          id: match.tobacco.id,
          brand: match.tobacco.brand,
          line: match.tobacco.line,
          flavor: match.tobacco.flavor,
          defaultJarGrams: match.tobacco.defaultJarGrams,
        },
        grams: quantity.grams ?? (quantity.banks ? quantity.banks * match.tobacco.defaultJarGrams : undefined),
        raw: text,
        message: `Может «${match.tobacco.brand} ${match.tobacco.flavor}»? (да/нет)`,
      }]
    }
  }
  
  // 7. Если глагол известен (add/spend/set) — ищем табак
  if (type === 'add_incoming' || type === 'spend' || type === 'set_stock') {
    const search = await fuzzySearchTobacco(rest)
    
    if (search.status === 'not_found') {
      const suggestions = await findSimilarBrands(rest)
      return [{
        type: 'clarify',
        clarifyType: 'not_found',
        raw: text,
        message: `Не нашёл «${rest}».${suggestions.length > 0 ? ` Возможно: ${suggestions.join(', ')}` : ''} Попробуй название из склада.`,
      }]
    }
    
    if (search.status === 'ambiguous') {
      return [{
        type: 'clarify',
        clarifyType: 'ambiguous_tobacco',
        actionType: type,  // сохраняем желаемое действие
        options: search.matches.map(m => ({
          id: m.tobacco.id,
          brand: m.tobacco.brand,
          line: m.tobacco.line,
          flavor: m.tobacco.flavor,
        })),
        raw: text,
        message: `Несколько вариантов для «${rest}»:\n${search.matches.map((m, i) => `${i + 1}. ${m.tobacco.brand} ${m.tobacco.line ? m.tobacco.line + ' ' : ''}${m.tobacco.flavor}`).join('\n')}\nНапиши номер.`,
      }]
    }
    
    if (search.status === 'suggest') {
      const match = search.matches[0]
      return [{
        type: 'clarify',
        clarifyType: 'suggest',
        actionType: type,  // сохраняем желаемое действие
        tobacco: {
          id: match.tobacco.id,
          brand: match.tobacco.brand,
          line: match.tobacco.line,
          flavor: match.tobacco.flavor,
          defaultJarGrams: match.tobacco.defaultJarGrams,
        },
        grams: quantity?.grams ?? (quantity?.banks ? quantity.banks * match.tobacco.defaultJarGrams : undefined),
        raw: text,
        message: `Может «${match.tobacco.brand} ${match.tobacco.flavor}»? (да/нет)`,
      }]
    }
    
    if (search.status === 'single') {
      const match = search.matches[0]
      const grams = quantity?.grams ?? (quantity?.banks ? quantity.banks * match.tobacco.defaultJarGrams : undefined)
      
      if (!grams) {
        return [{
          type: 'clarify',
          clarifyType: 'no_quantity',
          tobacco: {
            id: match.tobacco.id,
            brand: match.tobacco.brand,
            line: match.tobacco.line,
            flavor: match.tobacco.flavor,
            defaultJarGrams: match.tobacco.defaultJarGrams,
          },
          raw: text,
          message: `Сколько грамм для «${match.tobacco.brand} ${match.tobacco.flavor}»?`,
        }]
      }
      
      return [{
        type,
        tobacco: {
          id: match.tobacco.id,
          brand: match.tobacco.brand,
          line: match.tobacco.line,
          flavor: match.tobacco.flavor,
          defaultJarGrams: match.tobacco.defaultJarGrams,
        },
        grams,
        raw: text,
      }]
    }
  }
  
  // 8. Не поняли — fallback
  return [{
    type: 'unknown',
    raw: text,
    message: 'Не понял. Попробуй так:\n• «принял blackburn ёлка 25»\n• «минус 30 банан»\n• «обнови остаток дарксайд елка 123»\n• «чё мало»',
  }]
}

// Парсинг многострочного сообщения (поставка с несколькими позициями)
export async function parseMultiLine(text: string): Promise<ParsedAction[]> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  
  // Если одна строка — обычный парсинг
  if (lines.length <= 1) {
    return parseIntent(text)
  }
  
  // Первая строка может содержать контекст (бренд, глагол)
  const firstLine = lines[0]
  const { brand } = findBrandInText(firstLine)
  const { type } = detectOperation(firstLine)
  
  const actions: ParsedAction[] = []
  
  // Если первая строка — «поставка blackburn» или «принял blackburn»
  // остальные строки — «вкус число»
  const isSupplyHeader = /^(поставка|принял|приход|приехало|проверка|инвентаризация)/.test(normalize(firstLine))
  
  if (isSupplyHeader) {
    // Первая строка — заголовок поставки
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // Если бренд не указан в строке — берём из заголовка
      const lineWithBrand = brand && !findBrandInText(line).brand ? `${brand} ${line}` : line
      const action = await parseIntent(lineWithBrand)
      // Принудительно устанавливаем тип из заголовка (если не указан в строке)
      if (action[0].type === 'unknown' && type !== 'unknown') {
        action[0].type = type
      }
      actions.push(...action)
    }
  } else {
    // Каждая строка — отдельная команда
    for (const line of lines) {
      const action = await parseIntent(line)
      actions.push(...action)
    }
  }
  
  return actions
}
