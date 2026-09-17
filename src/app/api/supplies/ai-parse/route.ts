import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { pdfToText } from '@/lib/pdf-utils'
import { hfChat } from '@/lib/ai'

// Проверка SENIOR
async function requireSenior() {
  const me = await getCurrentMaster()
  if (!me) {
    return {
      error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }),
      me: null,
    }
  }
  if (me.role !== 'SENIOR') {
    return {
      error: NextResponse.json(
        { error: 'Только старший может парсить накладные' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

interface ParsedItem {
  itemType: string
  brand?: string | null
  line?: string | null
  flavor?: string | null
  name: string
  packGrams?: number | null
  quantity: number
  unit: string
}

// POST /api/supplies/ai-parse
// body: { pdfBase64 } — извлекает позиции из PDF накладной через AI
export async function POST(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const pdfBase64 = body?.pdfBase64
  if (typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    return NextResponse.json({ error: 'pdfBase64 обязателен' }, { status: 400 })
  }

  try {
    // Убираем data: префикс если есть
    const base64Data = pdfBase64.startsWith('data:')
      ? pdfBase64.split(',')[1] ?? ''
      : pdfBase64
    if (!base64Data) {
      return NextResponse.json({ error: 'Некорректный base64' }, { status: 400 })
    }

    const pdfBuffer = Buffer.from(base64Data, 'base64')
    const text = await pdfToText(pdfBuffer)
    if (!text.trim()) {
      return NextResponse.json({
        error: 'PDF не содержит текста (возможно, это скан изображения)',
      }, { status: 422 })
    }

    const items = await parseInvoiceWithAI(text)
    return NextResponse.json({ items, rawTextLength: text.length })
  } catch (e) {
    return NextResponse.json(
      { error: 'Не удалось обработать PDF', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

async function parseInvoiceWithAI(text: string): Promise<ParsedItem[]> {
  const prompt = `Ты парсишь накладную на кальянный табак и расходники.
Найди ВСЕ позиции табака и расходников в тексте накладной.

Для каждой позиции верни объект:
- itemType: "TOBACCO" или "CONSUMABLE" (угли, фольга, мундштуки — это CONSUMABLE)
- brand: бренд табака (например, Darkside). Для расходников — null.
- line: линейка (например, Core, Supernova). Если нет — null.
- flavor: вкус табака (например, Cola). Для расходников — null.
- name: полное наименование позиции (для расходников — название, например "Угли Cocourth 26мм")
- packGrams: вес одной банки/упаковки в граммах (число, например 250). Для расходников — null.
- quantity: количество банок/упаковок (целое число)
- unit: единица измерения ("банок" для табака, "упаковок"/"шт" для расходников)

Верни СТРОГО JSON массив без markdown:
[
  { "itemType": "TOBACCO", "brand": "Darkside", "line": "Core", "flavor": "Cola", "name": "Darkside Core Cola", "packGrams": 250, "quantity": 5, "unit": "банок" },
  { "itemType": "CONSUMABLE", "brand": null, "line": null, "flavor": null, "name": "Угли Cocourth 26мм", "packGrams": null, "quantity": 10, "unit": "упаковок" }
]`

  const content = await hfChat(
    [
      { role: 'user', content: `${prompt}\n\n--- ТЕКСТ НАКЛАДНОЙ ---\n${text}` },
    ],
    { maxTokens: 2000 },
  )

  let cleaned = content.trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  if (jsonMatch) cleaned = jsonMatch[0]

  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((i: ParsedItem) => i && typeof i.name === 'string' && i.name.trim())
      .map((i: ParsedItem) => ({
        itemType: i.itemType === 'CONSUMABLE' ? 'CONSUMABLE' : 'TOBACCO',
        brand: i.brand ?? null,
        line: i.line ?? null,
        flavor: i.flavor ?? null,
        name: i.name.trim(),
        packGrams: typeof i.packGrams === 'number' ? i.packGrams : null,
        quantity: typeof i.quantity === 'number' && i.quantity > 0 ? Math.floor(i.quantity) : 1,
        unit: typeof i.unit === 'string' && i.unit.trim() ? i.unit.trim() : 'шт',
      }))
  } catch {
    return []
  }
}
