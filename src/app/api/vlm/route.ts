import { NextRequest, NextResponse } from 'next/server'
import { recognizeInvoice } from '@/lib/ai'

// POST /api/vlm — распознавание накладной по фото
// body: { image: string } — base64 (с data: или без)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { image } = body

    if (!image) {
      return NextResponse.json({ error: 'Не передано изображение (image base64)' }, { status: 400 })
    }

    const items = await recognizeInvoice(image)
    return NextResponse.json({ items, count: items.length })
  } catch (e) {
    console.error('VLM API error:', e)
    return NextResponse.json(
      { error: 'Ошибка распознавания', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
