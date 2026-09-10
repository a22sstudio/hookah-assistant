import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth'

// POST /api/auth/logout — выход
export async function POST() {
  await clearSession()
  return NextResponse.json({ ok: true })
}
