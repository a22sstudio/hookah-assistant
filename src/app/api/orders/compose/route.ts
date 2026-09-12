import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/orders/compose — список всех PurchaseOrders с items
export async function GET() {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const orders = await db.purchaseOrder.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const result = orders.map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: o.items.map((it) => ({
      id: it.id,
      itemType: it.itemType,
      itemId: it.itemId,
      brand: it.brand,
      line: it.line,
      flavor: it.flavor,
      name: it.name,
      packGrams: it.packGrams,
      quantity: it.quantity,
      unit: it.unit,
    })),
  }))

  return NextResponse.json({ orders: result, canExport: me.role === 'SENIOR' })
}

// POST /api/orders/compose — создать новую заявку
// body: { items: [{ itemType, itemId?, brand?, line?, flavor?, name, packGrams?, quantity, unit }] }
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { items } = body as {
      items?: Array<{
        itemType?: string
        itemId?: string | null
        brand?: string | null
        line?: string | null
        flavor?: string | null
        name?: string
        packGrams?: number | null
        quantity?: number
        unit?: string
      }>
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Добавьте хотя бы одну позицию' },
        { status: 400 },
      )
    }

    // Валидация
    for (const [i, it] of items.entries()) {
      const itemType = String(it.itemType ?? '').toUpperCase()
      if (itemType !== 'TOBACCO' && itemType !== 'CONSUMABLE') {
        return NextResponse.json(
          { error: `Позиция ${i + 1}: тип должен быть TOBACCO или CONSUMABLE` },
          { status: 400 },
        )
      }
      const name = String(it.name ?? '').trim()
      if (!name) {
        return NextResponse.json(
          { error: `Позиция ${i + 1}: укажите наименование` },
          { status: 400 },
        )
      }
      const qty = Number(it.quantity ?? 0)
      if (!Number.isFinite(qty) || qty < 1) {
        return NextResponse.json(
          { error: `Позиция ${i + 1}: количество должно быть положительным` },
          { status: 400 },
        )
      }
    }

    // Создаём order с items
    const order = await db.purchaseOrder.create({
      data: {
        status: 'DRAFT',
        items: {
          create: items.map((it) => ({
            itemType: String(it.itemType ?? '').toUpperCase(),
            itemId: it.itemId?.trim() || null,
            brand: it.brand?.trim() || null,
            line: it.line?.trim() || null,
            flavor: it.flavor?.trim() || null,
            name: String(it.name ?? '').trim(),
            packGrams: typeof it.packGrams === 'number' ? it.packGrams : null,
            quantity: Number(it.quantity ?? 1),
            unit: String(it.unit ?? 'шт').trim() || 'шт',
          })),
        },
      },
      include: { items: true },
    })

    return NextResponse.json({
      order: {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        items: order.items,
      },
      message: `Создана заявка на закуп (${items.length} поз.)`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка создания', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// PATCH /api/orders/compose — сменить статус заявки
// body: { id, status: 'DRAFT' | 'SUBMITTED' | 'ORDERED' | 'RECEIVED' }
export async function PATCH(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, status } = body as { id?: string; status?: string }

    if (!id || !status) {
      return NextResponse.json(
        { error: 'id и status обязательны' },
        { status: 400 },
      )
    }

    const validStatuses = ['DRAFT', 'SUBMITTED', 'ORDERED', 'RECEIVED']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Неверный статус. Допустимо: ${validStatuses.join(', ')}` },
        { status: 400 },
      )
    }

    // Заказывать и получать — только старший
    if ((status === 'ORDERED' || status === 'RECEIVED') && me.role !== 'SENIOR') {
      return NextResponse.json(
        { error: 'Только старший может менять статус на ORDERED/RECEIVED' },
        { status: 403 },
      )
    }

    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!existing) {
      return NextResponse.json(
        { error: 'Заявка не найдена' },
        { status: 404 },
      )
    }

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status },
      include: { items: true },
    })

    return NextResponse.json({
      order: updated,
      message: `Статус: ${status}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка обновления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// DELETE /api/orders/compose — удалить заявку
// body: { id } или query ?id=xxx
export async function DELETE(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  let id = searchParams.get('id')

  if (!id) {
    try {
      const body = await req.json()
      id = body.id
    } catch {
      // ignore
    }
  }

  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  }

  const existing = await db.purchaseOrder.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json(
      { error: 'Заявка не найдена' },
      { status: 404 },
    )
  }

  // Удалять заявки может только старший
  if (me.role !== 'SENIOR') {
    return NextResponse.json(
      { error: 'Только старший может удалять заявки' },
      { status: 403 },
    )
  }

  await db.purchaseOrder.delete({ where: { id } })

  return NextResponse.json({ message: 'Заявка удалена' })
}
