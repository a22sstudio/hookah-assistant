import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

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
        { error: 'Только старший может управлять заказами' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// GET /api/purchase-orders — список заказов на закуп
// ?status=SUBMITTED (по умолчанию — все)
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const orders = await db.purchaseOrder.findMany({
    where: status ? { status } : undefined,
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      isMerged: o.isMerged,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      itemsCount: o.items.length,
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
    })),
    total: orders.length,
  })
}

// POST /api/purchase-orders — создать заказ (только SENIOR)
// body: { items: [{ itemType, itemId?, brand?, line?, flavor?, name, packGrams?, quantity, unit }] }
//      | { mergeFrom: [orderId1, orderId2, ...] } — объединить несколько заказов в один
export async function POST(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()

  // ─── Режим объединения нескольких заказов ───
  if (Array.isArray(body.mergeFrom) && body.mergeFrom.length > 0) {
    const sourceOrders = await db.purchaseOrder.findMany({
      where: { id: { in: body.mergeFrom } },
      include: { items: true },
    })

    if (sourceOrders.length === 0) {
      return NextResponse.json({ error: 'Не найдено исходных заказов' }, { status: 404 })
    }

    // Создаём новый объединённый заказ
    const merged = await db.purchaseOrder.create({
      data: {
        status: 'ORDERED',
        isMerged: true,
        items: {
          create: sourceOrders.flatMap((o) =>
            o.items.map((it) => ({
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
          ),
        },
      },
      include: { items: true },
    })

    // Удаляем исходные заказы (не помечаем как MERGED — они больше не нужны)
    await db.purchaseOrder.deleteMany({
      where: { id: { in: body.mergeFrom } },
    })

    return NextResponse.json({
      order: {
        id: merged.id,
        status: merged.status,
        isMerged: merged.isMerged,
        itemsCount: merged.items.length,
      },
      message: `Объединено ${sourceOrders.length} заказов в один (${merged.items.length} позиций)`,
    })
  }

  // ─── Обычное создание ───
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: 'Нет позиций в заказе' }, { status: 400 })
  }

  const status = typeof body.status === 'string' ? body.status : 'SUBMITTED'

  const order = await db.purchaseOrder.create({
    data: {
      status,
      isMerged: false,
      items: {
        create: items.map((it: {
          itemType?: string
          itemId?: string
          brand?: string
          line?: string
          flavor?: string
          name?: string
          packGrams?: number | null
          quantity?: number
          unit?: string
        }) => ({
          itemType: it.itemType === 'CONSUMABLE' ? 'CONSUMABLE' : 'TOBACCO',
          itemId: it.itemId ?? null,
          brand: it.brand ?? null,
          line: it.line ?? null,
          flavor: it.flavor ?? null,
          name: typeof it.name === 'string' && it.name.trim() ? it.name.trim() : 'Без названия',
          packGrams: typeof it.packGrams === 'number' ? it.packGrams : null,
          quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1,
          unit: typeof it.unit === 'string' && it.unit.trim() ? it.unit.trim() : 'шт',
        })),
      },
    },
    include: { items: true },
  })

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      isMerged: order.isMerged,
      itemsCount: order.items.length,
    },
    message: `Заказ создан: ${order.items.length} позиций`,
  })
}

// PATCH /api/purchase-orders — сменить статус ИЛИ обновить позиции
// body: { id, status } — сменить статус
// body: { id, items: [...] } — полностью заменить позиции
export async function PATCH(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const { id, status, items } = body

  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  }

  const existing = await db.purchaseOrder.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  // Меняем статус
  if (status && !items) {
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status },
    })
    return NextResponse.json({ order: updated })
  }

  // Обновляем позиции (полная замена)
  if (Array.isArray(items)) {
    // Удаляем старые позиции
    await db.purchaseOrderItem.deleteMany({ where: { orderId: id } })

    // Создаём новые
    if (items.length > 0) {
      await db.purchaseOrderItem.createMany({
        data: items.map((it: {
          itemType?: string
          itemId?: string | null
          brand?: string | null
          line?: string | null
          flavor?: string | null
          name?: string
          packGrams?: number | null
          quantity?: number
          unit?: string
        }) => ({
          orderId: id,
          itemType: it.itemType === 'CONSUMABLE' ? 'CONSUMABLE' : 'TOBACCO',
          itemId: it.itemId ?? null,
          brand: it.brand ?? null,
          line: it.line ?? null,
          flavor: it.flavor ?? null,
          name: typeof it.name === 'string' && it.name.trim() ? it.name.trim() : 'Без названия',
          packGrams: typeof it.packGrams === 'number' ? it.packGrams : null,
          quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1,
          unit: typeof it.unit === 'string' && it.unit.trim() ? it.unit.trim() : 'шт',
        })),
      })
    }

    const updated = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    })
    return NextResponse.json({ order: updated, message: 'Заказ обновлён' })
  }

  return NextResponse.json({ error: 'Нужно указать status или items' }, { status: 400 })
}

// DELETE /api/purchase-orders — удалить заказ (только SENIOR)
// ?id=xxx
export async function DELETE(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  await db.purchaseOrder.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
