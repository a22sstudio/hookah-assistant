import 'server-only'

// ───────────────────────────────────────────
// Парсер текста накладной в структурированные позиции.
// Без ИИ — чистая эвристика по регуляркам.
// Понимает 3 основных формата поставщиков:
//
//   1) "5 Табак для кальяна BLACKBURN с ароматом «Бархатный персик», 200г. 1450,00 2 шт 2900,00"
//   2) "8 DEUS 100 г WHITE PEACH (Аромат белого персика) 730,00 1 шт 730,00"
//   3) "34 Уголь Cocoloco 25мм Horeca 1кг 470,00 40 шт 18800,00"
//
// Внимание: цены и суммы ИГНОРИРУЕМ — работаем только по количеству позиций.
// А также: переносы строк (наименование на 2 строки), пустые номера.
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
}

// Ключевые слова расходников
const CONSUMABLE_KEYWORDS: Array<{ keywords: string[]; unit: string }> = [
  { keywords: ['уголь', 'coal', 'cocoloco', 'cocourth', 'kalahoud'], unit: 'шт' },
  { keywords: ['колба', 'vessel', 'кристалл'], unit: 'шт' },
  { keywords: ['шланг', 'hose', 'мундштук', 'mandstuk'], unit: 'шт' },
  { keywords: ['чаша', 'bowl', 'phunnel'], unit: 'шт' },
  { keywords: ['фольга', 'foil'], unit: 'рул' },
  { keywords: ['тросник', 'тростник', 'cane', 'mint'], unit: 'шт' },
  { keywords: ['щипцы', 'tongs'], unit: 'шт' },
  { keywords: ['диффузор'], unit: 'шт' },
  { keywords: ['блюдце'], unit: 'шт' },
  { keywords: ['молоко'], unit: 'л' },
]

const TOBACCO_BRANDS = [
  'BLACKBURN', 'BLACK BURN', 'DARKSIDE', 'TANGIERS', 'MUSTHAVE', 'DARK BURN',
  'DEUS', 'JENT', 'SEBERO', 'OVERDOSE', 'САРМА', 'SARMA', 'НАШ', 'NASH', 'BACCY',
  'COYOTE', 'NORTH', 'ELEMENT', 'DUOTTO', 'SAPO', 'BRAVA', 'ADALIA', 'VINI',
  'TANBACCO', 'JOON', 'ARGELINI', 'FASIL', 'SERBETLI', 'Nakhla', 'NAKHLA',
]

function isConsumable(name: string): boolean {
  const lower = name.toLowerCase()
  return CONSUMABLE_KEYWORDS.some((c) => c.keywords.some((k) => lower.includes(k.toLowerCase())))
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

function findBrand(text: string): { brand: string; rest: string } | null {
  const upper = text.toUpperCase()
  for (const brand of TOBACCO_BRANDS) {
    const idx = upper.indexOf(brand)
    if (idx >= 0) {
      // вырезаем brand из исходной строки (с сохранением остального текста)
      const before = text.slice(0, idx)
      const after = text.slice(idx + brand.length)
      // нормализуем "BLACK BURN" → "BLACKBURN"
      const normBrand = brand.replace(/\s+/g, '').toUpperCase()
      return { brand: normBrand, rest: (before + ' ' + after).trim() }
    }
  }
  return null
}

// Извлекаем вес упаковки из текста: "200г", "200 гр.", "100 г", "1кг", "1 кг"
function extractPackGrams(text: string): { grams: number; rest: string } | null {
  // Сначала кг (1кг, 1 кг, 1000 г)
  const kgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*кг/i)
  if (kgMatch) {
    const kg = parseFloat(kgMatch[1].replace(',', '.'))
    const grams = Math.round(kg * 1000)
    const rest = text.replace(kgMatch[0], ' ')
    return { grams, rest }
  }

  const gMatch = text.match(/(\d+)\s*(?:г|гр|gr|g)\b\.?/i)
  if (gMatch) {
    const grams = parseInt(gMatch[1], 10)
    if (grams > 0 && grams <= 5000) {
      const rest = text.replace(gMatch[0], ' ')
      return { grams, rest }
    }
  }
  return null
}

// Извлекаем только количество из хвоста строки: "1450,00 2 шт 2900,00"
// Цену и сумму игнорируем (не используем), но ВЫРЕЗАЕМ их из текста,
// чтобы в name/brand/flavor попало только чистое наименование.
function extractQuantity(text: string): { quantity: number; rest: string } {
  // Сначала ищем "<число> шт" — это количество
  const qtyMatch = text.match(/(\d+)\s*шт\.?\s*/i)
  let quantity = 1
  let rest = text

  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10)
    if (quantity <= 0) quantity = 1
    // Убираем "N шт" из строки
    rest = text.replace(qtyMatch[0], ' ')
  }

  // Вырезаем ВСЕ ценовые числа: "1450,00", "18800,00", "730.00"
  // Формат: число (2+ цифр) с обязательной десятичной частью через , или .
  // Так мы не трогаем граммовки (100, 200, 1кг), которые обрабатываются отдельно
  // в extractPackGrams — они без десятичной части.
  rest = rest.replace(/\b\d{2,}([.,]\d{1,2})\b/g, ' ')

  return { quantity, rest: rest.replace(/\s{2,}/g, ' ').trim() }
}

// Извлекаем линейку из текста (после brand)
// Паттерны: "Классическая линейка", "Сигарная линейка", "Classic", "Core", "Supernova"
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

  // Короткие ключевые слова
  const shortMatch = text.match(/\b(core|medium|supernova|classic|rare|origin|black)\b/i)
  if (shortMatch) {
    return {
      line: shortMatch[1].charAt(0).toUpperCase() + shortMatch[1].slice(1).toLowerCase(),
      rest: text.replace(shortMatch[0], ' '),
    }
  }

  return null
}

// Извлекаем вкус из текста (в кавычках, после "аромат" или просто после бренда)
function extractFlavor(text: string): { flavor: string; rest: string } | null {
  // «Бархатный персик», "Ice Grape"
  const quoted = text.match(/[«""]([^»""]{2,60})[»""]/)
  if (quoted) {
    return {
      flavor: quoted[1].trim(),
      rest: text.replace(quoted[0], ' '),
    }
  }

  // "с ароматом X" / "аромат X"
  const aromMatch = text.match(/с?\s*аромат(?:ом)?\s+([A-Za-zА-Яа-яЁё\s,()]+?)(?:[,.\s]\s*\d)/i)
  if (aromMatch) {
    const flavor = aromMatch[1].trim().replace(/[,\s]+$/, '')
    return {
      flavor,
      rest: text.replace(aromMatch[0], ' '),
    }
  }

  return null
}

// Очистка от типового мусора
function cleanName(text: string): string {
  return text
    .replace(/Табак\s+для\s+кальяна/i, ' ')
    .replace(/с\s+ароматом\s+/i, ' ')
    .replace(/[«""]/g, ' ')
    .replace(/[»""]/g, ' ')
    .replace(/,?\s*\d+\s*гр?\.?/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Главная функция парсинга
export function parseInvoiceText(rawText: string): ParsedSupplyItem[] {
  if (!rawText || !rawText.trim()) return []

  // Нормализуем переносы — одиночные \n внутри позиции склеиваем
  // Считаем что новая позиция начинается с номера + пробела
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // Склеиваем переносы строк внутри одной позиции
  // Эвристика: строка, начинающаяся с числа (1-3 цифры), — начало новой позиции
  // Если строка НЕ начинается с числа — это продолжение предыдущей
  const blocks: string[] = []
  let current = ''

  for (const line of lines) {
    const startsWithNumber = /^\d{1,3}[\s.]/.test(line)
    if (startsWithNumber && current) {
      blocks.push(current)
      current = line
    } else if (current) {
      // продолжение предыдущей
      current += ' ' + line
    } else {
      current = line
    }
  }
  if (current) blocks.push(current)

  const items: ParsedSupplyItem[] = []

  for (const block of blocks) {
    // Убираем начальный номер
    let text = block.replace(/^\d{1,3}[\s.]+/, ' ').trim()
    if (!text) continue

    // Извлекаем количество (цены/сумму игнорируем)
    const qtyResult = extractQuantity(text)
    text = qtyResult.rest.trim()

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
        const cleaned = cleanName(rest)
        if (cleaned) flavor = cleaned
      }

      // Если brand не нашли, но есть "Табак для кальяна X" — попытаемся brand взять из первого слова
      if (!brand) {
        const cleaned = cleanName(rest)
        const words = cleaned.split(/\s+/).filter(Boolean)
        if (words.length >= 1) {
          const first = words[0].toUpperCase()
          // Проверяем, похож ли он на бренд (3+ буквы, не "ТАБАК")
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
          quantity: qtyResult.quantity,
          unit: 'шт',
        })
      }
    } else {
      // Расходник
      const cleaned = cleanName(text)
      const unit = detectUnit(text)
      // packGrams для угля 1кг → 1000
      let packGrams: number | null = null
      const gramsFound = extractPackGrams(text)
      if (gramsFound && (unit === 'шт')) {
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
          quantity: qtyResult.quantity,
          unit: unit === 'шт' && packGrams ? 'кг' : unit,
        })
      }
    }
  }

  return items
}
