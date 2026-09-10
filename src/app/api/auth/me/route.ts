import { NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/auth/me — текущий мастер
export async function GET() {
  const master = await getCurrentMaster()
  if (!master) {
    return NextResponse.json({ master: null }, { status: 200 })
  }
  return NextResponse.json({ master })
}
