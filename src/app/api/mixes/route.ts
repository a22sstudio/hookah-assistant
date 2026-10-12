import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/mixes — список всех миксов
export async function GET() {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const mixes = await db.mix.findMany({
    include: {
      author: { select: { id: true, name: true, color: true } },
      items: {
        include: {
          tobacco: {
            select: { id: true, brand: true, line: true, flavor: true },
          },
        },
        orderBy: { percent: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    mixes: mixes.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      author: m.author,
      isMine: m.authorId === me.id,
      canEdit: me.role === 'SENIOR' || m.authorId === me.id,
      items: m.items.map((it) => ({
        id: it.id,
        tobaccoId: it.tobaccoId,
        brand: it.tobacco.brand,
        line: it.tobacco.line,
        flavor: it.tobacco.flavor,
        percent: it.percent,
      })),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
  })
}

// POST /api/mixes — создать микс
// body: { name, description?, items: [{ tobaccoId, percent }] }
export async function POST(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  try {
    const body = await req.json()
    const { name, description, items } = body as {
      name?: string
      description?: string
      items?: Array<{ tobaccoId: string; percent: number }>
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Добавьте хотя бы один табак' }, { status: 400 })
    }

    // Проверка процентов (сумма не обязательно 100, но каждый 1-100)
    for (const it of items) {
      if (typeof it.percent !== 'number' || it.percent < 1 || it.percent > 100) {
        return NextResponse.json({ error: 'Проценты должны быть 1-100' }, { status: 400 })
      }
    }

    const mix = await db.mix.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        authorId: me.id,
        items: {
          create: items.map((it) => ({
            tobaccoId: it.tobaccoId,
            percent: it.percent,
          })),
        },
      },
      include: {
        author: { select: { id: true, name: true, color: true } },
        items: { include: { tobacco: { select: { brand: true, line: true, flavor: true } } } },
      },
    })

    return NextResponse.json({ mix, message: 'Микс создан' })
  } catch (e) {
    console.error('Create mix error:', e)
    return NextResponse.json(
      { error: 'Не удалось создать микс', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// PATCH /api/mixes — обновить микс
// body: { id, name?, description?, items?: [{ tobaccoId, percent }] }
export async function PATCH(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, name, description, items } = body as {
      id?: string
      name?: string
      description?: string
      items?: Array<{ tobaccoId: string; percent: number }>
    }

    if (!id) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    const mix = await db.mix.findUnique({ where: { id } })
    if (!mix) {
      return NextResponse.json({ error: 'Микс не найден' }, { status: 404 })
    }

    // Проверка прав: старший или автор
    if (me.role !== 'SENIOR' && mix.authorId !== me.id) {
      return NextResponse.json({ error: 'Нет прав на редактирование' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (typeof name === 'string' && name.trim()) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description.trim() || null

    if (Object.keys(updateData).length > 0) {
      await db.mix.update({ where: { id }, data: updateData })
    }

    // Обновление позиций (полная замена)
    if (Array.isArray(items)) {
      await db.mixItem.deleteMany({ where: { mixId: id } })
      if (items.length > 0) {
        await db.mixItem.createMany({
          data: items.map((it) => ({
            mixId: id,
            tobaccoId: it.tobaccoId,
            percent: it.percent,
          })),
        })
      }
    }

    const updated = await db.mix.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, color: true } },
        items: { include: { tobacco: { select: { brand: true, line: true, flavor: true } } } },
      },
    })

    return NextResponse.json({ mix: updated, message: 'Микс обновлён' })
  } catch (e) {
    console.error('Update mix error:', e)
    return NextResponse.json(
      { error: 'Не удалось обновить микс', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

// DELETE /api/mixes?id=xxx — удалить микс
export async function DELETE(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

    const mix = await db.mix.findUnique({ where: { id } })
    if (!mix) {
      return NextResponse.json({ error: 'Микс не найден' }, { status: 404 })
    }

    // Только старший или автор
    if (me.role !== 'SENIOR' && mix.authorId !== me.id) {
      return NextResponse.json({ error: 'Нет прав на удаление' }, { status: 403 })
    }

    await db.mix.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'Микс удалён' })
  } catch (e) {
    return NextResponse.json(
      { error: 'Не удалось удалить', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
