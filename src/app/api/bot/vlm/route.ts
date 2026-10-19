import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret } from '@/lib/bot-auth'
import { recognizeInvoice } from '@/lib/ai'

// POST /api/bot/vlm — распознавание накладной (base64 image)
// body: { image: string }
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { image } = await req.json()
    if (!image) {
      return NextResponse.json({ error: 'image base64 обязателен' }, { status: 400 })
    }
    const items = await recognizeInvoice(image)
    return NextResponse.json({ items, count: items.length })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка VLM', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
