import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/operations — история операций
// query: ?limit=50&tobaccoId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? 50)
  const tobaccoId = searchParams.get('tobaccoId')

  const operations = await db.operation.findMany({
    where: tobaccoId ? { tobaccoId } : undefined,
    include: { tobacco: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const result = operations.map((op) => ({
    id: op.id,
    type: op.type,
    gramsBefore: op.gramsBefore,
    gramsAfter: op.gramsAfter,
    delta: op.delta,
    source: op.source,
    note: op.note,
    rawInput: op.rawInput,
    createdAt: op.createdAt,
    tobacco: op.tobacco
      ? { id: op.tobacco.id, brand: op.tobacco.brand, line: op.tobacco.line, flavor: op.tobacco.flavor }
      : null,
  }))

  return NextResponse.json({ operations: result, total: result.length })
}
