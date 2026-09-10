import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/requests — заявки мастеров на закуп
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const mineOnly = searchParams.get('mine') === '1'

  const requests = await db.masterRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(mineOnly ? { masterId: me.id } : {}),
    },
    include: { master: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      text: r.text,
      grams: r.grams,
      status: r.status,
      createdAt: r.createdAt,
      master: { id: r.master.id, name: r.master.name, color: r.master.color },
      isMine: r.master.id === me.id,
    })),
  })
}

// POST /api/requests — создать заявку
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { text, grams } = await req.json()
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Введите что нужно закупить' }, { status: 400 })
  }

  const request = await db.masterRequest.create({
    data: {
      masterId: me.id,
      text: text.trim(),
      grams: grams ?? null,
    },
  })

  // Нотификация старшему
  if (me.role !== 'SENIOR') {
    await db.notification.create({
      data: {
        type: 'REQUEST',
        message: `${me.name}: заявка на закуп — "${text.trim()}"`,
        masterId: me.id,
      },
    })
  }

  return NextResponse.json({ request })
}

// PATCH /api/requests — сменить статус
export async function PATCH(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { id, status } = await req.json()
  if (!id || !status) {
    return NextResponse.json({ error: 'id и status обязательны' }, { status: 400 })
  }

  const request = await db.masterRequest.update({
    where: { id },
    data: { status },
  })
  return NextResponse.json({ request })
}
