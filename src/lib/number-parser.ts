import 'server-only'

import { parseNumber, isFraction, normalize } from './normalize'

// ───────────────────────────────────────────
// Извлечение количества из текста.
// Поддерживает форматы:
//   «25г» / «25 г» / «25 грамм» / «25 гр»  → 25 грамм
//   «2б» / «2 б» / «2 банки» / «3 банок»   → 2 × defaultJarGrams (250) = 500г
//   «пол банки» / «треть» / «четверть»      → доля × 250
//   «двадцать пять»                          → 25 (словами)
//   «на донышке» / «почти пусто»            → 20г (defaultJarGrams * 0.08)
// ───────────────────────────────────────────

export interface ExtractedQuantity {
  grams: number | null
  banks: number | null
  isFraction: boolean
  raw: string
}

// Главная функция — извлекает количество и возвращает оставшийся текст
export function extractQuantity(
  text: string,
  defaultJarGrams: number = 250,
): { quantity: ExtractedQuantity | null; rest: string } {
  let normalized = normalize(text)
  let result: ExtractedQuantity | null = null
  let matchedText = ''

  // 1. «пол банки» / «треть» / «на донышке» — доли
  const fractionPatterns = [
    /(?:^|\s)(пол\s*банки|полбанки|половина|треть|четверть|четвёрть|на донышке|донышко|почти пусто|пусто|кончился|закончился)(?:\s|$)/,
  ]
  for (const pattern of fractionPatterns) {
    const match = normalized.match(pattern)
    if (match) {
      const fractionWord = match[1]
      const fractionVal = getFractionValue(fractionWord)
      if (fractionVal !== null) {
        const grams = Math.round(fractionVal * defaultJarGrams)
        result = { grams, banks: null, isFraction: true, raw: fractionWord }
        matchedText = match[0]
        normalized = normalized.replace(match[0], ' ').replace(/\s+/g, ' ').trim()
        return { quantity: result, rest: normalized }
      }
    }
  }

  // 2. «N банков» / «2 банки» / «3 банок» — банки
  const banksMatch = normalized.match(/(\d+|[а-я\s]+?)\s*(?:банок|банки|банку|банка|б|б\.)/i)
  if (banksMatch) {
    const numStr = banksMatch[1].trim()
    const num = parseNumber(numStr)
    if (num !== null && num > 0 && num < 100) {
      result = {
        grams: num * defaultJarGrams,
        banks: num,
        isFraction: false,
        raw: banksMatch[0].trim(),
      }
      matchedText = banksMatch[0]
      normalized = normalized.replace(banksMatch[0], ' ').replace(/\s+/g, ' ').trim()
      return { quantity: result, rest: normalized }
    }
  }

  // 3. «N грамм» / «N г» / «N гр» — граммы
  const gramsMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:грамм|гр|г|g)\b/i)
  if (gramsMatch) {
    const numStr = gramsMatch[1].replace(',', '.')
    const num = parseFloat(numStr)
    if (num >= 0 && num < 10000) {
      result = { grams: Math.round(num), banks: null, isFraction: false, raw: gramsMatch[0].trim() }
      matchedText = gramsMatch[0]
      normalized = normalized.replace(gramsMatch[0], ' ').replace(/\s+/g, ' ').trim()
      return { quantity: result, rest: normalized }
    }
  }

  // 4. Голое число «25» (может быть граммы или банки — пусть caller решает)
  const bareNumberMatch = normalized.match(/(?:^|\s)(\d+(?:[.,]\d+)?)(?:\s|$)/)
  if (bareNumberMatch) {
    const numStr = bareNumberMatch[1].replace(',', '.')
    const num = parseFloat(numStr)
    if (num >= 0 && num < 10000) {
      // Если число большое (>50) — скорее всего граммы
      // Если маленькое (1-10) — может быть банки
      result = {
        grams: num > 10 ? Math.round(num) : null,
        banks: num <= 10 ? num : null,
        isFraction: false,
        raw: bareNumberMatch[1],
      }
      normalized = normalized.replace(bareNumberMatch[0], ' ').replace(/\s+/g, ' ').trim()
      return { quantity: result, rest: normalized }
    }
  }

  // 5. Число словами «двадцать пять» / «сто двадцать пять»
  const wordNumberPatterns = [
    'двадцать пять', 'тридцать пять', 'сорок пять', 'пятьдесят пять',
    'сто двадцать пять', 'сто пятьдесят', 'двести пятьдесят',
    'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'сто', 'сто двадцать',
    'двести', 'триста', 'пять', 'десять', 'пятнадцать', 'двенадцать',
  ]
  for (const pattern of wordNumberPatterns) {
    if (normalized.includes(pattern)) {
      const num = parseNumber(pattern)
      if (num !== null) {
        result = { grams: num, banks: null, isFraction: false, raw: pattern }
        normalized = normalized.replace(pattern, ' ').replace(/\s+/g, ' ').trim()
        return { quantity: result, rest: normalized }
      }
    }
  }

  return { quantity: null, rest: normalized }
}

function getFractionValue(word: string): number | null {
  const map: Record<string, number> = {
    'пол банки': 0.5,
    'полбанки': 0.5,
    'половина': 0.5,
    'пол': 0.5,
    'треть': 0.33,
    'четверть': 0.25,
    'четвёрть': 0.25,
    'на донышке': 0.08,
    'донышко': 0.08,
    'почти пусто': 0.08,
    'пусто': 0,
    'кончился': 0,
    'закончился': 0,
  }
  return map[normalize(word)] ?? null
}
