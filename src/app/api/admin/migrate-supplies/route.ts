import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/admin/migrate-supplies — добавляет недостающие колонки в таблицы Supply и SupplyItem
// через raw SQL (Prisma Client $executeRaw). Не требует prisma CLI.
//
// Используется когда Railway не смог запустить db:push (OOM при установке prisma через npx).
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

    const results: Array<{ step: string; ok: boolean; message: string }> = []

    // ─── Шаг 1: создаём таблицу Supply если её нет ───
    try {
      await db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "Supply" (
          "id" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'DRAFT',
          "note" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "receivedAt" TIMESTAMP(3),
          CONSTRAINT "Supply_pkey" PRIMARY KEY ("id")
        )
      `
      results.push({ step: 'create Supply table', ok: true, message: 'OK' })
    } catch (e) {
      results.push({ step: 'create Supply table', ok: false, message: (e as Error).message })
    }

    // ─── Шаг 2: создаём таблицу SupplyItem если её нет ───
    try {
      await db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "SupplyItem" (
          "id" TEXT NOT NULL,
          "supplyId" TEXT NOT NULL,
          "itemType" TEXT NOT NULL,
          "itemId" TEXT,
          "brand" TEXT,
          "line" TEXT,
          "flavor" TEXT,
          "name" TEXT NOT NULL,
          "packGrams" INTEGER,
          "quantity" INTEGER NOT NULL DEFAULT 1,
          "unit" TEXT NOT NULL DEFAULT 'шт',
          CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
        )
      `
      results.push({ step: 'create SupplyItem table', ok: true, message: 'OK' })
    } catch (e) {
      results.push({ step: 'create SupplyItem table', ok: false, message: (e as Error).message })
    }

    // ─── Шаг 3: добавляем недостающие колонки в Supply ───
    // receivedAt (основная причина 500 на Railway)
    try {
      await db.$executeRaw`ALTER TABLE "Supply" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3)`
      results.push({ step: 'Supply.receivedAt', ok: true, message: 'column ready' })
    } catch (e) {
      results.push({ step: 'Supply.receivedAt', ok: false, message: (e as Error).message })
    }

    // note
    try {
      await db.$executeRaw`ALTER TABLE "Supply" ADD COLUMN IF NOT EXISTS "note" TEXT`
      results.push({ step: 'Supply.note', ok: true, message: 'column ready' })
    } catch (e) {
      results.push({ step: 'Supply.note', ok: false, message: (e as Error).message })
    }

    // status (default DRAFT)
    try {
      await db.$executeRaw`ALTER TABLE "Supply" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT'`
      results.push({ step: 'Supply.status', ok: true, message: 'column ready' })
    } catch (e) {
      results.push({ step: 'Supply.status', ok: false, message: (e as Error).message })
    }

    // createdAt
    try {
      await db.$executeRaw`ALTER TABLE "Supply" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
      results.push({ step: 'Supply.createdAt', ok: true, message: 'column ready' })
    } catch (e) {
      results.push({ step: 'Supply.createdAt', ok: false, message: (e as Error).message })
    }

    // ─── Шаг 4: добавляем недостающие колонки в SupplyItem ───
    const supplyItemColumns = [
      { name: 'supplyId', type: 'TEXT NOT NULL' },
      { name: 'itemType', type: 'TEXT NOT NULL' },
      { name: 'itemId', type: 'TEXT' },
      { name: 'brand', type: 'TEXT' },
      { name: 'line', type: 'TEXT' },
      { name: 'flavor', type: 'TEXT' },
      { name: 'name', type: 'TEXT NOT NULL' },
      { name: 'packGrams', type: 'INTEGER' },
      { name: 'quantity', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'unit', type: 'TEXT NOT NULL DEFAULT \'шт\'' },
    ]

    for (const col of supplyItemColumns) {
      try {
        await db.$executeRawUnsafe(
          `ALTER TABLE "SupplyItem" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`,
        )
        results.push({ step: `SupplyItem.${col.name}`, ok: true, message: 'column ready' })
      } catch (e) {
        results.push({ step: `SupplyItem.${col.name}`, ok: false, message: (e as Error).message })
      }
    }

    // ─── Шаг 5: индексы ───
    try {
      await db.$executeRaw`CREATE INDEX IF NOT EXISTS "Supply_status_idx" ON "Supply"("status")`
      await db.$executeRaw`CREATE INDEX IF NOT EXISTS "Supply_createdAt_idx" ON "Supply"("createdAt")`
      await db.$executeRaw`CREATE INDEX IF NOT EXISTS "SupplyItem_supplyId_idx" ON "SupplyItem"("supplyId")`
      results.push({ step: 'indexes', ok: true, message: 'OK' })
    } catch (e) {
      results.push({ step: 'indexes', ok: false, message: (e as Error).message })
    }

    // ─── Шаг 6: foreign key SupplyItem.supplyId → Supply.id (опционально) ───
    try {
      await db.$executeRaw`
        ALTER TABLE "SupplyItem"
        ADD CONSTRAINT IF NOT EXISTS "SupplyItem_supplyId_fkey"
        FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE CASCADE
      `
      results.push({ step: 'FK SupplyItem→Supply', ok: true, message: 'OK' })
    } catch (e) {
      // FK может конфликтовать, если уже есть с другим именем — не критично
      results.push({ step: 'FK SupplyItem→Supply', ok: false, message: (e as Error).message })
    }

    const okCount = results.filter((r) => r.ok).length
    return NextResponse.json({
      ok: okCount === results.length,
      okCount,
      total: results.length,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('migrate-supplies error:', e)
    return NextResponse.json(
      { error: 'migration failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
