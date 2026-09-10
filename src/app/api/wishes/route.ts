import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { pushToSeniors } from '@/lib/notify'

// GET /api/wishes — список хотелок
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const mineOnly = searchParams.get('mine') === '1'

  const wishes = await db.wish.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(mineOnly ? { masterId: me.id } : {}),
    },
    include: { master: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({
    wishes: wishes.map((w) => ({
      id: w.id,
      text: w.text,
      status: w.status,
      createdAt: w.createdAt,
      master: { id: w.master.id, name: w.master.name, color: w.master.color },
      isMine: w.master.id === me.id,
    })),
  })
}

// POST /api/wishes — оставить хотелку
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { text } = await req.json()
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Введите текст' }, { status: 400 })
  }

  const wish = await db.wish.create({
    data: { masterId: me.id, text: text.trim() },
  })

  // Нотификация старшему (если не сам старший)
  if (me.role !== 'SENIOR') {
    const notifMsg = `💡 ${me.name}: хотелка — "${text.trim()}"`
    await db.notification.create({
      data: { type: 'WISH', message: notifMsg, masterId: me.id },
    })
    await pushToSeniors(notifMsg)
  }

  return NextResponse.json({ wish })
}

// PATCH /api/wishes — отметить выполненной
export async function PATCH(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { id, status } = await req.json()
  if (!id || !status) {
    return NextResponse.json({ error: 'id и status обязательны' }, { status: 400 })
  }

  const wish = await db.wish.update({
    where: { id },
    data: { status },
  })
  return NextResponse.json({ wish })
}
