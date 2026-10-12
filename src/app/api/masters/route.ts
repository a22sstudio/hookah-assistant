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
    const { id, name, role, pin, color, rate, telegramId, active } = body as {
      id?: string
      name?: string
      role?: string
      pin?: string
      color?: string
      rate?: number
      telegramId?: string
      active?: boolean
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    const master = await db.master.findUnique({ where: { id } })
    if (!master) {
      return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })
    }

    // Собираем поля для обновления
    const updateData: Record<string, unknown> = {}

    if (typeof name === 'string' && name.trim()) {
      // Проверка уникальности имени
      const existingName = await db.master.findFirst({
        where: { name: name.trim(), NOT: { id } },
      })
      if (existingName) {
        return NextResponse.json(
          { error: `Имя «${name.trim()}» уже занято` },
          { status: 400 },
        )
      }
      updateData.name = name.trim()
    }

    if (typeof role === 'string' && (role === 'SENIOR' || role === 'REGULAR')) {
      updateData.role = role
    }

    if (typeof pin === 'string' && pin.trim()) {
      const pinTrimmed = pin.trim()
      if (!/^\d{4}$/.test(pinTrimmed)) {
        return NextResponse.json(
          { error: 'PIN должен быть 4 цифры' },
          { status: 400 },
        )
      }
      // Проверка уникальности PIN
      const existingPin = await db.master.findFirst({
        where: { pin: pinTrimmed, NOT: { id } },
      })
      if (existingPin) {
        return NextResponse.json(
          { error: `PIN ${pinTrimmed} уже занят «${existingPin.name}»` },
          { status: 400 },
        )
      }
      updateData.pin = pinTrimmed
    }

    if (typeof color === 'string' && color.trim()) {
      updateData.color = color.trim()
    }

    if (typeof rate === 'number' && rate >= 0) {
      updateData.rate = Math.floor(rate)
    }

    if (typeof active === 'boolean') {
      updateData.active = active
    }

    // Telegram ID
    if (telegramId !== undefined) {
      let finalTelegramId: string | null = null
      if (telegramId && String(telegramId).trim() !== '') {
        finalTelegramId = String(telegramId).trim()
        const existing = await db.master.findFirst({
          where: { telegramId: finalTelegramId, NOT: { id } },
        })
        if (existing) {
          return NextResponse.json(
            { error: `Telegram ID ${finalTelegramId} уже привязан к «${existing.name}»` },
            { status: 400 },
          )
        }
      }
      updateData.telegramId = finalTelegramId
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 })
    }

    const updated = await db.master.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      master: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        color: updated.color,
        pin: updated.pin,
        telegramId: updated.telegramId,
        rate: updated.rate,
        active: updated.active,
      },
      message: 'Мастер обновлён',
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка обновления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// DELETE /api/masters?id=xxx — удалить мастера (только SENIOR)
export async function DELETE(req: NextRequest) {
  const { error } = await requireSenior()
  if (error) return error

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    const master = await db.master.findUnique({ where: { id } })
    if (!master) {
      return NextResponse.json({ error: 'Мастер не найден' }, { status: 404 })
    }

    // Не позволяем удалить себя
    const me = await getCurrentMaster()
    if (me?.id === id) {
      return NextResponse.json(
        { error: 'Нельзя удалить самого себя' },
        { status: 400 },
      )
    }

    // Удаляем мастера (cascade удалит связанные shifts, wishes, requests, etc.)
    await db.master.delete({ where: { id } })

    return NextResponse.json({ ok: true, message: `Мастер «${master.name}» удалён` })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка удаления', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
