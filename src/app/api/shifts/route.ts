import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { pushToSeniors } from '@/lib/notify'

// Смену можно открыть в любое время (форс-мажор: забыли открыть, перерыв, замена)
function canOpenShift(): boolean {
  return true
}

// GET /api/shifts — текущие открытые смены (+ своя, если есть)
export async function GET() {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  // Открытые смены всех мастеров (для старшего — всех, для обычного — своя + видит кто на смене)
  const openShifts = await db.shift.findMany({
    where: { status: 'OPEN' },
    include: { master: true },
    orderBy: { openedAt: 'asc' },
  })

  const myOpenShift = openShifts.find((s) => s.masterId === me.id) ?? null
  const canOpen = !myOpenShift && canOpenShift()

  return NextResponse.json({
    shifts: openShifts.map((s) => ({
      id: s.id,
      masterId: s.masterId,
      masterName: s.master.name,
      masterColor: s.master.color,
      masterRole: s.master.role,
      status: s.status,
      openedAt: s.openedAt,
      hookahCount: s.hookahCount,
      isMine: s.masterId === me.id,
    })),
    myShift: myOpenShift
      ? {
          id: myOpenShift.id,
          openedAt: myOpenShift.openedAt,
          hookahCount: myOpenShift.hookahCount,
        }
      : null,
    canOpen,
    isAfterNoon: true,
  })
}

// POST /api/shifts — открыть смену
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  // Смену можно открыть в любое время (форс-мажор: забыли открыть, перерыв, замена)

  // Проверка — нет ли уже открытой смены
  const existing = await db.shift.findFirst({
    where: { masterId: me.id, status: 'OPEN' },
  })
  if (existing) {
    return NextResponse.json({ error: 'У вас уже открыта смена', shift: existing }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const shift = await db.shift.create({
    data: {
      masterId: me.id,
      status: 'OPEN',
      note: body.note ?? null,
    },
  })

  // Нотификация старшему (кроме если сам старший открыл)
  if (me.role !== 'SENIOR') {
    const notifMsg = `🌿 ${me.name} открыл смену`
    await db.notification.create({
      data: { type: 'SHIFT_OPEN', message: notifMsg, masterId: me.id },
    })
    await pushToSeniors(notifMsg)
  }

  return NextResponse.json({ shift })
}

// PATCH /api/shifts — закрыть свою смену
export async function PATCH() {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const shift = await db.shift.findFirst({
    where: { masterId: me.id, status: 'OPEN' },
  })
  if (!shift) {
    return NextResponse.json({ error: 'Нет открытой смены' }, { status: 400 })
  }

  const closed = await db.shift.update({
    where: { id: shift.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  })

  if (me.role !== 'SENIOR') {
    const notifMsg = `🌙 ${me.name} закрыл смену (${shift.hookahCount} кальянов)`
    await db.notification.create({
      data: { type: 'SHIFT_CLOSE', message: notifMsg, masterId: me.id },
    })
    await pushToSeniors(notifMsg)
  }

  return NextResponse.json({ shift: closed })
}
