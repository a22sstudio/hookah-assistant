import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'

// POST /api/auth/login — вход по PIN
// body: { pin: string }
export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()

    if (!pin || typeof pin !== 'string') {
      return NextResponse.json({ error: 'Введите PIN' }, { status: 400 })
    }

    const master = await db.master.findFirst({
      where: { pin: pin.trim(), active: true },
    })

    if (!master) {
      return NextResponse.json({ error: 'Неверный PIN' }, { status: 401 })
    }

    await setSession(master.id)

    return NextResponse.json({
      master: {
        id: master.id,
        name: master.name,
        role: master.role,
        color: master.color,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка входа', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
