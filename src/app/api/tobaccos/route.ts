import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
  try {
    const body = await req.json()
    const { brand, line, flavor, defaultJarGrams, thresholdGrams, notes } = body

    if (!brand || !line || !flavor) {
      return NextResponse.json({ error: 'brand, line, flavor обязательны' }, { status: 400 })
    }

    const tobacco = await db.tobacco.create({
      data: {
        brand,
        line,
        flavor,
        defaultJarGrams: defaultJarGrams ?? 250,
        thresholdGrams: thresholdGrams ?? 70,
        notes,
      },
    })
    await db.stockItem.create({
      data: { tobaccoId: tobacco.id, currentGrams: 0 },
    })

    return NextResponse.json({ tobacco })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка создания', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
