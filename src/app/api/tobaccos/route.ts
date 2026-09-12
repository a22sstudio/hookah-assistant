import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// Проверка что текущий пользователь — старший мастер
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
        { error: 'Только старший мастер может редактировать справочник' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// GET /api/tobaccos — список всех табаков с остатками
export async function GET() {
  const tobaccos = await db.tobacco.findMany({
    where: { active: true },
    include: { stock: true },
    orderBy: [{ brand: 'asc' }, { line: 'asc' }, { flavor: 'asc' }],
  })

  const result = tobaccos.map((t) => ({
    id: t.id,
    brand: t.brand,
    line: t.line,
    flavor: t.flavor,
    defaultJarGrams: t.defaultJarGrams,
    thresholdGrams: t.thresholdGrams,
    notes: t.notes,
    currentGrams: t.stock?.currentGrams ?? 0,
    updatedAt: t.stock?.updatedAt ?? t.updatedAt,
    isLow: (t.stock?.currentGrams ?? 0) < t.thresholdGrams,
  }))

  return NextResponse.json({ tobaccos: result, total: result.length })
}

// POST /api/tobaccos — создать новый табак
export async function POST(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error

  try {
    const body = await req.json()
    const { brand, flavor, defaultJarGrams, thresholdGrams, notes } = body
    // line — опциональна. Может быть пустой строкой (для табаков без линейки).
    const line: string =
      typeof body.line === 'string' ? body.line.trim() : ''

    if (!brand || !flavor) {
      return NextResponse.json(
        { error: 'brand и flavor обязательны' },
        { status: 400 },
      )
    }

    const brandTrim = String(brand).trim()
    const flavorTrim = String(flavor).trim()

    const existing = await db.tobacco.findFirst({
      where: { brand: brandTrim, line, flavor: flavorTrim, active: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Такой табак уже есть в справочнике' },
        { status: 400 },
      )
    }

    const tobacco = await db.tobacco.create({
      data: {
        brand: brandTrim,
        line,
        flavor: flavorTrim,
        defaultJarGrams: defaultJarGrams ?? 250,
        thresholdGrams: thresholdGrams ?? 70,
        notes,
      },
    })
    await db.stockItem.create({
      data: { tobaccoId: tobacco.id, currentGrams: 0 },
    })

    void me
    return NextResponse.json({ tobacco })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка создания', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// PATCH /api/tobaccos — обновить поля табака
// body: { id, brand?, line?, flavor?, defaultJarGrams?, thresholdGrams?, currentGrams?, notes? }
export async function PATCH(req: NextRequest) {
  const { error: authError } = await requireSenior()
  if (authError) return authError

  try {
    const body = await req.json()
    const {
      id,
      brand,
      line,
      flavor,
      defaultJarGrams,
      thresholdGrams,
      currentGrams,
      notes,
    } = body as {
      id?: string
      brand?: string
      line?: string
      flavor?: string
      defaultJarGrams?: number
      thresholdGrams?: number
      currentGrams?: number
      notes?: string | null
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    const tobacco = await db.tobacco.findUnique({
      where: { id },
      include: { stock: true },
    })
    if (!tobacco || !tobacco.active) {
      return NextResponse.json({ error: 'Табак не найден' }, { status: 404 })
    }

    // Собираем поля для обновления
    const updateData: Record<string, unknown> = {}
    if (typeof brand === 'string' && brand.trim()) updateData.brand = brand.trim()
    // line опциональна и может быть очищена (пустая строка → табак без линейки)
    if (typeof line === 'string') updateData.line = line.trim()
    if (typeof flavor === 'string' && flavor.trim()) updateData.flavor = flavor.trim()
    if (typeof defaultJarGrams === 'number' && defaultJarGrams > 0) {
      updateData.defaultJarGrams = Math.floor(defaultJarGrams)
    }
    if (typeof thresholdGrams === 'number' && thresholdGrams >= 0) {
      updateData.thresholdGrams = Math.floor(thresholdGrams)
    }
    if (notes !== undefined) updateData.notes = notes ?? null

    if (Object.keys(updateData).length > 0) {
      await db.tobacco.update({ where: { id }, data: updateData })
    }

    // Если currentGrams пришёл — обновляем остаток и пишем операцию CORRECTION
    if (typeof currentGrams === 'number' && currentGrams >= 0) {
      const before = tobacco.stock?.currentGrams ?? 0
      const after = Math.floor(currentGrams)
      if (before !== after) {
        await db.stockItem.upsert({
          where: { tobaccoId: id },
          update: { currentGrams: after },
          create: { tobaccoId: id, currentGrams: after },
        })
        await db.operation.create({
          data: {
            tobaccoId: id,
            type: 'CORRECTION',
            gramsBefore: before,
            gramsAfter: after,
            delta: after - before,
            source: 'MANUAL',
            note: 'Ручное редактирование',
          },
        })
      }
    }

    const updated = await db.tobacco.findUnique({
      where: { id },
      include: { stock: true },
    })

    return NextResponse.json({
      tobacco: updated
        ? {
            id: updated.id,
            brand: updated.brand,
            line: updated.line,
            flavor: updated.flavor,
            defaultJarGrams: updated.defaultJarGrams,
            thresholdGrams: updated.thresholdGrams,
            notes: updated.notes,
            currentGrams: updated.stock?.currentGrams ?? 0,
            isLow: (updated.stock?.currentGrams ?? 0) < updated.thresholdGrams,
          }
        : null,
      message: 'Сохранено',
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка обновления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// DELETE /api/tobaccos — мягкое удаление (active: false)
// body: { id }
export async function DELETE(req: NextRequest) {
  const { error: authError } = await requireSenior()
  if (authError) return authError

  try {
    const body = await req.json()
    const { id } = body as { id?: string }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    const tobacco = await db.tobacco.findUnique({ where: { id } })
    if (!tobacco || !tobacco.active) {
      return NextResponse.json({ error: 'Табак не найден' }, { status: 404 })
    }

    await db.tobacco.update({ where: { id }, data: { active: false } })

    return NextResponse.json({
      ok: true,
      message: `Позиция "${tobacco.brand} ${tobacco.flavor}" удалена`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка удаления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
