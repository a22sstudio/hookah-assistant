import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// Проверка что текущий пользователь — старший мастер
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
        { error: 'Только старший мастер может редактировать бренды' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// PATCH /api/tobaccos/brand — переименовать бренд у всех табаков сразу
// body: { oldBrand: string, newBrand: string }
// Все табаки с brand=oldBrand получат brand=newBrand.
// SENIOR only.
export async function PATCH(req: NextRequest) {
  const { error: authError, me } = await requireSenior()
  if (authError) return authError

  try {
    const body = await req.json()
    const { oldBrand, newBrand } = body as {
      oldBrand?: string
      newBrand?: string
    }

    if (!oldBrand || typeof oldBrand !== 'string' || !oldBrand.trim()) {
      return NextResponse.json(
        { error: 'oldBrand обязателен' },
        { status: 400 },
      )
    }
    if (!newBrand || typeof newBrand !== 'string' || !newBrand.trim()) {
      return NextResponse.json(
        { error: 'newBrand обязателен' },
        { status: 400 },
      )
    }

    const oldTrim = oldBrand.trim()
    const newTrim = newBrand.trim()

    if (oldTrim === newTrim) {
      return NextResponse.json({
        ok: true,
        count: 0,
        message: 'Без изменений',
      })
    }

    // Перед переименованием проверим, не создаст ли это конфликт
    // уникального ограничения [brand, line, flavor]. Если у нас уже есть
    // табак с (newBrand, line, flavor), а у oldBrand — табак с тем же
    // (line, flavor), то обновление упадёт. Проверим и сообщим.
    const candidates = await db.tobacco.findMany({
      where: { brand: oldTrim, active: true },
      select: { line: true, flavor: true },
    })
    const existingNew = await db.tobacco.findMany({
      where: { brand: newTrim, active: true },
      select: { line: true, flavor: true },
    })
    const setNew = new Set(
      existingNew.map((t) => `${t.line}||${t.flavor}`),
    )
    const conflict = candidates.find((c) =>
      setNew.has(`${c.line}||${c.flavor}`),
    )
    if (conflict) {
      return NextResponse.json(
        {
          error: `Конфликт: у бренда «${newTrim}» уже есть позиция с такой же линейкой и вкусом (line="${conflict.line}", flavor="${conflict.flavor}"). Удалите или переименуйте конфликтующую позицию.`,
        },
        { status: 409 },
      )
    }

    const result = await db.tobacco.updateMany({
      where: { brand: oldTrim, active: true },
      data: { brand: newTrim },
    })

    void me
    return NextResponse.json({
      ok: true,
      count: result.count,
      message: `Бренд переименован: ${oldTrim} → ${newTrim} (${result.count} поз.)`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка переименования бренда', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
