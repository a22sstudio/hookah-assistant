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
        { error: 'Только старший мастер может редактировать линейки' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// PATCH /api/tobaccos/line — переименовать или очистить линейку у всех табаков бренда
// body: { brand: string, oldLine: string, newLine: string }
// - newLine непустая → переименование линейки у всех табаков (brand, oldLine).
// - newLine = ""     → очистка линейки (табаки остаются, просто без линейки).
// SENIOR only.
export async function PATCH(req: NextRequest) {
  const { error: authError, me } = await requireSenior()
  if (authError) return authError

  try {
    const body = await req.json()
    const { brand, oldLine, newLine } = body as {
      brand?: string
      oldLine?: string
      newLine?: string
    }

    if (!brand || typeof brand !== 'string' || !brand.trim()) {
      return NextResponse.json({ error: 'brand обязателен' }, { status: 400 })
    }
    if (!oldLine || typeof oldLine !== 'string') {
      return NextResponse.json({ error: 'oldLine обязателен' }, { status: 400 })
    }
    if (typeof newLine !== 'string') {
      return NextResponse.json(
        { error: 'newLine обязателен (можно пустой строкой)' },
        { status: 400 },
      )
    }

    const brandTrim = brand.trim()
    const oldTrim = oldLine.trim()
    const newTrim = newLine.trim()

    if (oldTrim === newTrim) {
      return NextResponse.json({
        ok: true,
        count: 0,
        message: 'Без изменений',
      })
    }

    // Если переименуем (не очищаем), проверим конфликты с уже существующими
    // табаками того же бренда с такой же парой (line=newLine, flavor).
    if (newTrim !== '') {
      const candidates = await db.tobacco.findMany({
        where: { brand: brandTrim, line: oldTrim, active: true },
        select: { flavor: true },
      })
      const existingNew = await db.tobacco.findMany({
        where: { brand: brandTrim, line: newTrim, active: true },
        select: { flavor: true },
      })
      const setNew = new Set(existingNew.map((t) => t.flavor))
      const conflictFlavor = candidates.find((c) => setNew.has(c.flavor))
      if (conflictFlavor) {
        return NextResponse.json(
          {
            error: `Конфликт: у линейки «${newTrim}» уже есть позиция с вкусом «${conflictFlavor.flavor}». Удалите или переименуйте конфликтующую позицию.`,
          },
          { status: 409 },
        )
      }
    }

    // Если очищаем линейку (newLine=""), нужно проверить, что у нас не будет
    // двух табаков с одинаковыми (brand, "", flavor). Для каждой пары
    // проверим существующие с пустой линейкой.
    if (newTrim === '') {
      const candidates = await db.tobacco.findMany({
        where: { brand: brandTrim, line: oldTrim, active: true },
        select: { flavor: true },
      })
      const existingEmpty = await db.tobacco.findMany({
        where: { brand: brandTrim, line: '', active: true },
        select: { flavor: true },
      })
      const setEmpty = new Set(existingEmpty.map((t) => t.flavor))
      const conflictFlavor = candidates.find((c) => setEmpty.has(c.flavor))
      if (conflictFlavor) {
        return NextResponse.json(
          {
            error: `Конфликт: уже есть табак без линейки с вкусом «${conflictFlavor.flavor}». Удалите или переименуйте конфликтующую позицию.`,
          },
          { status: 409 },
        )
      }
    }

    const result = await db.tobacco.updateMany({
      where: { brand: brandTrim, line: oldTrim, active: true },
      data: { line: newTrim },
    })

    void me
    return NextResponse.json({
      ok: true,
      count: result.count,
      message:
        newTrim === ''
          ? `Линейка «${oldTrim}» очищена у ${result.count} поз.`
          : `Линейка переименована: ${oldTrim} → ${newTrim} (${result.count} поз.)`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка переименования линейки', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
