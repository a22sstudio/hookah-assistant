import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { parseInvoiceText, ParsedSupplyItem } from '@/lib/invoice-parser'
import { db } from '@/lib/db'

// POST /api/supplies/parse-text
// body: { text: string }
// → { items: ParsedSupplyItem[], warnings: string[] }
//
// Сначала regex-парсер (без ИИ, мгновенно, 100% офлайн).
// Опционально LLM дошлифовка — НЕ сейчас, оставляем простой парсер.
// В UI пользователь видит превью и правит руками перед сохранением.
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

  // ─── Fuzzy-матч с существующими табаками ───
  // Если позиция похожа на уже существующий табак — проставляем itemId
  const allTobaccos = await db.tobacco.findMany({
    select: { id: true, brand: true, line: true, flavor: true, defaultJarGrams: true },
  })

  const enriched: ParsedSupplyItem[] = parsed.map((item) => {
    if (item.itemType !== 'TOBACCO') return item

    const match = allTobaccos.find((t) => {
      const sameBrand = t.brand.toUpperCase() === item.brand.toUpperCase()
      const sameLine =
        t.line.toUpperCase() === item.line.toUpperCase() ||
        (!t.line && !item.line)
      const sameFlavor = t.flavor.toUpperCase() === item.flavor.toUpperCase()
      return sameBrand && sameLine && sameFlavor
    })

    return match && match.defaultJarGrams && !item.packGrams
      ? { ...item, packGrams: match.defaultJarGrams }
      : item
  })

  const warnings: string[] = []
  if (enriched.length === 0) {
    warnings.push('Не удалось распознать ни одной позиции. Скопируй текст накладной целиком.')
  } else {
    const withoutBrand = enriched.filter((i) => i.itemType === 'TOBACCO' && !i.brand).length
    if (withoutBrand > 0) {
      warnings.push(`${withoutBrand} поз. табака без бренда — проверь.`)
    }
    const withoutGrams = enriched.filter((i) => i.itemType === 'TOBACCO' && !i.packGrams).length
    if (withoutGrams > 0) {
      warnings.push(`${withoutGrams} поз. табака без веса — подставлен 250г по умолчанию при сохранении.`)
    }
  }

  return NextResponse.json({
    items: enriched,
    count: enriched.length,
    warnings,
  })
}
