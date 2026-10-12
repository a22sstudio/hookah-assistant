import 'server-only'

import { db } from '@/lib/db'
import { normalize, levenshtein, findBrandInText } from './normalize'

// ───────────────────────────────────────────
// Fuzzy search табака по тексту.
// Возвращает совпадения с confidence score.
// ───────────────────────────────────────────

export interface TobaccoMatch {
  tobacco: {
    id: string
    brand: string
    line: string
    flavor: string
    defaultJarGrams: number
    currentGrams: number
  }
  score: number
  matchType: 'exact' | 'flavor_contains' | 'brand_flavor' | 'fuzzy' | 'word_match'
}

export interface SearchResult {
  status: 'single' | 'multiple' | 'ambiguous' | 'not_found' | 'suggest'
  matches: TobaccoMatch[]
  query: string
}

// Главная функция — поиск табака по тексту
export async function fuzzySearchTobacco(query: string): Promise<SearchResult> {
  // Загружаем все активные табаки (с кэшем на 30 сек)
  const tobaccos = await getAllTobaccos()
  
  if (tobaccos.length === 0) {
    return { status: 'not_found', matches: [], query }
  }
  
  // Извлекаем бренд из запроса
  const { brand, rest } = findBrandInText(query)
  const normalizedQuery = normalize(rest || query)
  
  // Если запрос пустой после извлечения бренда
  if (!normalizedQuery) {
    return { status: 'not_found', matches: [], query }
  }
  
  // Считаем score для каждого табака
  const scored = tobaccos.map(t => {
    const tobaccoNorm = {
      brand: normalize(t.brand),
      line: normalize(t.line),
      flavor: normalize(t.flavor),
    }
    
    let score = 0
    let matchType: TobaccoMatch['matchType'] = 'fuzzy'
    
    // Фильтруем по бренду если он указан
    if (brand && tobaccoNorm.brand !== normalize(brand)) {
      return { tobacco: t, score: 0, matchType }
    }
    
    const fullFlavor = `${tobaccoNorm.flavor} ${tobaccoNorm.line}`.trim()
    
    // 1. Точное совпадение flavor
    if (normalizedQuery === tobaccoNorm.flavor) {
      score = 100
      matchType = 'exact'
    }
    // 2. Точное совпадение flavor + line
    else if (normalizedQuery === fullFlavor || normalizedQuery === `${tobaccoNorm.line} ${tobaccoNorm.flavor}`.trim()) {
      score = 100
      matchType = 'exact'
    }
    // 3. Запрос содержит flavor целиком
    else if (tobaccoNorm.flavor.length > 2 && (
      normalizedQuery.includes(tobaccoNorm.flavor) || 
      tobaccoNorm.flavor.includes(normalizedQuery)
    )) {
      score = 90
      matchType = 'flavor_contains'
    }
    // 4. Запрос содержит бренд + часть flavor
    else if (brand && normalizedQuery.includes(tobaccoNorm.flavor.split(' ')[0])) {
      score = 85
      matchType = 'brand_flavor'
    }
    // 5. Совпадение слов (более мягкое)
    else {
      const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2)
      const flavorWords = tobaccoNorm.flavor.split(/[\s\/,]+/).filter(w => w.length > 2)
      
      const commonWords = queryWords.filter(qw => 
        flavorWords.some(fw => 
          fw === qw || fw.includes(qw) || qw.includes(fw)
        )
      )
      
      if (commonWords.length > 0) {
        score = 70 + commonWords.length * 5
        matchType = 'word_match'
      }
    }
    
    // 6. Levenshtein для опечаток
    if (score < 70) {
      const dist = levenshtein(normalizedQuery, tobaccoNorm.flavor)
      if (dist <= 3 && tobaccoNorm.flavor.length > 3) {
        const fuzzyScore = 80 - dist * 5
        if (fuzzyScore > score) {
          score = fuzzyScore
          matchType = 'fuzzy'
        }
      }
      
      // Также проверяем отдельные слова flavor
      const flavorWords = tobaccoNorm.flavor.split(/[\s\/,]+/).filter(w => w.length > 2)
      for (const fw of flavorWords) {
        const distW = levenshtein(normalizedQuery, fw)
        if (distW <= 2) {
          const fuzzyScore = 75 - distW * 5
          if (fuzzyScore > score) {
            score = fuzzyScore
            matchType = 'fuzzy'
          }
        }
      }
    }
    
    return {
      tobacco: {
        id: t.id,
        brand: t.brand,
        line: t.line,
        flavor: t.flavor,
        defaultJarGrams: t.defaultJarGrams,
        currentGrams: t.stock?.currentGrams ?? 0,
      },
      score,
      matchType,
    }
  })
  
  // Фильтруем по минимальному score
  const matches = scored
    .filter(m => m.score >= 50)
    .sort((a, b) => b.score - a.score)
  
  if (matches.length === 0) {
    return { status: 'not_found', matches: [], query }
  }
  
  // 1 совпадение с высоким score → single
  if (matches.length === 1 && matches[0].score >= 85) {
    return { status: 'single', matches, query }
  }
  
  // Если топ-1 значительно лучше топ-2 (>15 очков) → single
  if (matches.length >= 1 && matches[0].score >= 85) {
    const second = matches[1]
    if (!second || matches[0].score - second.score > 15) {
      return { status: 'single', matches: [matches[0]], query }
    }
  }
  
  // 2-5 совпадений → ambiguous (нужно уточнить)
  if (matches.length >= 2 && matches.length <= 5) {
    return { status: 'ambiguous', matches, query }
  }
  
  // 1 совпадение с низким score → suggest (переспросить)
  if (matches.length === 1 && matches[0].score < 85) {
    return { status: 'suggest', matches, query }
  }
  
  // Много совпадений → ambiguous (top 5)
  return {
    status: 'ambiguous',
    matches: matches.slice(0, 5),
    query,
  }
}

// Кэш табаков (30 сек)
let cache: { data: Array<{ id: string; brand: string; line: string; flavor: string; defaultJarGrams: number; stock: { currentGrams: number } | null }>; time: number } | null = null
const CACHE_TTL = 30_000 // 30 сек

async function getAllTobaccos() {
  if (cache && Date.now() - cache.time < CACHE_TTL) {
    return cache.data
  }
  
  const tobaccos = await db.tobacco.findMany({
    where: { active: true },
    include: { stock: true },
    orderBy: [{ brand: 'asc' }, { line: 'asc' }, { flavor: 'asc' }],
  })
  
  cache = {
    data: tobaccos,
    time: Date.now(),
  }
  
  return tobaccos
}

// Найти похожие бренды (для подсказки при не найденном табаке)
export async function findSimilarBrands(query: string): Promise<string[]> {
  const tobaccos = await getAllTobaccos()
  const normalizedQuery = normalize(query)
  
  const brands = new Set<string>()
  for (const t of tobaccos) {
    const brandNorm = normalize(t.brand)
    const dist = levenshtein(normalizedQuery, brandNorm)
    if (dist <= 3 || brandNorm.includes(normalizedQuery) || normalizedQuery.includes(brandNorm)) {
      brands.add(t.brand)
    }
  }
  
  return Array.from(brands).slice(0, 5)
}
