'use client'

import { useEffect, useState } from 'react'
import { LoginScreen } from '@/components/hookah/login-screen'
import { MasterView } from '@/components/hookah/master-view'
import { SeniorView } from '@/components/hookah/senior-view'
import { Leaf, Loader2 } from 'lucide-react'
import { Master } from '@/lib/types'

export default function Home() {
  const [master, setMaster] = useState<Master | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        if (!cancelled) {
          setMaster(data.master ?? null)
        }
      } catch {
        // без сессии
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Лоадер первой загрузки
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-background">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2 shadow-sm">
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-base sm:text-lg leading-tight truncate">
                Кальянный ассистент
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                AI-учёт табака
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-sm">Загрузка...</p>
          </div>
        </main>
        <footer className="mt-auto border-t bg-background">
          <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-muted-foreground">
            Кальянный ассистент · powered by Z.ai
          </div>
        </footer>
      </div>
    )
  }

  // Не авторизован — экран входа
  if (!master) {
    return <LoginScreen onLogin={(m) => setMaster(m)} />
  }

  // Авторизован — соответствующий экран
  if (master.role === 'SENIOR') {
    return <SeniorView master={master} onLogout={() => setMaster(null)} />
  }

  return <MasterView master={master} onLogout={() => setMaster(null)} />
}
