import { cookies } from 'next/headers'
import { db } from '@/lib/db'

export type Role = 'SENIOR' | 'REGULAR'

export interface SessionMaster {
  id: string
  name: string
  role: Role
  color: string
}

const COOKIE_NAME = 'hm_session'

// Получить текущего мастера из сессии (для server components / API)
export async function getCurrentMaster(): Promise<SessionMaster | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionId) return null

  const master = await db.master.findFirst({
    where: { id: sessionId, active: true },
  })
  if (!master) return null

  return {
    id: master.id,
    name: master.name,
    role: master.role as Role,
    color: master.color,
  }
}

// Установить сессию (в API route)
export async function setSession(masterId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, masterId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 дней
  })
}

// Сбросить сессию
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export { COOKIE_NAME }
