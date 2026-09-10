import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    name: 'Hookah Master Assistant',
    version: '0.1.0',
    description: 'AI-ассистент старшего кальянного мастера',
    endpoints: {
      chat: '/api/chat',
      vlm: '/api/vlm',
      asr: '/api/asr',
      tobaccos: '/api/tobaccos',
      operations: '/api/operations',
      orders: '/api/orders',
    },
  })
}
