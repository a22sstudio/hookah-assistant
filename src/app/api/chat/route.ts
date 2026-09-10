import { NextRequest, NextResponse } from 'next/server'
import { processMasterMessage } from '@/lib/ai'

// POST /api/chat — главная точка общения с AI
// body: { message: string, source?: 'TEXT'|'VOICE'|'PHOTO', transcribedText?: string, invoiceItems?: [...] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, source, transcribedText, invoiceItems } = body

    if (!message && !transcribedText && !invoiceItems) {
      return NextResponse.json({ error: 'Не передано сообщение' }, { status: 400 })
    }

    const result = await processMasterMessage(message || '', {
      source: source ?? 'TEXT',
      transcribedText,
      invoiceItems,
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error('Chat API error:', e)
    return NextResponse.json(
      { error: 'Ошибка обработки', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
