import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// Проверка старшего мастера (cookie-auth, SENIOR only)
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
        { error: 'Только старший мастер может управлять расходниками' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

function mapItem(c: {
  id: string
  name: string
  unit: string
  currentQty: number
  threshold: number
  active: boolean
}) {
  return {
    id: c.id,
    name: c.name,
    unit: c.unit,
    currentQty: c.currentQty,
    threshold: c.threshold,
    isLow: c.currentQty < c.threshold,
  }
}

// GET /api/consumables — список активных расходников, отсортированных по имени
// Доступ: любой залогиненный (старший и мастер видят, но запись/удаление — SENIOR)
export async function GET() {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const items = await db.consumable.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    consumables: items.map(mapItem),
    canEdit: me.role === 'SENIOR',
  })
}

// POST /api/consumables — создать расходник { name, unit?, threshold? } — SENIOR only
export async function POST(req: NextRequest) {
  const { error } = await requireSenior()
  if (error) return error

  try {
    const body = await req.json()
    const { name, unit, threshold } = body as {
      name?: string
      unit?: string
      threshold?: number
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Введите название' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Уникальность среди активных
    const exists = await db.consumable.findFirst({
      where: { name: trimmedName, active: true },
    })
    if (exists) {
      return NextResponse.json(
        { error: `Расходник «${trimmedName}» уже существует` },
        { status: 400 },
      )
    }

    const created = await db.consumable.create({
      data: {
        name: trimmedName,
        unit: unit && String(unit).trim() ? String(unit).trim() : 'шт',
        threshold:
          typeof threshold === 'number' && threshold >= 0 ? threshold : 5,
        currentQty: 0,
      },
    })

    return NextResponse.json({
      consumable: mapItem(created),
      message: `Расходник «${created.name}» добавлен`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка создания', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// PATCH /api/consumables — обновить { id, name?, unit?, currentQty?, threshold? } — SENIOR only
// Если currentQty меняется — просто обновляем (simple log: через updatedAt)
export async function PATCH(req: NextRequest) {
  const { error } = await requireSenior()
  if (error) return error

  try {
    const body = await req.json()
    const { id, name, unit, currentQty, threshold } = body as {
      id?: string
      name?: string
      unit?: string
      currentQty?: number
      threshold?: number
    }

    if (!id) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    const item = await db.consumable.findUnique({ where: { id } })
    if (!item || !item.active) {
      return NextResponse.json(
        { error: 'Расходник не найден' },
        { status: 404 },
      )
    }

    const data: Record<string, unknown> = {}

    if (typeof name === 'string' && name.trim() && name.trim() !== item.name) {
      const trimmedName = name.trim()
      const dup = await db.consumable.findFirst({
        where: { name: trimmedName, active: true, NOT: { id } },
      })
      if (dup) {
        return NextResponse.json(
          { error: `Имя «${trimmedName}» уже используется` },
          { status: 400 },
        )
      }
      data.name = trimmedName
    }

    if (typeof unit === 'string' && unit.trim()) {
      data.unit = unit.trim()
    }

    if (typeof currentQty === 'number' && currentQty >= 0) {
      data.currentQty = currentQty
    }

    if (typeof threshold === 'number' && threshold >= 0) {
      data.threshold = threshold
    }

    const updated = await db.consumable.update({
      where: { id },
      data,
    })

    return NextResponse.json({
      consumable: mapItem(updated),
      message: `Сохранено: ${updated.name}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка обновления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// DELETE /api/consumables — soft delete (active: false) — SENIOR only
// ?id=<itemId>
export async function DELETE(req: NextRequest) {
  const { error } = await requireSenior()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  }

  const item = await db.consumable.findUnique({ where: { id } })
  if (!item) {
    return NextResponse.json({ error: 'Расходник не найден' }, { status: 404 })
  }

  await db.consumable.update({ where: { id }, data: { active: false } })

  return NextResponse.json({
    message: `Расходник «${item.name}» удалён`,
  })
}
