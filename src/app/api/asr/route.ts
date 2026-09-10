import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/ai'

// POST /api/asr — транскрипция голосового сообщения
// body: { audio: string } — base64 аудио
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { audio } = body

    if (!audio) {
      return NextResponse.json({ error: 'Не передано аудио (audio base64)' }, { status: 400 })
    }

    const text = await transcribeAudio(audio)
    return NextResponse.json({ text })
  } catch (e) {
    console.error('ASR API error:', e)
    return NextResponse.json(
      { error: 'Ошибка транскрипции', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
