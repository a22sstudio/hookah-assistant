import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { parseInvoiceText, ParsedSupplyItem } from '@/lib/invoice-parser'
import { parseInvoiceWithLLM } from '@/lib/ai'
import { db } from '@/lib/db'

// POST /api/supplies/parse-text
// body: { text: string, useLLM?: boolean }
// → { items: ParsedSupplyItem[], warnings: string[] }
//
// 1) Regex-парсер (мгновенно, офлайн) — основные позиции.
// 2) LLM-дошлифовка (опционально, через OpenRouter) — для позиций,
//    где regex не нашёл brand+flavor.
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const text = typeof body.text === 'string' ? body.text : ''
  const useLLM = body.useLLM !== false // по умолчанию включён

  if (!text.trim()) {
    return NextResponse.json({ error: 'Пустой текст' }, { status: 400 })
  }

  // ─── Слой 1: regex-парсер ───
  const parsed = parseInvoiceText(text)

  if (parsed.length === 0) {
    return NextResponse.json({
      items: [],
      count: 0,
      warnings: ['Не удалось распознать ни одной позиции. Скопируй текст накладной целиком.'],
    })
  }

  // ─── Слой 2: Fuzzy-мэтч с базой ───
  const [allTobaccos, allConsumables] = await Promise.all([
    db.tobacco.findMany({
      select: {
        id: true,
        brand: true,
        line: true,
        flavor: true,
        defaultJarGrams: true,
        active: true,
      },
    }),
    db.consumable.findMany({
      select: { id: true, name: true, unit: true, active: true },
    }),
  ])

  const norm = (s: string): string =>
    (s || '').toUpperCase().replace(/\s+/g, ' ').trim()

  const findTobaccoMatch = (item: ParsedSupplyItem) => {
    const brandN = norm(item.brand)
    const lineN = norm(item.line)
    const flavorN = norm(item.flavor)

    if (!brandN || !flavorN) return null

    // 1) Точное совпадение по brand + line + flavor
    let match = allTobaccos.find((t) => {
      return norm(t.brand) === brandN
        && norm(t.line) === lineN
        && norm(t.flavor) === flavorN
    })
    if (match) return match

    // 2) Совпадение по brand + flavor (без линии)
    match = allTobaccos.find((t) => {
      return norm(t.brand) === brandN
        && norm(t.flavor) === flavorN
        && (!t.line || !lineN)
    })
    if (match) return match

    // 3) Brand совпадает, flavor содержит или содержится
    match = allTobaccos.find((t) => {
      if (norm(t.brand) !== brandN) return false
      const tFlavor = norm(t.flavor)
      return tFlavor && (tFlavor.includes(flavorN) || flavorN.includes(tFlavor))
    })
    if (match) return match

    return null
  }

  const findConsumableMatch = (item: ParsedSupplyItem) => {
    const nameN = norm(item.name)
    if (!nameN) return null

    let match = allConsumables.find((c) => norm(c.name) === nameN)
    if (match) return match

    match = allConsumables.find((c) => {
      const cName = norm(c.name)
      return cName && (cName.includes(nameN) || nameN.includes(cName))
    })
    if (match) return match

    return null
  }

  let enriched: ParsedSupplyItem[] = parsed.map((item) => {
    if (item.itemType === 'TOBACCO') {
      const match = findTobaccoMatch(item)
      if (match) {
        return {
          ...item,
          itemId: match.id,
          isMatch: true,
          isNovelty: false,
          packGrams: item.packGrams ?? match.defaultJarGrams,
        }
      }
      return { ...item, itemId: null, isMatch: false, isNovelty: true }
    }

    const match = findConsumableMatch(item)
    if (match) {
      return {
        ...item,
        itemId: match.id,
        isMatch: true,
        isNovelty: false,
      }
    }
    return { ...item, itemId: null, isMatch: false, isNovelty: true }
  })

  // ─── Слой 3: LLM-дошлифовка для проблемных позиций ───
  // Отправляем в LLM только позиции, где brand ИЛИ flavor пустые, либо распознаны плохо.
  const problemItems = enriched
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (item.itemType !== 'TOBACCO') return false
      // нет brand или нет flavor → не распознан полностью
      return !item.brand || !item.flavor || item.flavor.length < 2
    })

  if (useLLM && problemItems.length > 0) {
    try {
      const llmResults = await parseInvoiceWithLLM(
        problemItems.map(({ item }) => ({
          rawText: item.rawText || item.name,
          index: 0,
        })),
      )

      // Применяем LLM-результаты: заменяем проблемные позиции
      problemItems.forEach(({ item, idx }, i) => {
        const llmItem = llmResults[i]?.item
        if (llmItem && (llmItem.brand || llmItem.flavor || llmItem.name)) {
          // Заменяем позицию данными от LLM, сохраняя quantity если LLM не дал
          const merged: ParsedSupplyItem = {
            ...item,
            itemType: llmItem.itemType,
            brand: llmItem.brand || item.brand,
            line: llmItem.line || item.line,
            flavor: llmItem.flavor || item.flavor,
            name: llmItem.name || item.name,
            packGrams: llmItem.packGrams ?? item.packGrams,
            quantity: llmItem.quantity || item.quantity,
            unit: llmItem.unit || item.unit,
          }

          // Повторно ищем матч с базой для LLM-результата
          if (merged.itemType === 'TOBACCO') {
            const match = findTobaccoMatch(merged)
            if (match) {
              merged.itemId = match.id
              merged.isMatch = true
              merged.isNovelty = false
              merged.packGrams = merged.packGrams ?? match.defaultJarGrams
            } else {
              merged.itemId = null
              merged.isMatch = false
              merged.isNovelty = true
            }
          } else {
            const match = findConsumableMatch(merged)
            if (match) {
              merged.itemId = match.id
              merged.isMatch = true
              merged.isNovelty = false
            } else {
              merged.itemId = null
              merged.isMatch = false
              merged.isNovelty = true
            }
          }

          enriched[idx] = merged
        }
      })
    } catch (e) {
      console.error('LLM fallback error:', (e as Error).message)
      // Не падаем — возвращаем что есть
    }
  }

  const warnings: string[] = []
  const noveltyCount = enriched.filter((i) => i.isNovelty).length
  if (noveltyCount > 0) {
    warnings.push(`${noveltyCount} поз. — новые (нет на складе). Будут созданы при принятии поставки.`)
  }

  const withoutBrand = enriched.filter(
    (i) => i.itemType === 'TOBACCO' && !i.brand,
  ).length
  if (withoutBrand > 0) {
    warnings.push(`${withoutBrand} поз. табака без бренда — проверь.`)
  }

  const withoutGrams = enriched.filter(
    (i) => i.itemType === 'TOBACCO' && !i.packGrams,
  ).length
  if (withoutGrams > 0) {
    warnings.push(`${withoutGrams} поз. табака без веса — подставлен 250г по умолчанию при сохранении.`)
  }

  return NextResponse.json({
    items: enriched,
    count: enriched.length,
    matchedCount: enriched.filter((i) => i.isMatch).length,
    noveltyCount,
    llmUsed: useLLM && problemItems.length > 0,
    warnings,
  })
}
