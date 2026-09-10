import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// POST /api/shifts/hookah — +1 кальян к текущей смене (или -1 если action=undo)
// body: { action?: 'add' | 'undo' }
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body.action === 'undo' ? 'undo' : 'add'

  const shift = await db.shift.findFirst({
    where: { masterId: me.id, status: 'OPEN' },
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
