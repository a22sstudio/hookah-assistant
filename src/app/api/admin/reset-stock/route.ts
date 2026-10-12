import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/admin/reset-stock
// Устанавливает остаток для ВСЕХ активных табаков (по умолчанию 250г)
// Только SENIOR + admin token
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentMaster()
    if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    if (me.role !== 'SENIOR') {
      return NextResponse.json({ error: 'Только старший' }, { status: 403 })
    }

    const authHeader = req.headers.get('x-admin-token')
    const expectedToken = process.env.BOT_SECRET || 'hookah-secret-2024'
    if (authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Неверный admin токен' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const grams = typeof body.grams === 'number' ? body.grams : 250

    // Получаем все табаки
    const tobaccos = await db.tobacco.findMany({
      where: { active: true },
      select: { id: true, brand: true, flavor: true, stock: true },
    })

    let updated = 0
    let created = 0

    for (const t of tobaccos) {
      if (t.stock) {
        await db.stockItem.update({
          where: { tobaccoId: t.id },
          data: { currentGrams: grams },
        })
        updated++
      } else {
        await db.stockItem.create({
          data: { tobaccoId: t.id, currentGrams: grams },
        })
        created++
      }
    }

    return NextResponse.json({
      ok: true,
      totalTobaccos: tobaccos.length,
      updated,
      created,
      gramsPerTobacco: grams,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('reset-stock error:', e)
    return NextResponse.json(
      { error: 'Не удалось сбросить остатки', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
