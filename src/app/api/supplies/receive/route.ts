import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

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
        { error: 'Только старший может принимать поставки' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// POST /api/supplies/receive?id=xxx — принять поставку
// Обновляет остатки табака/расходников, создаёт операции INCOMING
export async function POST(req: NextRequest) {
  try {
    const { error, me } = await requireSenior()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
    }

    const supply = await db.supply.findUnique({
      where: { id },
      include: { items: true },
  })

  if (!supply) {
    return NextResponse.json({ error: 'Поставка не найдена' }, { status: 404 })
  }

  if (supply.status === 'RECEIVED') {
    return NextResponse.json({ error: 'Поставка уже принята' }, { status: 400 })
  }

  if (supply.items.length === 0) {
    return NextResponse.json(
      { error: 'Нельзя принять пустую поставку' },
      { status: 400 },
    )
  }

  const results: Array<{ name: string; ok: boolean; message: string; type: string }> = []

  // Обрабатываем каждую позицию
  for (const item of supply.items) {
    try {
      if (item.itemType === 'TOBACCO') {
        const brand = (item.brand ?? '').trim()
        const line = (item.line ?? '').trim()
        const flavor = (item.flavor ?? '').trim()

        // Ищем существующий табак — сначала по itemId, потом по brand/line/flavor
        let tobacco: { id: string } | null = null
        if (item.itemId) {
          tobacco = await db.tobacco.findUnique({
            where: { id: item.itemId },
            select: { id: true },
          })
        }
        if (!tobacco && brand && flavor) {
          tobacco = await db.tobacco.findFirst({
            where: { brand, line, flavor },
            select: { id: true },
          })
        }

        if (!tobacco && (!brand || !flavor)) {
          results.push({
            name: item.name,
            ok: false,
            message: 'Не указан brand или flavor — пропущено',
            type: 'TOBACCO',
          })
          continue
        }

        const gramsPerPack = item.packGrams ?? 250
        const incomingGrams = gramsPerPack * item.quantity

        if (!tobacco) {
          // Создаём новый табак + StockItem + Operation
          const created = await db.tobacco.create({
            data: {
              brand,
              line,
              flavor,
              defaultJarGrams: gramsPerPack,
              thresholdGrams: 70,
              stock: {
                create: { currentGrams: incomingGrams },
              },
              operations: {
                create: {
                  type: 'INCOMING',
                  gramsBefore: 0,
                  gramsAfter: incomingGrams,
                  delta: incomingGrams,
                  source: 'MANUAL',
                  note: `Поставка ${supply.id.slice(-6)}`,
                  rawInput: `${brand} ${line} ${flavor} ×${item.quantity}×${gramsPerPack}г`,
                },
              },
            },
            select: { id: true },
          })
          tobacco = created

          results.push({
            name: item.name,
            ok: true,
            message: `Создан табак +${incomingGrams}г`,
            type: 'TOBACCO',
          })
        } else {
          // Существующий табак — добавляем к остатку
          const stock = await db.stockItem.findUnique({
            where: { tobaccoId: tobacco.id },
          })

          const gramsBefore = stock?.currentGrams ?? 0
          const gramsAfter = gramsBefore + incomingGrams

          if (stock) {
            await db.stockItem.update({
              where: { tobaccoId: tobacco.id },
              data: { currentGrams: gramsAfter },
            })
          } else {
            await db.stockItem.create({
              data: { tobaccoId: tobacco.id, currentGrams: gramsAfter },
            })
          }

          await db.operation.create({
            data: {
              tobaccoId: tobacco.id,
              type: 'INCOMING',
              gramsBefore,
              gramsAfter,
              delta: incomingGrams,
              source: 'MANUAL',
              note: `Поставка ${supply.id.slice(-6)}`,
              rawInput: `${brand} ${line} ${flavor} ×${item.quantity}×${gramsPerPack}г`,
            },
          })

          results.push({
            name: item.name,
            ok: true,
            message: `Остаток: ${gramsBefore} → ${gramsAfter}г (+${incomingGrams}г)`,
            type: 'TOBACCO',
          })
        }

        // Привязываем itemId
        await db.supplyItem.update({
          where: { id: item.id },
          data: { itemId: tobacco.id },
        })
      } else {
        // ─── Расходник ───
        const name = item.name.trim()
        if (!name && !item.itemId) {
          results.push({
            name: item.name,
            ok: false,
            message: 'Пустое имя расходника — пропущено',
            type: 'CONSUMABLE',
          })
          continue
        }

        // Ищем расходник по itemId, иначе по name
        let consumable: { id: string; currentQty: number } | null = null
        if (item.itemId) {
          consumable = await db.consumable.findUnique({
            where: { id: item.itemId },
            select: { id: true, currentQty: true },
          })
        }
        if (!consumable && name) {
          consumable = await db.consumable.findUnique({
            where: { name },
            select: { id: true, currentQty: true },
          })
        }

        if (!consumable) {
          consumable = await db.consumable.create({
            data: {
              name,
              unit: item.unit || 'шт',
              currentQty: item.quantity,
              threshold: 5,
            },
            select: { id: true, currentQty: true },
          })
          results.push({
            name: item.name,
            ok: true,
            message: `Создан расходник: ${item.quantity} ${item.unit}`,
            type: 'CONSUMABLE',
          })
        } else {
          const before = consumable.currentQty
          const after = before + item.quantity
          await db.consumable.update({
            where: { id: consumable.id },
            data: { currentQty: after },
          })
          results.push({
            name: item.name,
            ok: true,
            message: `Остаток: ${before} → ${after} ${item.unit}`,
            type: 'CONSUMABLE',
          })
        }

        await db.supplyItem.update({
          where: { id: item.id },
          data: { itemId: consumable.id },
        })
      }
    } catch (e) {
      results.push({
        name: item.name,
        ok: false,
        message: `Ошибка: ${(e as Error).message}`,
        type: item.itemType,
      })
    }
  }

  // Помечаем поставку как принятую
  await db.supply.update({
    where: { id },
    data: { status: 'RECEIVED', receivedAt: new Date() },
  })

  const okCount = results.filter((r) => r.ok).length
  const failCount = results.length - okCount

  return NextResponse.json({
    ok: true,
    message: `Поставка принята: ${okCount} из ${results.length} позиций${
      failCount > 0 ? ` (${failCount} с ошибками)` : ''
    }`,
    results,
    supplyId: id,
  })
  } catch (e) {
    console.error('POST /api/supplies/receive error:', e)
    return NextResponse.json(
      { error: 'Не удалось принять поставку', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
