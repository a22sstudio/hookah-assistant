import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/tobaccos/lines?brand=Darkside — список линеек бренда
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const brand = searchParams.get('brand')

  if (!brand) {
    const lines = await db.tobaccoLine.findMany({
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    })
    const grouped: Record<string, string[]> = {}
    for (const l of lines) {
      if (!grouped[l.brand]) grouped[l.brand] = []
      grouped[l.brand].push(l.name)
    }
    return NextResponse.json({ lines: grouped })
  }

  const lines = await db.tobaccoLine.findMany({
    where: { brand },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({
    lines: lines.map((l) => l.name),
  })
}

// POST /api/tobaccos/lines — создать линейку
// body: { brand: string, name: string }
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший мастер' }, { status: 403 })
  }

  const { brand, name } = await req.json()
  if (!brand || !name || !name.trim()) {
    return NextResponse.json({ error: 'brand и name обязательны' }, { status: 400 })
  }

  const line = await db.tobaccoLine.upsert({
    where: { brand_name: { brand, name: name.trim() } },
    update: {},
    create: { brand, name: name.trim() },
  })

  return NextResponse.json({ line, message: `Линейка "${name}" добавлена к бренду "${brand}"` })
}

// DELETE /api/tobaccos/lines — удалить линейку
// body: { brand: string, name: string }
export async function DELETE(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (me.role !== 'SENIOR') {
    return NextResponse.json({ error: 'Только старший мастер' }, { status: 403 })
  }

  const { brand, name } = await req.json()
  if (!brand || !name) {
    return NextResponse.json({ error: 'brand и name обязательны' }, { status: 400 })
  }

  try {
    await db.tobaccoLine.delete({
      where: { brand_name: { brand, name } },
    })
  } catch {
    // Уже удалена — ок
  }

  return NextResponse.json({ ok: true, message: `Линейка "${name}" удалена` })
}
