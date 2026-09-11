'use client'

import { useEffect, useState } from 'react'
import { LoginScreen } from '@/components/hookah/login-screen'
import { MasterView } from '@/components/hookah/master-view'
import { SeniorView } from '@/components/hookah/senior-view'
import { Loader2 } from 'lucide-react'
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
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-background">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-[60px] flex items-center gap-3">
            <span className="label-mono">Кальянный ассистент</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 fade-in">
            <Loader2 className="h-6 w-6 animate-spin text-ember" />
            <p className="label-mono">Загрузка...</p>
          </div>
        </main>
        <footer className="mt-auto border-t border-border bg-background">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 label-mono-sm">
            Кальянный ассистент · powered by z.ai
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
