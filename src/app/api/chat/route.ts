import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { tryHandleWithParser } from '@/lib/bot-intent-handler'
import { processMasterMessage } from '@/lib/ai'

// POST /api/chat — главная точка общения с AI
// body: { message: string, source?: 'TEXT'|'VOICE'|'PHOTO', transcribedText?: string, invoiceItems?: [...] }
//
// Двухуровневая обработка:
// 1. Intent parser (мгновенно, без LLM) — для табачных операций
// 2. LLM fallback — для сложных запросов (график, зарплата, свободная речь)
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentMaster()
    if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await req.json()
    const { message, source, transcribedText, invoiceItems } = body

    if (!message && !transcribedText && !invoiceItems) {
      return NextResponse.json({ error: 'Не передано сообщение' }, { status: 400 })
    }

    // ─── Шаг 1: пробуем intent parser (мгновенно, без LLM) ───
    // Только если нет invoiceItems (накладная обрабатывается через LLM)
    if (!invoiceItems) {
      try {
        const result = await tryHandleWithParser(message || transcribedText || '', me.id)
        if (result.handled) {
          return NextResponse.json({
            reply: result.reply,
            actions: [],
            executedActions: [],
            source: 'parser',  // помечаем что это не LLM
          })
        }
      } catch (e) {
        console.error('Intent parser error:', (e as Error).message)
        // продолжаем к LLM
      }
    }

    // ─── Шаг 2: LLM fallback (для сложных запросов) ───
    const result = await processMasterMessage(message || '', {
      source: source ?? 'TEXT',
      transcribedText,
      invoiceItems,
      masterId: me.id,
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
