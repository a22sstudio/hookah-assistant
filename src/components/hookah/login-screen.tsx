'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Leaf, Loader2, Lock, ArrowRight, Send } from 'lucide-react'
import { Master } from '@/lib/types'
import { toast } from 'sonner'

interface LoginScreenProps {
  onLogin: (master: Master) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [pin, setPin] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  const handleChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1)
    setError(null)
    const next = [...pin]
    next[i] = digit
    setPin(next)
    if (digit && i < 3) {
      inputsRef.current[i + 1]?.focus()
    }
    // Если все 4 цифры введены — автосабмит
    if (digit && next.every((d) => d !== '') && i === 3) {
      void submit(next.join(''))
    } else if (digit && next.every((d) => d !== '') && i < 3) {
      // Завершение, если пользователь ввёл последнюю через middle-paste — никогда. ОК.
    }
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) {
      inputsRef.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      inputsRef.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && i < 3) {
      inputsRef.current[i + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!text) return
    const next = ['', '', '', '']
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setPin(next)
    setError(null)
    if (text.length === 4) {
      void submit(text)
    } else {
      inputsRef.current[text.length]?.focus()
    }
  }

  const submit = async (pinValue: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Неверный PIN')
        setPin(['', '', '', ''])
        inputsRef.current[0]?.focus()
        return
      }
      if (data.master) {
        toast.success(`Добро пожаловать, ${data.master.name}`)
        onLogin(data.master as Master)
      }
    } catch {
      setError('Ошибка соединения')
      setPin(['', '', '', ''])
      inputsRef.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const filled = pin.every((d) => d !== '')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-background">
      {/* Декоративные пятна на фоне */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-700/20" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-teal-300/30 blur-3xl dark:bg-teal-700/20" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Логотип */}
        <div className="flex flex-col items-center mb-6">
          <div className="rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 p-4 shadow-lg shadow-emerald-500/30 mb-4">
            <Leaf className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center">
            Кальянный ассистент
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Вход по PIN-коду</p>
        </div>

        <Card className="border-emerald-200/60 dark:border-emerald-900/60 shadow-xl">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span className="text-xs">Введите 4-значный PIN</span>
              </div>

              <div
                className="flex gap-3 justify-center"
                onPaste={handlePaste}
              >
                {pin.map((d, i) => (
                  <Input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={d}
                    disabled={loading}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={`h-14 w-12 text-center text-2xl font-bold rounded-lg ${
                      error
                        ? 'border-rose-400 focus-visible:ring-rose-300'
                        : d
                          ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                          : ''
                    }`}
                    aria-label={`Цифра ${i + 1}`}
                  />
                ))}
              </div>

              {error && (
                <p className="text-sm text-rose-600 dark:text-rose-400 font-medium animate-in fade-in">
                  {error}
                </p>
              )}

              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-base"
                disabled={!filled || loading}
                onClick={() => filled && void submit(pin.join(''))}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Вход...
                  </>
                ) : (
                  <>
                    Войти <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Подсказка демо-пинов */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Демо-доступ:
          </p>
          <div className="mt-2 flex items-center justify-center gap-2 flex-wrap text-xs">
            <button
              onClick={() => {
                setPin(['1', '1', '1', '1'])
                void submit('1111')
              }}
              className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-3 py-1 font-mono font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
              disabled={loading}
            >
              Старший: 1111
            </button>
            <button
              onClick={() => {
                setPin(['2', '2', '2', '2'])
                void submit('2222')
              }}
              className="rounded-full bg-sky-100 dark:bg-sky-950 px-3 py-1 font-mono font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-200 dark:hover:bg-sky-900 transition-colors"
              disabled={loading}
            >
              Мастер: 2222
            </button>
            <button
              onClick={() => {
                setPin(['3', '3', '3', '3'])
                void submit('3333')
              }}
              className="rounded-full bg-violet-100 dark:bg-violet-950 px-3 py-1 font-mono font-medium text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900 transition-colors"
              disabled={loading}
            >
              Мастер: 3333
            </button>
          </div>

          {/* Альтернативный вход через Telegram-бота */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Send className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            <span>
              Или войдите через Telegram:{' '}
              <span className="font-medium text-foreground">@Defowork_bot</span>{' '}
              → <span className="font-mono">/claim ВАШ_PIN</span>
            </span>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-8">
          Нажмите на демо-PIN для быстрого входа
        </p>
      </div>
    </div>
  )
}
