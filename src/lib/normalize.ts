import 'server-only'


// ───────────────────────────────────────────
// Нормализация текста для fuzzy search.
// Используется в intent-parser и fuzzy-search.
// ───────────────────────────────────────────

// Алиасы брендов — все варианты написания → каноничное
const BRAND_ALIASES: Record<string, string> = {
  // Black Burn
  'blackburn': 'Black Burn',
  'black burn': 'Black Burn',
  'блэк берн': 'Black Burn',
  'блэкберн': 'Black Burn',
  'блэкборн': 'Black Burn',
  'блекберн': 'Black Burn',
  'блек берн': 'Black Burn',
  // Darkside
  'дарксайд': 'DARKSIDE',
  'darkside': 'DARKSIDE',
  'dark side': 'DARKSIDE',
  'дарк сайд': 'DARKSIDE',
  'дарксайде': 'DARKSIDE',
  // Tangiers
  'танж': 'Tangiers',
  'танжирс': 'Tangiers',
  'танжерс': 'Tangiers',
  'tangiers': 'Tangiers',
  'tangier': 'Tangiers',
  // Musthave
  'мастхэв': 'Musthave',
  'мастхэве': 'Musthave',
  'musthave': 'Musthave',
  'must have': 'Musthave',
  'мустхэв': 'Musthave',
  // Сарма
  'сарма': 'Сарма',
  'sarma': 'Сарма',
  // Black Burn (варианты)
  'берн': 'Black Burn',
  'бёрн': 'Black Burn',
  'берна': 'Black Burn',
  'бёрна': 'Black Burn',
  'берном': 'Black Burn',
  'бёрном': 'Black Burn',
  'берну': 'Black Burn',
  // Sebero
  'себеро': 'Sebero',
  'sebero': 'Sebero',
  // Jent
  'джент': 'Jent',
  'jent': 'Jent',
  // Deus
  'деус': 'Deus',
  'deus': 'Deus',
  // Overdose
  'овердоз': 'Overdose',
  'overdose': 'Overdose',
  // Element
  'элемент': 'Element',
  'element': 'Element',
  // Chabacco
  'чабакко': 'Chabacco',
  'chabacco': 'Chabacco',
  // Bonche
  'бонче': 'Bonche',
  'bonche': 'Bonche',
  // Trofimoff
  'трофимов': "Trofimoff's",
  'trofimoff': "Trofimoff's",
  'трофимовс': "Trofimoff's",
  // Satyr
  'сатир': 'Satyr',
  'satyr': 'Satyr',
  // Brusko
  'бруско': 'Brusko',
  'brusko': 'Brusko',
  // Догма
  'догма': 'Догма',
  // Nаш
  'наш': 'Nаш',
  'nаш': 'Nаш',
  // Spectrum
  'спектрум': 'Spectrum',
  'spectrum': 'Spectrum',
  // Sapphire Crown
  'сапфир': 'Sapphire Crown',
  'sapphire': 'Sapphire Crown',
}

// Нормализация: ё→е, lowercase, удаление пунктуации, схлопывание пробелов
export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\wа-я\s\-\/]/g, ' ')  // оставляем буквы, цифры, дефис, слеш
    .replace(/\s+/g, ' ')
    .trim()
}

// Найти бренд в тексте по алиасу (с word-boundary, не substring)
export function findBrandInText(text: string): { brand: string | null; rest: string } {
  const normalized = normalize(text)
  
  // Сортируем алиасы по длине (длинные первыми) — чтобы «black burn» не побеждал «burn»
  const sortedAliases = Object.entries(BRAND_ALIASES).sort((a, b) => b[0].length - a[0].length)
  
  for (const [alias, canonical] of sortedAliases) {
    const aliasNorm = normalize(alias)
    // Word-boundary: алиас должен быть отдельным словом/фразой, не частью другого слова
    // Используем regex с границами слов (\b) + поддержкой кириллицы
    const pattern = new RegExp(`(^|\\s)${escapeRegex(aliasNorm)}(\\s|$)`, 'i')
    const match = normalized.match(pattern)
    if (match) {
      // Удаляем найденный алиас из текста
      const rest = normalized.replace(match[0], ' ').replace(/\s+/g, ' ').trim()
      return { brand: canonical, rest }
    }
  }
  
  return { brand: null, rest: normalized }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Получить каноничное имя бренда по любому варианту
export function canonicalBrand(brand: string): string {
  const normalized = normalize(brand)
  return BRAND_ALIASES[normalized] || brand
}

// Levenshtein distance — для опечаток
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,        // deletion
        dp[i][j - 1] + 1,        // insertion
        dp[i - 1][j - 1] + cost, // substitution
      )
    }
  }
  
  return dp[m][n]
}

// Проверить, является ли строка числом (с учётом слов)
export function isNumeric(s: string): boolean {
  if (!s) return false
  return /^\d+$/.test(s) || NUM_WORD_MAP[s] !== undefined
}

// Словарь чисел словами
const NUM_WORD_MAP: Record<string, number> = {
  'ноль': 0, 'ноля': 0,
  'один': 1, 'одна': 1, 'одну': 1,
  'два': 2, 'две': 2,
  'три': 3,
  'четыре': 4,
  'пять': 5,
  'шесть': 6,
  'семь': 7,
  'восемь': 8,
  'девять': 9,
  'десять': 10,
  'одиннадцать': 11,
  'двенадцать': 12,
  'тринадцать': 13,
  'четырнадцать': 14,
  'пятнадцать': 15,
  'шестнадцать': 16,
  'семнадцать': 17,
  'восемнадцать': 18,
  'девятнадцать': 19,
  'двадцать': 20,
  'тридцать': 30,
  'сорок': 40,
  'пятьдесят': 50,
  'шестьдесят': 60,
  'семьдесят': 70,
  'восемьдесят': 80,
  'девяносто': 90,
  'сто': 100,
  'двести': 200,
  'триста': 300,
  'четыреста': 400,
  'пятьсот': 500,
  // Составные числа (как «двадцать пять»)
  'двадцать пять': 25,
  'тридцать пять': 35,
  'сорок пять': 45,
  'пятьдесят пять': 55,
  'сто двадцать': 120,
  'сто двадцать пять': 125,
  'сто пятьдесят': 150,
  'двести пятьдесят': 250,
}

// Доли для «пол банки», «треть», «четверть»
const FRACTION_MAP: Record<string, number> = {
  'пол': 0.5,
  'половина': 0.5,
  'полбанки': 0.5,
  'треть': 0.33,
  'четверть': 0.25,
  'четвёрть': 0.25,
  'на донышке': 0.08,  // ~20г от 250
  'донышко': 0.08,
  'почти пусто': 0.08,
  'пусто': 0,
  'кончился': 0,
  'закончился': 0,
  'нету': 0,
}

// Получить число из текстового представления
export function parseNumber(word: string): number | null {
  if (!word) return null
  // Цифрами
  if (/^\d+$/.test(word)) return parseInt(word, 10)
  // Десятичная дробь
  if (/^\d+[.,]\d+$/.test(word)) return parseFloat(word.replace(',', '.'))
  // Словами
  const normalized = normalize(word)
  if (NUM_WORD_MAP[normalized] !== undefined) return NUM_WORD_MAP[normalized]
  if (FRACTION_MAP[normalized] !== undefined) return FRACTION_MAP[normalized]
  return null
}

// Проверить является ли слово долей
export function isFraction(word: string): boolean {
  return FRACTION_MAP[normalize(word)] !== undefined
}
