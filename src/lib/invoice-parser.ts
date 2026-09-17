import 'server-only'

// ───────────────────────────────────────────
// Парсер текста накладной в структурированные позиции.
// Без ИИ — чистая эвристика.
//
// Стратегия:
// 1. Разбиваем текст на блоки по номерам позиций (1, 2, 3...).
//    Блок = все строки от одного номера до следующего.
//    Если номер стоит на отдельной строке ("5\nТабак..."), он начинает блок.
// 2. Внутри блока ищем: бренд, линейку, вкус, вес, количество.
// 3. Цены/суммы игнорируем (не используем), но вырезаем из текста.
//
// Поддерживаемые форматы:
//   1) "5 Табак для кальяна BLACKBURN с ароматом «Бархатный персик», 200г. 1450,00 2 шт 2900,00"
//   2) "8 DEUS 100 г WHITE PEACH (Аромат белого персика) 730,00 1 шт 730,00"
//   3) "34 Уголь Cocoloco 25мм Horeca 1кг 470,00 40 шт 18800,00"
//   4) С переносами строк внутри позиции (номер на отдельной строке)
// ───────────────────────────────────────────

export interface ParsedSupplyItem {
  itemType: 'TOBACCO' | 'CONSUMABLE'
  brand: string
  line: string
  flavor: string
  name: string
  packGrams: number | null
  quantity: number
  unit: string
  itemId?: string | null
  isNovelty?: boolean
  isMatch?: boolean
  rawText?: string  // исходный текст позиции (для отладки и LLM)
}

// Ключевые слова расходников
const CONSUMABLE_KEYWORDS: Array<{ keywords: string[]; unit: string }> = [
  { keywords: ['уголь', 'coal', 'cocoloco', 'cocourth', 'kalahoud'], unit: 'шт' },
  { keywords: ['колба', 'vessel', 'кристалл'], unit: 'шт' },
  { keywords: ['шланг', 'hose', 'мундштук'], unit: 'шт' },
  { keywords: ['чаша', 'bowl', 'phunnel'], unit: 'шт' },
  { keywords: ['фольга', 'foil'], unit: 'рул' },
  { keywords: ['тросник', 'тростник', 'cane mint'], unit: 'шт' },
  { keywords: ['щипцы', 'tongs'], unit: 'шт' },
  { keywords: ['диффузор'], unit: 'шт' },
  { keywords: ['блюдце'], unit: 'шт' },
  { keywords: ['молоко'], unit: 'л' },
]

// Известные бренды табака (расширенный список)
const TOBACCO_BRANDS = [
  'BLACKBURN', 'BLACK BURN',
  'DARKSIDE', 'DARK SIDE',
  'TANGIERS', 'TANGIER',
  'MUSTHAVE', 'MUST HAVE',
  'DEUS',
  'JENT',
  'SEBERO',
  'OVERDOSE',
  'САРМА', 'SARMA',
  'НАШ', 'NASH',
  'BACCY',
  'COYOTE',
  'NORTH',
  'ELEMENT',
  'DUOTTO',
  'SAPO',
  'BRAVA',
  'ADALIA',
  'VINI',
  'TANBACCO',
  'JOON',
  'ARGELINI',
  'FASIL',
  'SERBETLI',
  'NAKHLA',
  'DAILY HOOKAH',
  'BURN',
  'COBRA',
  'AFDAL',
  'ADANA',
  'DERIN',
  'NABIL',
  'WTO',
  'SAFARI',
]

// Нормализуем строку для сравнения
function norm(s: string): string {
  return (s || '').toUpperCase().replace(/\s+/g, ' ').trim()
}

function isConsumable(text: string): boolean {
  const lower = text.toLowerCase()
  return CONSUMABLE_KEYWORDS.some((c) =>
    c.keywords.some((k) => lower.includes(k.toLowerCase())),
  )
}

function detectUnit(name: string): string {
  const lower = name.toLowerCase()
  for (const c of CONSUMABLE_KEYWORDS) {
    if (c.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return c.unit
    }
  }
  return 'шт'
}

// Case-insensitive поиск бренда в тексте.
// Возвращает { brand: normalized, original: substring, rest: text without brand }
function findBrand(text: string): { brand: string; rest: string } | null {
  const upper = text.toUpperCase()
  // Сначала ищем самые длинные бренды (чтобы "BLACK BURN" не побеждал "BLACKBURN")
  const sortedBrands = [...TOBACCO_BRANDS].sort((a, b) => b.length - a.length)
  for (const brand of sortedBrands) {
    const idx = upper.indexOf(brand)
    if (idx >= 0) {
      const before = text.slice(0, idx)
      const after = text.slice(idx + brand.length)
      // Нормализуем "BLACK BURN" → "BLACKBURN" (без пробелов внутри)
      const normBrand = brand.replace(/\s+/g, '').toUpperCase()
      return { brand: normBrand, rest: (before + ' ' + after).trim() }
    }
  }
  return null
}

// Извлекаем вес упаковки: "200г", "200 гр.", "100 г", "1кг", "1 кг"
function extractPackGrams(text: string): { grams: number; rest: string } | null {
  const kgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*кг/i)
  if (kgMatch) {
    const kg = parseFloat(kgMatch[1].replace(',', '.'))
    const grams = Math.round(kg * 1000)
    return { grams, rest: text.replace(kgMatch[0], ' ') }
  }

  // \b не работает с кириллицей — используем negative lookahead (?![а-яёa-z])
  const gMatch = text.match(/(\d+)\s*(?:гр|г|gr|g)(?![а-яёa-z])/i)
  if (gMatch) {
    const grams = parseInt(gMatch[1], 10)
    if (grams > 0 && grams <= 5000) {
      return { grams, rest: text.replace(gMatch[0], ' ') }
    }
  }
  return null
}

// Извлекаем количество: ищем "N шт" (N — целое число)
function extractQuantity(text: string): { quantity: number; rest: string } {
  const qtyMatch = text.match(/(\d+)\s*шт\.?\s*/i)
  if (qtyMatch) {
    const qty = parseInt(qtyMatch[1], 10)
    return { quantity: qty > 0 ? qty : 1, rest: text.replace(qtyMatch[0], ' ') }
  }
  return { quantity: 1, rest: text }
}

// Извлекаем линейку: "Классическая линейка", "Сигарная линейка", "Core", "Supernova"
function extractLine(text: string): { line: string; rest: string } | null {
  // Полные фразы
  const fullLineMatch = text.match(
    /(классическ(?:ая|ой)\s+линейк(?:а|у|и)|сигарн(?:ая|ой)\s+линейк(?:а|у|и))/i,
  )
  if (fullLineMatch) {
    const isClassic = /классическ/i.test(fullLineMatch[0])
    const line = isClassic ? 'Классическая' : 'Сигарная'
    return { line, rest: text.replace(fullLineMatch[0], ' ') }
  }

  // "Классик" — отдельное слово
  const classicMatch = text.match(/\b(классик|classic)\b/i)
  if (classicMatch) {
    return { line: 'Классик', rest: text.replace(classicMatch[0], ' ') }
  }

  // Короткие ключевые слова для известных линеек
  // "white" убран — часто часть названия (WHITE PEACH, НАШ WHITE)
  const shortMatch = text.match(/\b(core|medium|supernova|origin|black|rare)\b/i)
  if (shortMatch) {
    return {
      line: shortMatch[1].charAt(0).toUpperCase() + shortMatch[1].slice(1).toLowerCase(),
      rest: text.replace(shortMatch[0], ' '),
    }
  }

  return null
}

// Извлекаем вкус:
//   - в кавычках «...» или "..."
//   - после "с ароматом" / "аромат"
//   - или как текст после бренда
function extractFlavor(text: string): { flavor: string; rest: string } | null {
  // В кавычках
  const quoted = text.match(/[«""]([^»""]{2,80})[»""]/)
  if (quoted) {
    return { flavor: quoted[1].trim(), rest: text.replace(quoted[0], ' ') }
  }

  // "с ароматом X" — берём до конца или до запятой/точки с числом
  const aromMatch = text.match(/с\s+аромат(?:ом)?\s+([A-Za-zА-Яа-яЁё\s,()]+?)(?=,|\.\s*\d|$)/i)
  if (aromMatch) {
    const flavor = aromMatch[1].trim().replace(/[,\s]+$/, '')
    if (flavor.length >= 2) {
      return { flavor, rest: text.replace(aromMatch[0], aromMatch[1]) }
    }
  }

  return null
}

// Очистка от типового мусора
function cleanText(text: string): string {
  return text
    .replace(/Табак\s+для\s+кальяна/gi, ' ')
    .replace(/с\s+ароматом\s+/gi, ' ')
    .replace(/,?\s*\d+\s*гр?\.?/gi, ' ')  // "200г" / "200 гр"
    .replace(/[«""]/g, ' ')
    .replace(/[»""]/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Главная функция парсинга
export function parseInvoiceText(rawText: string): ParsedSupplyItem[] {
  if (!rawText || !rawText.trim()) return []

  // Нормализуем переносы
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())

  // ─── Разбиваем на блоки по номерам позиций ───
  // Блок = все строки от одного номера позиции до следующего.
  // ВАЖНО: номер позиции это 1-3 цифры, после которых идёт ПРОБЕЛ, точка или конец строки.
  // "1450,00" — это цена, не позиция (после 145 идёт "0", а не пробел).
  const blocks: Array<{ number: number; text: string }> = []
  let currentBlock: { number: number; text: string } | null = null

  for (const line of lines) {
    if (!line) continue

    // Проверяем: строка состоит ТОЛЬКО из номера (1-3 цифры)
    const isOnlyNumber = /^\d{1,3}$/.test(line)
    // Или: строка начинается с номера + пробел/точка + есть текст после
    // ВАЖНО: \s* (не \s+) — потому что [.\s] уже съел один пробел
    const startsWithNumber = /^(\d{1,3})[.\s]\s*(\S.*)$/.test(line)

    if (isOnlyNumber) {
      const num = parseInt(line, 10)
      if (num >= 1 && num <= 200) {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = { number: num, text: '' }
        continue
      }
    }

    if (startsWithNumber) {
      const match = line.match(/^(\d{1,3})[.\s]\s*(\S.*)$/)!
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= 200) {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = { number: num, text: match[2].trim() }
        continue
      }
    }

    // Обычная строка (текст, цена/кол-во) — добавляем к текущему блоку
    if (currentBlock) {
      currentBlock.text += (currentBlock.text ? ' ' : '') + line
    }
  }
  if (currentBlock) blocks.push(currentBlock)

  // ─── Парсим каждый блок ───
  const items: ParsedSupplyItem[] = []

  for (const block of blocks) {
    let text = block.text.trim()
    if (!text) continue

    // Извлекаем количество (цены/сумму вырезаем)
    const qtyResult = extractQuantity(text)
    const quantity = qtyResult.quantity
    text = qtyResult.rest.trim()

    // Вырезаем все цены: "1450,00", "18800,00" (числа с десятичной частью через , или .)
    text = text.replace(/\b\d{2,}([.,]\d{1,2})\b/g, ' ')
    text = text.replace(/\s{2,}/g, ' ').trim()

    if (!text) continue

    const isCons = isConsumable(text)
    const itemType: 'TOBACCO' | 'CONSUMABLE' = isCons ? 'CONSUMABLE' : 'TOBACCO'

    if (itemType === 'TOBACCO') {
      // Ищем бренд
      const brandFound = findBrand(text)
      let brand = ''
      let rest = text

      if (brandFound) {
        brand = brandFound.brand
        rest = brandFound.rest
      }

      // Извлекаем вес упаковки
      const gramsFound = extractPackGrams(rest)
      let packGrams: number | null = null
      if (gramsFound) {
        packGrams = gramsFound.grams
        rest = gramsFound.rest
      }

      // Извлекаем линейку
      let line = ''
      const lineFound = extractLine(rest)
      if (lineFound) {
        line = lineFound.line
        rest = lineFound.rest
      }

      // Извлекаем вкус
      let flavor = ''
      const flavorFound = extractFlavor(rest)
      if (flavorFound) {
        flavor = flavorFound.flavor
        rest = flavorFound.rest
      }

      // Если вкус не найден — берём остаток очищенный
      if (!flavor) {
        const cleaned = cleanText(rest)
        if (cleaned) flavor = cleaned
      }

      // Если brand не нашли — попытаемся взять из первого слова
      if (!brand) {
        const cleaned = cleanText(rest)
        const words = cleaned.split(/\s+/).filter(Boolean)
        if (words.length >= 1) {
          const first = words[0].toUpperCase()
          if (first.length >= 3 && first !== 'ТАБАК' && first !== 'АРОМАТ') {
            brand = first
            flavor = words.slice(1).join(' ') || first
          } else {
            brand = 'Без бренда'
            flavor = cleaned
          }
        }
      }

      if (brand && flavor) {
        items.push({
          itemType: 'TOBACCO',
          brand,
          line,
          flavor: flavor.slice(0, 80),
          name: `${brand}${line ? ' ' + line : ''} ${flavor}`.trim(),
          packGrams,
          quantity,
          unit: 'шт',
          rawText: block.text,
        })
      } else if (block.text.length > 5) {
        // Не распознали полностью — добавим как "сырой" табак для LLM
        items.push({
          itemType: 'TOBACCO',
          brand: brand || '',
          line: '',
          flavor: '',
          name: cleanText(block.text).slice(0, 100) || `Позиция ${block.number}`,
          packGrams: null,
          quantity,
          unit: 'шт',
          rawText: block.text,
        })
      }
    } else {
      // Расходник
      const cleaned = cleanText(text)
      const unit = detectUnit(text)
      let packGrams: number | null = null
      const gramsFound = extractPackGrams(text)
      if (gramsFound && unit === 'шт') {
        packGrams = gramsFound.grams
      }

      if (cleaned) {
        items.push({
          itemType: 'CONSUMABLE',
          brand: '',
          line: '',
          flavor: '',
          name: cleaned,
          packGrams,
          quantity,
          unit: packGrams ? 'кг' : unit,
          rawText: block.text,
        })
      }
    }
  }

  return items
}
