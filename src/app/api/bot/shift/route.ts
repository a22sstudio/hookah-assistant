import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret, findMasterByTelegram } from '@/lib/bot-auth'
import { db } from '@/lib/db'
import { pushToSeniors } from '@/lib/notify'

// Смену можно открыть в любое время (форс-мажор)

// POST /api/bot/shift
// body: { telegramId, action: 'open' | 'close' | 'add' | 'undo' | 'status' }
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { telegramId, action } = await req.json()
    if (!telegramId || !action) {
      return NextResponse.json({ error: 'telegramId и action обязательны' }, { status: 400 })
    }

    const master = await findMasterByTelegram(telegramId)
    if (!master) {
      return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })
    }

    if (action === 'status') {
      const myShift = await db.shift.findFirst({
        where: { masterId: master.id, status: 'OPEN' },
      })
      const allOpen = await db.shift.findMany({
        where: { status: 'OPEN' },
        include: { master: true },
        orderBy: { openedAt: 'asc' },
      })
      return NextResponse.json({
        myShift: myShift
          ? { id: myShift.id, openedAt: myShift.openedAt, hookahCount: myShift.hookahCount }
          : null,
        canOpen: !myShift,
        allOpen: allOpen.map((s) => ({
          masterName: s.master.name,
          masterRole: s.master.role,
          hookahCount: s.hookahCount,
          openedAt: s.openedAt,
        })),
        isAfterNoon: true,
      })
    }

    if (action === 'open') {
      const existing = await db.shift.findFirst({
        where: { masterId: master.id, status: 'OPEN' },
      })
      if (existing) {
        return NextResponse.json({ error: 'У вас уже открыта смена', shift: existing }, { status: 400 })
      }
      const shift = await db.shift.create({
        data: { masterId: master.id, status: 'OPEN' },
      })
      if (master.role !== 'SENIOR') {
        const notifMsg = `🌿 ${master.name} открыл смену`
        await db.notification.create({
          data: { type: 'SHIFT_OPEN', message: notifMsg, masterId: master.id },
        })
        await pushToSeniors(notifMsg)
      }
      return NextResponse.json({ shift, message: 'Смена открыта' })
    }

    if (action === 'close') {
      const shift = await db.shift.findFirst({
        where: { masterId: master.id, status: 'OPEN' },
      })
      if (!shift) {
        return NextResponse.json({ error: 'Нет открытой смены' }, { status: 400 })
      }
      const closed = await db.shift.update({
        where: { id: shift.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      })
      if (master.role !== 'SENIOR') {
        const notifMsg = `🌙 ${master.name} закрыл смену (${shift.hookahCount} кальянов)`
        await db.notification.create({
          data: { type: 'SHIFT_CLOSE', message: notifMsg, masterId: master.id },
        })
        await pushToSeniors(notifMsg)
      }
      return NextResponse.json({ shift: closed, message: `Смена закрыта. Кальянов: ${shift.hookahCount}` })
    }

    if (action === 'add' || action === 'undo') {
      const shift = await db.shift.findFirst({
        where: { masterId: master.id, status: 'OPEN' },
      })
      if (!shift) {
        return NextResponse.json({ error: 'Смена не открыта' }, { status: 400 })
      }
      const newCount = action === 'undo' ? Math.max(0, shift.hookahCount - 1) : shift.hookahCount + 1
      const updated = await db.shift.update({
        where: { id: shift.id },
        data: { hookahCount: newCount },
      })
      return NextResponse.json({ shift: updated, count: newCount })
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
