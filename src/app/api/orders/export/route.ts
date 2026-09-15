import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/orders/export?id=xxx&format=csv
// Экспорт заказа на закуп (PurchaseOrder) в формате CSV.
// Только SENIOR. Минимальный формат — позиция + количество + дата.
//
// Формат:
// ЗАКАЗ ОТ 2026-09-15
//
// ТАБАК:
// Бренд,Линейка,Вкус,Граммовка,Количество,Единица
// Darkside,Core,Cola,250,5,банок
//
// РАСХОДНИКИ:
// Наименование,Количество,Единица
// Угли Cocourth 26мм,3,упаковок
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший может экспортировать заказы' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const format = (searchParams.get('format') || 'csv').toLowerCase()

  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  }

  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  })

  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  const dateStr = new Date(order.createdAt).toISOString().slice(0, 10)

  if (format !== 'csv') {
    return NextResponse.json({ error: 'Поддерживается только format=csv' }, { status: 400 })
  }

  const tobaccoItems = order.items.filter((i) => i.itemType === 'TOBACCO')
  const consumableItems = order.items.filter((i) => i.itemType === 'CONSUMABLE')

  const lines: string[] = []
  lines.push(`ЗАКАЗ ОТ ${dateStr}`)
  lines.push('')

  if (tobaccoItems.length > 0) {
    lines.push('ТАБАК:')
    lines.push('Бренд,Линейка,Вкус,Граммовка,Количество,Единица')
    for (const it of tobaccoItems) {
      const brand = escapeCsv(it.brand ?? '')
      const line = escapeCsv(it.line ?? '')
      const flavor = escapeCsv(it.flavor ?? '')
      const packGrams = it.packGrams ?? ''
      const qty = it.quantity
      // Для табака единицу "шт" превращаем в "банок" если есть граммовка
      let unit = it.unit
      if (it.packGrams && (unit === 'шт' || unit === 'уп')) unit = 'банок'
      lines.push(`${brand},${line},${flavor},${packGrams},${qty},${escapeCsv(unit)}`)
    }
    lines.push('')
  }

  if (consumableItems.length > 0) {
    lines.push('РАСХОДНИКИ:')
    lines.push('Наименование,Количество,Единица')
    for (const it of consumableItems) {
      lines.push(`${escapeCsv(it.name)},${it.quantity},${escapeCsv(it.unit)}`)
    }
    lines.push('')
  }

  if (tobaccoItems.length === 0 && consumableItems.length === 0) {
    lines.push('(нет позиций)')
  }

  // BOM для Excel + правильный перенос строк
  const csv = '\ufeff' + lines.join('\r\n')
  const filename = `order-${dateStr}-${order.id.slice(-6)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
