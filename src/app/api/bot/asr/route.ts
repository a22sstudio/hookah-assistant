import { NextRequest, NextResponse } from 'next/server'
import { checkBotSecret } from '@/lib/bot-auth'
import { transcribeAudio } from '@/lib/ai'

// POST /api/bot/asr — транскрипция аудио (base64)
// body: { audio: string }
export async function POST(req: NextRequest) {
  const authError = checkBotSecret(req)
  if (authError) return authError

  try {
    const { audio } = await req.json()
    if (!audio) {
      return NextResponse.json({ error: 'audio base64 обязателен' }, { status: 400 })
    }
    const text = await transcribeAudio(audio)
    return NextResponse.json({ text })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ошибка ASR', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
