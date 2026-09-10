import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/orders — список заявок на закуп
// query: ?status=PENDING|ORDERED|RECEIVED
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const orders = await db.orderRequest.findMany({
    where: status ? { status } : undefined,
    include: { tobacco: { include: { stock: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const result = orders.map((o) => ({
    id: o.id,
    status: o.status,
    gramsRequested: o.gramsRequested,
    note: o.note,
    createdAt: o.createdAt,
    resolvedAt: o.resolvedAt,
    tobacco: o.tobacco
      ? {
          id: o.tobacco.id,
          brand: o.tobacco.brand,
          line: o.tobacco.line,
          flavor: o.tobacco.flavor,
          currentGrams: o.tobacco.stock?.currentGrams ?? 0,
        }
      : null,
  }))

  return NextResponse.json({ orders: result, total: result.length })
}

// PATCH /api/orders — обновить статус заявки
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'id и status обязательны' }, { status: 400 })
    }

    const order = await db.orderRequest.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'RECEIVED' || status === 'ORDERED' ? new Date() : null,
      },
    })

    return NextResponse.json({ order })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка обновления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
