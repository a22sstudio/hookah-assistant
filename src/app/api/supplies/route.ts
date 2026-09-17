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
        { error: 'Только старший может управлять поставками' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// GET /api/supplies — список поставок
// ?status=DRAFT|RECEIVED (без фильтра — все)
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const supplies = await db.supply.findMany({
    where: status ? { status } : undefined,
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({
    supplies: supplies.map((s) => ({
      id: s.id,
      status: s.status,
      note: s.note,
      createdAt: s.createdAt,
      receivedAt: s.receivedAt,
      itemsCount: s.items.length,
      totalQuantity: s.items.reduce((sum, it) => sum + it.quantity, 0),
      items: s.items.map((it) => ({
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
    total: supplies.length,
  })
}

// POST /api/supplies — создать поставку
// body: { note?, items: [{ itemType, itemId?, brand?, line?, flavor?, name, packGrams?, quantity, unit?, price? }] }
export async function POST(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const items = Array.isArray(body.items) ? body.items : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'Нет позиций в поставке' }, { status: 400 })
  }

  const supply = await db.supply.create({
    data: {
      status: 'DRAFT',
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
      items: {
        create: items.map((it: {
          itemType?: string
          itemId?: string | null
          brand?: string | null
          line?: string | null
          flavor?: string | null
          name?: string
          packGrams?: number | null
          quantity?: number
          unit?: string
        }) => {
          const itemType = it.itemType === 'CONSUMABLE' ? 'CONSUMABLE' : 'TOBACCO'
          // Для табака генерируем name из brand/line/flavor если он пустой
          let name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : ''
          if (!name && itemType === 'TOBACCO') {
            name = [it.brand, it.line, it.flavor].filter(Boolean).join(' ') || 'Без названия'
          } else if (!name) {
            name = 'Без названия'
          }
          return {
            itemType,
            itemId: it.itemId ?? null,
            brand: it.brand ?? null,
            line: it.line ?? null,
            flavor: it.flavor ?? null,
            name,
            packGrams: typeof it.packGrams === 'number' ? it.packGrams : null,
            quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1,
            unit: typeof it.unit === 'string' && it.unit.trim() ? it.unit.trim() : 'шт',
          }
        }),
      },
    },
    include: { items: true },
  })

  return NextResponse.json({
    supply: {
      id: supply.id,
      status: supply.status,
      itemsCount: supply.items.length,
    },
    message: `Поставка создана: ${supply.items.length} позиций`,
  })
}

// PATCH /api/supplies — обновить позиции поставки
// body: { id, items: [...] } — полная замена позиций
// body: { id, note } — обновить заметку
export async function PATCH(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const { id, items, note } = body

  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  }

  const existing = await db.supply.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Поставка не найдена' }, { status: 404 })
  }

  if (existing.status === 'RECEIVED') {
    return NextResponse.json(
      { error: 'Поставка уже принята. Редактирование запрещено.' },
      { status: 400 },
    )
  }

  // Обновление заметки
  if (typeof note === 'string' && !items) {
    const updated = await db.supply.update({
      where: { id },
      data: { note: note.trim() || null },
    })
    return NextResponse.json({ supply: updated })
  }

  // Полная замена позиций
  if (Array.isArray(items)) {
    await db.supplyItem.deleteMany({ where: { supplyId: id } })

    if (items.length > 0) {
      await db.supplyItem.createMany({
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
        }) => {
          const itemType = it.itemType === 'CONSUMABLE' ? 'CONSUMABLE' : 'TOBACCO'
          let name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : ''
          if (!name && itemType === 'TOBACCO') {
            name = [it.brand, it.line, it.flavor].filter(Boolean).join(' ') || 'Без названия'
          } else if (!name) {
            name = 'Без названия'
          }
          return {
            supplyId: id,
            itemType,
            itemId: it.itemId ?? null,
            brand: it.brand ?? null,
            line: it.line ?? null,
            flavor: it.flavor ?? null,
            name,
            packGrams: typeof it.packGrams === 'number' ? it.packGrams : null,
            quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1,
            unit: typeof it.unit === 'string' && it.unit.trim() ? it.unit.trim() : 'шт',
          }
        }),
      })
    }

    const updated = await db.supply.findUnique({
      where: { id },
      include: { items: true },
    })
    return NextResponse.json({ supply: updated, message: 'Поставка обновлена' })
  }

  return NextResponse.json({ error: 'Нужно указать items или note' }, { status: 400 })
}

// DELETE /api/supplies — удалить поставку
// ?id=xxx
export async function DELETE(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  const existing = await db.supply.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Поставка не найдена' }, { status: 404 })
  }

  if (existing.status === 'RECEIVED') {
    return NextResponse.json(
      { error: 'Нельзя удалить уже принятую поставку' },
      { status: 400 },
    )
  }

  await db.supply.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
