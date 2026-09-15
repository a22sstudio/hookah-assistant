import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

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
        { error: 'Только старший может редактировать расходники' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// GET /api/consumables — список расходников
// ?active=true (по умолчанию true)
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const activeParam = searchParams.get('active')
  const active = activeParam === 'false' ? undefined : true

  const consumables = await db.consumable.findMany({
    where: active === undefined ? {} : { active },
    orderBy: [{ name: 'asc' }],
  })

  return NextResponse.json({
    consumables: consumables.map((c) => ({
      id: c.id,
      name: c.name,
      unit: c.unit,
      currentQty: c.currentQty,
      threshold: c.threshold,
      active: c.active,
      isLow: c.currentQty < c.threshold,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    total: consumables.length,
  })
}

// POST /api/consumables — создать расходник (только SENIOR)
export async function POST(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const { name, unit, currentQty, threshold } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name обязателен' }, { status: 400 })
  }

  const existing = await db.consumable.findFirst({ where: { name: name.trim() } })
  if (existing) {
    return NextResponse.json({ error: `Расходник "${name.trim()}" уже есть` }, { status: 409 })
  }

  const consumable = await db.consumable.create({
    data: {
      name: name.trim(),
      unit: typeof unit === 'string' && unit.trim() ? unit.trim() : 'шт',
      currentQty: typeof currentQty === 'number' && currentQty >= 0 ? currentQty : 0,
      threshold: typeof threshold === 'number' && threshold >= 0 ? threshold : 5,
    },
  })

  return NextResponse.json({
    consumable: {
      id: consumable.id,
      name: consumable.name,
      unit: consumable.unit,
      currentQty: consumable.currentQty,
      threshold: consumable.threshold,
      active: consumable.active,
      isLow: consumable.currentQty < consumable.threshold,
    },
  })
}

// PATCH /api/consumables — обновить расходник (только SENIOR)
export async function PATCH(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const { id, name, unit, currentQty, threshold, active } = body

  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  const existing = await db.consumable.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Расходник не найден' }, { status: 404 })
  }

  // Проверка уникальности имени при переименовании
  if (typeof name === 'string' && name.trim() !== existing.name) {
    const conflict = await db.consumable.findFirst({ where: { name: name.trim() } })
    if (conflict) {
      return NextResponse.json({ error: `Имя "${name.trim()}" уже занято` }, { status: 409 })
    }
  }

  const updateData: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) updateData.name = name.trim()
  if (typeof unit === 'string' && unit.trim()) updateData.unit = unit.trim()
  if (typeof currentQty === 'number' && currentQty >= 0) updateData.currentQty = currentQty
  if (typeof threshold === 'number' && threshold >= 0) updateData.threshold = threshold
  if (typeof active === 'boolean') updateData.active = active

  const updated = await db.consumable.update({ where: { id }, data: updateData })

  return NextResponse.json({
    consumable: {
      id: updated.id,
      name: updated.name,
      unit: updated.unit,
      currentQty: updated.currentQty,
      threshold: updated.threshold,
      active: updated.active,
      isLow: updated.currentQty < updated.threshold,
    },
  })
}

// DELETE /api/consumables — мягкое удаление (active=false) или полное (hard=true) (только SENIOR)
export async function DELETE(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const hard = searchParams.get('hard') === '1'

  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  if (hard) {
    await db.consumable.delete({ where: { id } })
  } else {
    await db.consumable.update({ where: { id }, data: { active: false } })
  }

  return NextResponse.json({ ok: true })
}
