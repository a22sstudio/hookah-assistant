import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { parseInvoiceText, ParsedSupplyItem } from '@/lib/invoice-parser'
import { db } from '@/lib/db'

// POST /api/supplies/parse-text
// body: { text: string }
// → { items: ParsedSupplyItem[], warnings: string[] }
//
// Regex-парсер (без ИИ, мгновенно, 100% офлайн) + fuzzy-мэтч с базой табаков/расходников.
// Если позиция совпала с существующей — проставляем itemId, isMatch=true.
// Если нет — isNovelty=true (новинка, будет создана при приёмке поставки).
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const text = typeof body.text === 'string' ? body.text : ''

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

  // Normalize для сравнения: upper + trim + collapse spaces
  const norm = (s: string): string =>
    (s || '').toUpperCase().replace(/\s+/g, ' ').trim()

  // Для табака сравниваем brand+line+flavor
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
        && (!t.line || !lineN)  // у одного из них line пустой
    })
    if (match) return match

    // 3) Только brand совпадает, flavor похожий (содержит или содержится)
    match = allTobaccos.find((t) => {
      if (norm(t.brand) !== brandN) return false
      const tFlavor = norm(t.flavor)
      // если flavor полностью содержит или содержится в t.flavor
      return tFlavor && (tFlavor.includes(flavorN) || flavorN.includes(tFlavor))
    })
    if (match) return match

    return null
  }

  // Для расходника: точное совпадение по имени
  const findConsumableMatch = (item: ParsedSupplyItem) => {
    const nameN = norm(item.name)
    if (!nameN) return null

    // 1) Точное совпадение
    let match = allConsumables.find((c) => norm(c.name) === nameN)
    if (match) return match

    // 2) One is substring of the other
    match = allConsumables.find((c) => {
      const cName = norm(c.name)
      return cName && (cName.includes(nameN) || nameN.includes(cName))
    })
    if (match) return match

    return null
  }

  const enriched: ParsedSupplyItem[] = parsed.map((item) => {
    if (item.itemType === 'TOBACCO') {
      const match = findTobaccoMatch(item)
      if (match) {
        return {
          ...item,
          itemId: match.id,
          isMatch: true,
          isNovelty: false,
          // Подставляем packGrams из базы если не извлекли из текста
          packGrams: item.packGrams ?? match.defaultJarGrams,
        }
      }
      // Не найден в базе — новинка
      return { ...item, itemId: null, isMatch: false, isNovelty: true }
    }

    // Расходник
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
    warnings,
  })
}
