import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// POST /api/admin/import-tobaccos
// Принимает multipart/form-data с полем "file" (.xlsx)
// Парсит Excel и заливает в БД.
// ВАЖНО: перед импортом удаляет все существующие табаки (и их остатки!).
// Только SENIOR + admin token.
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentMaster()
    if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    if (me.role !== 'SENIOR') {
      return NextResponse.json({ error: 'Только старший' }, { status: 403 })
    }

    const authHeader = req.headers.get('x-admin-token')
    const expectedToken = process.env.BOT_SECRET || 'hookah-secret-2024'
    if (authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Неверный admin токен' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не загружен' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Нужен файл .xlsx' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Парсим Excel через SheetJS
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // Получаем данные как массив объектов
    const rows: unknown[] = XLSX.utils.sheet_to_json(sheet, { defval: null })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'В файле нет данных' }, { status: 400 })
    }

    // Нормализуем и фильтруем
    interface ParsedRow {
      brand: string
      line: string
      flavor: string
      strength: string | null
      flavorProfile: string | null
      pairings: string | null
      mixRecipes: string | null
    }

    const EMPTY_VALS = new Set([
      'Не указана в файле',
      'Не подтверждено в ATLAS',
      'Бренд не найден в каталоге ATLAS. Данные не заимствовались из других источников.',
      'Нет данных: позиция не сопоставлена.',
      'Нет данных: позиция не сопоставлена; рецепт и проценты не добавлены.',
    ])

    const cleanField = (val: unknown): string | null => {
      if (val === null || val === undefined) return null
      const s = String(val).trim()
      if (!s) return null
      if (EMPTY_VALS.has(s)) return null
      return s
    }

    const parsed: ParsedRow[] = []
    for (const row of rows) {
      const r = row as Record<string, unknown>
      // Колонки: "Название табака", "Название линейки", "Название вкуса (RU / EN)",
      // "Крепость вкуса", "Какой это вкус", "Сочетания с этим вкусом",
      // "Конкретные миксы: состав, описание и проценты"
      const brand = cleanField(r['Название табака'])
      const line = cleanField(r['Название линейки']) || ''
      const flavor = cleanField(r['Название вкуса (RU / EN)'])

      if (!brand || !flavor) continue

      parsed.push({
        brand: brand.trim(),
        line: line.trim(),
        flavor: flavor.trim(),
        strength: cleanField(r['Крепость вкуса']),
        flavorProfile: cleanField(r['Какой это вкус']),
        pairings: cleanField(r['Сочетания с этим вкусом']),
        mixRecipes: cleanField(r['Конкретные миксы: состав, описание и проценты']),
      })
    }

    if (parsed.length === 0) {
      return NextResponse.json({ error: 'Не удалось распознать ни одной позиции' }, { status: 400 })
    }

    // ─── Очищаем существующие табаки ───
    // Сначала удалим операции и orderRequests (cascade не сработает если есть записи)
    // Используем транзакцию
    const result = await db.$transaction(async (tx) => {
      // Удаляем всё что есть (cascade должен сработать)
      const deletedOperations = await tx.operation.deleteMany({})
      const deletedOrders = await tx.orderRequest.deleteMany({})
      const deletedStock = await tx.stockItem.deleteMany({})
      const deletedTobaccos = await tx.tobacco.deleteMany({})

      // Создаём новые табаки
      let created = 0
      let skipped = 0

      // Группируем по brand+line+flavor для дедупликации (берём первый)
      const seen = new Set<string>()
      const unique: ParsedRow[] = []
      for (const p of parsed) {
        const key = `${p.brand}|||${p.line}|||${p.flavor}`.toLowerCase()
        if (seen.has(key)) {
          skipped++
          continue
        }
        seen.add(key)
        unique.push(p)
      }

      // Создаём пачками (createMany не поддерживает unique constraint conflicts через SQLite)
      for (const p of unique) {
        try {
          await tx.tobacco.create({
            data: {
              brand: p.brand,
              line: p.line,
              flavor: p.flavor,
              defaultJarGrams: 250,
              thresholdGrams: 70,
              active: true,
              strength: p.strength,
              flavorProfile: p.flavorProfile,
              pairings: p.pairings,
              mixRecipes: p.mixRecipes,
            },
          })
          created++
        } catch {
          skipped++
        }
      }

      return {
        deleted: {
          operations: deletedOperations.count,
          orders: deletedOrders.count,
          stockItems: deletedStock.count,
          tobaccos: deletedTobaccos.count,
        },
        created,
        skipped,
        total: unique.length,
      }
    })

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('import-tobaccos error:', e)
    return NextResponse.json(
      { error: 'Не удалось импортировать', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
