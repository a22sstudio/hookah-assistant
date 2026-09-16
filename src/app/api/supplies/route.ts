import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// Проверка SENIOR
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
        { error: 'Только старший может управлять поставками' },
        { status: 403 },
      ),
      me: null,
    }
  }
  return { error: null, me }
}

// GET /api/supplies — список поставок с items (sorted by createdAt desc)
export async function GET() {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const supplies = await db.supply.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({
    supplies: supplies.map((s) => ({
      id: s.id,
      status: s.status,
      supplier: s.supplier,
      note: s.note,
      hasPhoto: !!s.photoBase64,
      hasPdf: !!s.pdfBase64,
      fileName: s.fileName,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      items: s.items.map((it) => ({
        id: it.id,
        itemType: it.itemType,
        itemId: it.itemId,
        brand: it.brand,
        line: it.line,
        flavor: it.flavor,
        name: it.name,
        packGrams: it.packGrams,
        quantity: it.quantity,
        unit: it.unit,
      })),
    })),
    total: supplies.length,
  })
}

// POST /api/supplies — создать поставку (SENIOR only)
// body: { items: [...], supplier?, note?, photoBase64?, pdfBase64?, fileName? }
export async function POST(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: 'Нет позиций в поставке' }, { status: 400 })
  }

  const supplier = typeof body.supplier === 'string' ? body.supplier.trim() : null
  const note = typeof body.note === 'string' ? body.note.trim() : null
  const photoBase64 = typeof body.photoBase64 === 'string' ? body.photoBase64 : null
  const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : null
  const fileName = typeof body.fileName === 'string' ? body.fileName : null

  const supply = await db.supply.create({
    data: {
      status: 'PENDING',
      supplier: supplier || null,
      note: note || null,
      photoBase64,
      pdfBase64,
      fileName,
      items: {
        create: items.map((it: {
          itemType?: string
          itemId?: string
          brand?: string
          line?: string
          flavor?: string
          name?: string
          packGrams?: number | null
          quantity?: number
          unit?: string
        }) => ({
          itemType: it.itemType === 'CONSUMABLE' ? 'CONSUMABLE' : 'TOBACCO',
          itemId: it.itemId ?? null,
          brand: it.brand ?? null,
          line: it.line ?? null,
          flavor: it.flavor ?? null,
          name: typeof it.name === 'string' && it.name.trim() ? it.name.trim() : 'Без названия',
          packGrams: typeof it.packGrams === 'number' ? it.packGrams : null,
          quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1,
          unit: typeof it.unit === 'string' && it.unit.trim() ? it.unit.trim() : 'шт',
        })),
      },
    },
    include: { items: true },
  })

  return NextResponse.json({
    supply: {
      id: supply.id,
      status: supply.status,
      itemsCount: supply.items.length,
    },
    message: `Поставка создана: ${supply.items.length} позиций`,
  })
}

// PATCH /api/supplies — принять поставку (status=ACCEPTED) → обновить склад
// body: { id, status: 'ACCEPTED' }
export async function PATCH(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const body = await req.json()
  const { id, status } = body

  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  if (status !== 'ACCEPTED') {
    return NextResponse.json({ error: 'Поддерживается только status=ACCEPTED' }, { status: 400 })
  }

  const supply = await db.supply.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!supply) return NextResponse.json({ error: 'Поставка не найдена' }, { status: 404 })
  if (supply.status === 'ACCEPTED') {
    return NextResponse.json({ error: 'Поставка уже принята' }, { status: 400 })
  }

  const processedItems: Array<{ name: string; matched: boolean; delta?: string }> = []

  for (const it of supply.items) {
    if (it.itemType === 'TOBACCO') {
      // Поиск табака (fuzzy): по brand+flavor или по name
      const found = await findTobaccoFuzzy(it.brand ?? null, it.line ?? null, it.flavor ?? null, it.name)
      const gramsPerItem = it.packGrams ?? 250
      const totalGrams = gramsPerItem * it.quantity

      if (found) {
        // Обновляем stock (add_incoming)
        const stockItem = await db.stockItem.upsert({
          where: { tobaccoId: found.id },
          update: { currentGrams: { increment: totalGrams } },
          create: { tobaccoId: found.id, currentGrams: totalGrams },
        })
        // Создаём Operation
        await db.operation.create({
          data: {
            tobaccoId: found.id,
            type: 'INCOMING',
            gramsBefore: stockItem.currentGrams - totalGrams,
            gramsAfter: stockItem.currentGrams,
            delta: totalGrams,
            source: 'MANUAL',
            note: `Поставка${supply.supplier ? ` от ${supply.supplier}` : ''}: ${it.quantity} × ${gramsPerItem}г`,
          },
        })
        processedItems.push({ name: it.name, matched: true, delta: `+${totalGrams}г` })
      } else {
        // Создаём новый табак + stock
        const newTobacco = await db.tobacco.create({
          data: {
            brand: (it.brand ?? extractBrandFromName(it.name)).trim(),
            line: (it.line ?? '').trim(),
            flavor: (it.flavor ?? it.name).trim(),
            defaultJarGrams: gramsPerItem,
            thresholdGrams: 70,
          },
        })
        await db.stockItem.create({
          data: { tobaccoId: newTobacco.id, currentGrams: totalGrams },
        })
        await db.operation.create({
          data: {
            tobaccoId: newTobacco.id,
            type: 'INCOMING',
            gramsBefore: 0,
            gramsAfter: totalGrams,
            delta: totalGrams,
            source: 'MANUAL',
            note: `Поставка${supply.supplier ? ` от ${supply.supplier}` : ''}: ${it.quantity} × ${gramsPerItem}г (новая позиция)`,
          },
        })
        // Связываем SupplyItem с созданным табаком
        await db.supplyItem.update({ where: { id: it.id }, data: { itemId: newTobacco.id } })
        processedItems.push({ name: it.name, matched: false, delta: `+${totalGrams}г (новый)` })
      }
    } else if (it.itemType === 'CONSUMABLE') {
      // Поиск расходника (fuzzy по name)
      const found = await findConsumableFuzzy(it.name)
      const totalQty = it.quantity
      if (found) {
        await db.consumable.update({
          where: { id: found.id },
          data: { currentQty: { increment: totalQty } },
        })
        await db.supplyItem.update({ where: { id: it.id }, data: { itemId: found.id } })
        processedItems.push({ name: it.name, matched: true, delta: `+${totalQty} ${it.unit}` })
      } else {
        // Создаём новый расходник
        const newCon = await db.consumable.create({
          data: {
            name: it.name,
            unit: it.unit || 'шт',
            currentQty: totalQty,
            threshold: 5,
          },
        })
        await db.supplyItem.update({ where: { id: it.id }, data: { itemId: newCon.id } })
        processedItems.push({ name: it.name, matched: false, delta: `+${totalQty} ${it.unit} (новый)` })
      }
    }
  }

  // Меняем статус поставки на ACCEPTED
  await db.supply.update({ where: { id }, data: { status: 'ACCEPTED' } })

  return NextResponse.json({
    ok: true,
    message: `Поставка принята. Обработано ${processedItems.length} позиций.`,
    processedItems,
  })
}

// DELETE /api/supplies — удалить поставку (SENIOR only)
// ?id=xxx
export async function DELETE(req: NextRequest) {
  const { error, me } = await requireSenior()
  if (error) return error
  void me

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  const supply = await db.supply.findUnique({ where: { id } })
  if (!supply) {
    return NextResponse.json({ error: 'Поставка не найдена' }, { status: 404 })
  }
  if (supply.status === 'ACCEPTED') {
    return NextResponse.json(
      { error: 'Нельзя удалить принятую поставку (склад уже обновлён)' },
      { status: 400 },
    )
  }

  await db.supply.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// ─── Хелперы fuzzy-поиска ─────────────────────────────────────

async function findTobaccoFuzzy(
  brand: string | null,
  line: string | null,
  flavor: string | null,
  name: string,
) {
  // 1. Точное совпадение по brand+line+flavor
  if (brand && flavor) {
    const exact = await db.tobacco.findFirst({
      where: {
        brand: brand,
        line: line ?? '',
        flavor: flavor,
        active: true,
      },
    })
    if (exact) return exact
  }
  // 2. Совпадение по brand+flavor (без учёта line)
  if (brand && flavor) {
    const partial = await db.tobacco.findFirst({
      where: {
        brand: brand,
        flavor: flavor,
        active: true,
      },
    })
    if (partial) return partial
  }
  // 3. По name (часто содержит "Brand Line Flavor")
  const nameParts = name.split(/\s+/).filter(Boolean)
  if (nameParts.length >= 2) {
    const brandGuess = nameParts[0]
    const flavorGuess = nameParts[nameParts.length - 1]
    const byName = await db.tobacco.findFirst({
      where: {
        brand: { contains: brandGuess },
        flavor: { contains: flavorGuess },
        active: true,
      },
    })
    if (byName) return byName
  }
  // 4. Только по flavor (если есть)
  if (flavor) {
    const byFlavor = await db.tobacco.findFirst({
      where: { flavor: { contains: flavor }, active: true },
    })
    if (byFlavor) return byFlavor
  }
  return null
}

async function findConsumableFuzzy(name: string) {
  // 1. Точное совпадение по имени (case-insensitive для SQLite через equals)
  const exact = await db.consumable.findFirst({
    where: { name: name, active: true },
  })
  if (exact) return exact
  // 2. Содержит имя
  const contains = await db.consumable.findFirst({
    where: { name: { contains: name }, active: true },
  })
  if (contains) return contains
  // 3. Имя содержит существующее название расходника
  const all = await db.consumable.findMany({ where: { active: true } })
  for (const c of all) {
    if (name.toLowerCase().includes(c.name.toLowerCase())) return c
  }
  return null
}

function extractBrandFromName(name: string): string {
  // Первый токен имени — обычно бренд
  const parts = name.split(/\s+/).filter(Boolean)
  return parts[0] || name
}
