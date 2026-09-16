import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/supplies/[id]/attachment?kind=photo|pdf
// Возвращает base64 аттачмента поставки (SENIOR only — supplies вообще только SENIOR)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind') || 'photo'

  const supply = await db.supply.findUnique({ where: { id } })
  if (!supply) {
    return NextResponse.json({ error: 'Поставка не найдена' }, { status: 404 })
  }

  const base64 =
    kind === 'pdf' ? supply.pdfBase64 : kind === 'photo' ? supply.photoBase64 : null

  if (!base64) {
    return NextResponse.json({ error: 'Аттачмент не найден' }, { status: 404 })
  }

  return NextResponse.json({ base64 })
}
