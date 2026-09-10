import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/notifications — список нотификаций (для старшего)
export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const unreadOnly = searchParams.get('unread') === '1'

  const notifications = await db.notification.findMany({
    where: unreadOnly ? { read: false } : {},
    include: { master: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const unreadCount = await db.notification.count({ where: { read: false } })

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
      master: n.master
        ? { id: n.master.id, name: n.master.name, color: n.master.color }
        : null,
    })),
    unreadCount,
  })
}

// PATCH /api/notifications — отметить прочитанным (или все)
export async function PATCH(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { id, all } = await req.json()

  if (all) {
    await db.notification.updateMany({
      where: { read: false },
      data: { read: true },
    })
    return NextResponse.json({ ok: true, markedAll: true })
  }

  if (id) {
    await db.notification.update({
      where: { id },
      data: { read: true },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Нужен id или all=true' }, { status: 400 })
}
