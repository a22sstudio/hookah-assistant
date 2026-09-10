import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// Проверка что текущий пользователь — старший мастер (cookie-auth)
async function requireSenior() {
  const me = await getCurrentMaster()
  if (!me) {
    return {
      error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }),
      me: null,
    }
  }
  if (me.role !== 'SENIOR') {
    return {
      error: NextResponse.json(
        { error: 'Только старший мастер может управлять мастерами' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// Генерация случайного 4-значного PIN-кода
function randomPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

// GET /api/masters — список всех мастеров (cookie-auth, SENIOR only)
export async function GET() {
  const { error } = await requireSenior()
  if (error) return error

  const masters = await db.master.findMany({
    where: { active: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({
    masters: masters.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      color: m.color,
      pin: m.pin,
      telegramId: m.telegramId,
    })),
  })
}

// POST /api/masters — создать нового мастера (cookie-auth, SENIOR only)
// body: { name, role, pin?, color, telegramId? }
export async function POST(req: NextRequest) {
  const { error } = await requireSenior()
  if (error) return error

  try {
    const body = await req.json()
    const { name, role, pin, color, telegramId } = body as {
      name?: string
      role?: string
      pin?: string
      color?: string
      telegramId?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Имя обязательно' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Роль: SENIOR | REGULAR (по умолчанию REGULAR)
    const finalRole = role === 'SENIOR' ? 'SENIOR' : 'REGULAR'

    // Цвет: только разрешённые
    const allowedColors = ['emerald', 'teal', 'amber', 'sky', 'violet', 'rose']
    const finalColor = allowedColors.includes(color as string)
      ? (color as string)
      : 'emerald'

    // PIN: 4 цифры. Если не передан — генерируем автоматически
    let finalPin = (pin ?? '').toString().trim()
    if (!/^\d{4}$/.test(finalPin)) {
      if (pin && pin.trim() !== '') {
        return NextResponse.json(
          { error: 'PIN должен быть 4 цифры' },
          { status: 400 },
        )
      }
      // Уникальная генерация (попытки)
      for (let i = 0; i < 10; i++) {
        const candidate = randomPin()
        const exists = await db.master.findFirst({
          where: { pin: candidate },
        })
        if (!exists) {
          finalPin = candidate
          break
        }
      }
      if (!finalPin) {
        return NextResponse.json(
          { error: 'Не удалось сгенерировать уникальный PIN' },
          { status: 500 },
        )
      }
    } else {
      // Проверяем что PIN не занят
      const existing = await db.master.findFirst({ where: { pin: finalPin } })
      if (existing) {
        return NextResponse.json(
          { error: `PIN ${finalPin} уже используется у мастера «${existing.name}»` },
          { status: 400 },
        )
      }
    }

    // Уникальность имени
    const nameExists = await db.master.findFirst({
      where: { name: trimmedName },
    })
    if (nameExists) {
      return NextResponse.json(
        { error: `Имя «${trimmedName}» уже занято` },
        { status: 400 },
      )
    }

    // Telegram ID (опционально): проверка уникальности
    let finalTelegramId: string | null = null
    if (telegramId && String(telegramId).trim() !== '') {
      finalTelegramId = String(telegramId).trim()
      const tgExists = await db.master.findFirst({
        where: { telegramId: finalTelegramId },
      })
      if (tgExists) {
        return NextResponse.json(
          {
            error: `Telegram ID ${finalTelegramId} уже привязан к «${tgExists.name}»`,
          },
          { status: 400 },
        )
      }
    }

    const master = await db.master.create({
      data: {
        name: trimmedName,
        role: finalRole,
        pin: finalPin,
        color: finalColor,
        telegramId: finalTelegramId,
      },
    })

    return NextResponse.json({
      master: {
        id: master.id,
        name: master.name,
        role: master.role,
        color: master.color,
        pin: master.pin,
        telegramId: master.telegramId,
      },
      message: `Мастер «${master.name}» создан · PIN: ${master.pin}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка создания', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// PATCH /api/masters — обновить telegramId мастера (cookie-auth, SENIOR only)
// body: { id, telegramId? }
export async function PATCH(req: NextRequest) {
  const { error } = await requireSenior()
  if (error) return error

  try {
    const body = await req.json()
    const { id, telegramId } = body as { id?: string; telegramId?: string }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    // Проверка существования мастера
    const master = await db.master.findUnique({ where: { id } })
    if (!master) {
      return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })
    }

    // Если telegramId пустой → отвязать
    let finalTelegramId: string | null = null
    if (telegramId && String(telegramId).trim() !== '') {
      finalTelegramId = String(telegramId).trim()

      // Проверка уникальности telegramId (кроме текущего мастера)
      const existing = await db.master.findFirst({
        where: { telegramId: finalTelegramId, NOT: { id } },
      })
      if (existing) {
        return NextResponse.json(
          {
            error: `Telegram ID ${finalTelegramId} уже привязан к «${existing.name}»`,
          },
          { status: 400 },
        )
      }
    }

    const updated = await db.master.update({
      where: { id },
      data: { telegramId: finalTelegramId },
    })

    return NextResponse.json({
      master: {
        id: updated.id,
        name: updated.name,
        telegramId: updated.telegramId,
      },
      message: finalTelegramId
        ? `Telegram ID ${finalTelegramId} привязан к «${updated.name}»`
        : `Telegram ID отвязан от «${updated.name}»`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка обновления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
